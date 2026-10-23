import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { ScanWorkflow } from "./scan-workflow";
import { createPageMonitorService } from "./service";
import { storeFor } from "./page-store-test-fixtures";
import { EXTRACTION_MODELS } from "./quote-snapshot";
import { HistoryNotReadyError } from "@pricelog/api/pricing-history-repository";

vi.mock("cloudflare:workers", () => ({ DurableObject: class {}, WorkflowEntrypoint: class {} }));
vi.mock("./drizzle/migrations.js", () => ({ default: { migrations: {} } }));
vi.mock("../env.server", () => ({ ENV: { DB: {}, PAGE_STORE: {}, ARTIFACTS: {} } }));
vi.mock("./url", async (original) => ({
  ...(await original<typeof import("./url")>()),
  resolveDnsAddresses: async () => ["93.184.216.34"],
}));

describe("capture to D1 history", () => {
  it("collects through the workflow, archives terminal history, and serves the exact saved source without public DO reads", async () => {
    const fixture = storeFor("one");
    try {
      await (fixture.store as unknown as { seedRubric(): Promise<void> }).seedRubric();
      const run = await fixture.store.triggerManual("owner");
      const objects = new Map<string, string | Uint8Array>();
      const artifacts = {
        put: async (key: string, value: string | Uint8Array) => {
          objects.set(key, value);
        },
        get: async (key: string) => {
          const value = objects.get(key);
          return value === undefined
            ? null
            : {
                text: async () =>
                  typeof value === "string" ? value : new TextDecoder().decode(value),
              };
        },
      };
      const namespace = { getByName: () => fixture.store };
      const ai = vi.fn(
        async (
          model: string,
          input: {
            response_format?: { json_schema: { properties: Record<string, unknown> } };
            questions?: Record<string, { type: string; criteria: Record<string, string> }>;
          },
        ) => {
          if ((EXTRACTION_MODELS as readonly string[]).includes(model))
            return {
              response: input.response_format?.json_schema.properties.prices
                ? { prices: [{ plan: "Pro", text: "$20 per month", state: "default" }] }
                : { features: [] },
            };
          return {
            result: {
              model: "jev-1.13.0",
              answers: Object.fromEntries(
                Object.entries(input.questions ?? {}).map(([key, question]) => {
                  if (question.type === "noul") return [key, { noul: 0.1 }];
                  const choice =
                    key === "price_0" ? "flat_monthly" : Object.keys(question.criteria)[0]!;
                  return [key, { choice, confidence: 0.95, probabilities: { [choice]: 0.95 } }];
                }),
              ),
            },
          };
        },
      );
      const workflow: ScanWorkflow = Object.assign(Object.create(ScanWorkflow.prototype), {
        env: {
          DB: fixture.history.binding,
          PAGE_STORE: namespace,
          ARTIFACTS: artifacts,
          AI: { run: ai },
          BROWSER: {
            quickAction: async () =>
              Response.json({
                success: true,
                result: {
                  content: "<h1>Pricing</h1><p>Pro $20 per month</p>",
                  markdown: "# Pricing\n## Pro\n$20 per month",
                  screenshot: "eA==",
                },
                meta: { status: 200, title: "One", finalUrl: "https://one.com/pricing" },
              }),
          },
        },
      });
      await workflow.run(
        {
          payload: {
            pageId: "one",
            normalizedDomain: "one.com",
            canonicalUrl: "https://one.com/pricing",
            runId: run.id,
            trigger: "manual",
          },
        } as Parameters<ScanWorkflow["run"]>[0],
        {
          do: async (...args: unknown[]) => (args.at(-1) as () => unknown)(),
        } as unknown as Parameters<ScanWorkflow["run"]>[1],
      );
      expect(
        fixture.sqlite.prepare("SELECT id FROM scan_run WHERE id=?").get(run.id),
      ).toBeUndefined();
      expect((await fixture.history.repo.getRun("one", run.id))?.status).toBe("succeeded");
      const noPublicDo = vi.fn(() => {
        throw new Error("Public history must not read the DO");
      });
      const env = {
        DB: fixture.history.binding,
        PAGE_STORE: { getByName: noPublicDo },
        ARTIFACTS: artifacts,
      } as unknown as Parameters<typeof createPageMonitorService>[0];
      const service = createPageMonitorService(env, fixture.history.db);
      const page = await service.getPublicPage("one.com", "one");
      expect(page.versions.map((row) => row.runId)).toEqual([run.id]);
      expect(page.version?.snapshot?.offers[0]?.name).toBe("Pro");
      const source = await service.getPublicSource("one.com", "one", run.id);
      expect(source?.contentType).toBe("text/markdown; charset=utf-8");
      const saved = await artifacts.get(source!.key);
      const text = await saved!.text();
      expect(text).toBe("# Pricing\n## Pro\n$20 per month");
      const manifest = fixture.history.sqlite
        .prepare("SELECT content_sha256 FROM history_capture WHERE page_id='one'")
        .get();
      expect(createHash("sha256").update(text).digest("hex")).toBe(manifest?.content_sha256);
      expect(await service.getPublicSource("example.com", "one", run.id)).toBeNull();
      expect(noPublicDo).not.toHaveBeenCalled();
      expect(ai).toHaveBeenCalledTimes(3);
    } finally {
      fixture.sqlite.close();
      fixture.history.sqlite.close();
    }
  });

  it("returns an explicit readiness error while owner workspace reads survive a D1 outage", async () => {
    const fixture = storeFor("one");
    try {
      const env = {
        DB: fixture.history.binding,
        PAGE_STORE: { getByName: () => fixture.store },
        ARTIFACTS: {},
      } as unknown as Parameters<typeof createPageMonitorService>[0];
      const service = createPageMonitorService(env, fixture.history.db);
      await expect(service.getPublicPage("one.com", "one")).rejects.toBeInstanceOf(
        HistoryNotReadyError,
      );
      const run = await fixture.store.triggerManual("owner");
      await fixture.store.persistVersion(run.id, {
        capturedAt: 1000,
        httpStatus: 200,
        finalUrl: "https://one.com/pricing",
        title: "One",
        htmlKey: "html",
        screenshotKey: "png",
        contentKey: "md",
        htmlSha256: "h",
        screenshotSha256: "s",
        contentSha256: "c",
        htmlBytes: 1,
        screenshotBytes: 1,
        contentBytes: 1,
      });
      const failed = vi.spyOn(fixture.history.binding, "prepare").mockImplementation(() => {
        throw new Error("D1 unavailable");
      });
      expect((await service.getRun("one.com", run.id))?.id).toBe(run.id);
      expect(await service.getArtifact("one.com", run.id, "content")).toMatchObject({ key: "md" });
      failed.mockRestore();
    } finally {
      fixture.sqlite.close();
      fixture.history.sqlite.close();
    }
  });
});
