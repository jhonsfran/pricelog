import { describe, expect, it, vi } from "vitest";
import { createDb } from "@my-better-t-app/db";
import { ScanWorkflow } from "./scan-workflow";
import { PRICING_INTELLIGENCE_RUBRIC } from "./rubric";
import { EXTRACTION_MODEL } from "./quote-snapshot";
import type { PersistedQuestion } from "./types";

vi.mock("cloudflare:workers", () => ({ WorkflowEntrypoint: class {} }));
vi.mock("@my-better-t-app/db", () => ({ createDb: vi.fn() }));
vi.mock("./url", () => ({
  normalizePricingUrl: async () => ({
    canonicalUrl: "https://example.com/pricing",
    normalizedDomain: "example.com",
  }),
  resolveDnsAddresses: vi.fn(),
}));

const OFFERS = {
  offers: [{ name: "Pro", prices: [{ text: "$20 per month", state: "default" }], limits: [] }],
};
const CHOICES: Record<string, string> = {
  buying_motion: "self_serve",
  price_disclosure: "full",
  primary_customer_segment: "small_business",
  primary_market: "developer_tools",
  product_category: "coding_assistants",
  price_0_role: "base_price",
  price_0_billing: "monthly",
  price_0_period: "month",
  price_0_unit: "flat",
};
const STATE_HTML = `<h1>Pricing</h1><script type="application/json" id="pricelog-state">${JSON.stringify(
  {
    version: 1,
    billingView: "monthly",
    blocks: [
      { label: "default", text: "# Pricing\n## Pro\n$20 per month" },
      { label: "billing=Yearly", text: "(within: ## Pro)\n$16 per month" },
    ],
  },
)}</script>`;

function setup(
  failure?: "start" | "capture" | "complete" | "projection" | "evaluation" | "extraction" | "stage",
  sourceMarkdown = "# Pricing\nPro: $20 per month",
  accessibilityTree?: unknown,
  capturedHtml = "<h1>Pricing</h1>",
) {
  let status = "running";
  let prepared = false;
  const store = {
    markRunning: vi.fn(),
    setStage: vi.fn(async (_runId: string, stage: string) => {
      if (failure === "stage" && stage === "draft") throw new Error("Page store unavailable");
    }),
    recordEvent: vi.fn(),
    persistVersion: vi.fn(),
    persistAnswers: vi.fn(),
    persistEvaluation: vi.fn(),
    getActiveRubric: async () => ({
      id: PRICING_INTELLIGENCE_RUBRIC.id,
      questions: Object.entries(PRICING_INTELLIGENCE_RUBRIC.questions).map(
        ([key, question], position) => ({
          ...question,
          key,
          position,
          minimum: null,
          maximum: null,
        }),
      ),
    }),
    preparePublication: vi.fn(async () => {
      prepared = true;
    }),
    publishPending: vi.fn(async () => {
      expect(status).toBe("succeeded");
      if (failure === "projection") throw new Error("D1 unavailable");
    }),
    completeSuccess: vi.fn(async () => {
      expect(prepared).toBe(true);
      if (failure === "complete") throw new Error("DO completion failed");
      status = "succeeded";
      return Date.now() + 604800000;
    }),
    getRun: async () => ({ status, createdAt: 1000 }),
    completeFailure: vi.fn(async () => {
      status = "failed";
      return Date.now() + 86400000;
    }),
  };
  let ownerWrites = 0;
  const write = {
    values: () => ({
      onConflictDoUpdate: async () => {
        ownerWrites++;
        if (failure === "start" && ownerWrites === 1) throw new Error("D1 start unavailable");
      },
    }),
    set: () => ({ where: async () => undefined }),
  };
  vi.mocked(createDb).mockReturnValue({
    insert: () => write,
    update: () => write,
  } as unknown as ReturnType<typeof createDb>);
  const ai = vi.fn(
    async (
      model: string,
      input: {
        state?: string;
        questions?: Record<string, PersistedQuestion>;
        messages?: { role: string; content: string }[];
        response_format?: { json_schema: { properties: Record<string, unknown> } };
      },
    ) => {
      if (model === EXTRACTION_MODEL) {
        if (failure === "extraction") return { response: "{truncated" };
        return "offers" in input.response_format!.json_schema.properties
          ? { response: OFFERS, usage: { prompt_tokens: 100, completion_tokens: 20 } }
          : { response: { features: [] }, usage: { prompt_tokens: 100, completion_tokens: 5 } };
      }
      if (failure === "evaluation") throw new Error("Evaluation failed");
      return {
        result: {
          model: "jev-1.13.0",
          answers: Object.fromEntries(
            Object.entries(input.questions!).map(([key, question]) => [
              key,
              question.type === "noul"
                ? { noul: key === "has_free_plan" ? 0.95 : 0.05 }
                : {
                    choice: CHOICES[key],
                    confidence: 0.9,
                    probabilities: { [CHOICES[key]!]: 0.9 },
                  },
            ]),
          ),
        },
      };
    },
  );
  const artifacts = new Map<string, string>();
  const browser = vi.fn(async (action: string, _options: Record<string, unknown>) => {
    if (failure === "capture" && action === "snapshot")
      throw new Error("WebSocket connection failed.");
    return Response.json({
      success: true,
      result: {
        content: capturedHtml,
        markdown: sourceMarkdown,
        screenshot: "eA==",
        accessibilityTree,
      },
      meta: { status: 200, title: "Pricing" },
    });
  });
  const workflow: ScanWorkflow = Object.assign(Object.create(ScanWorkflow.prototype), {
    env: {
      DB: {},
      PAGE_STORE: { getByName: () => store },
      AI: { run: ai },
      ARTIFACTS: {
        put: async (key: string, content: string | Uint8Array) => {
          if (typeof content === "string") artifacts.set(key, content);
        },
        get: async (key: string) => ({ text: async () => artifacts.get(key) ?? "" }),
      },
      BROWSER: { quickAction: browser },
    },
  });
  const event = {
    payload: {
      pageId: "page",
      runId: "run",
      normalizedDomain: "example.com",
      canonicalUrl: "https://example.com/pricing",
      trigger: "manual",
    },
  } as Parameters<ScanWorkflow["run"]>[0];
  const step = {
    do: async (...args: unknown[]) => (args.at(-1) as () => unknown)(),
  } as unknown as Parameters<ScanWorkflow["run"]>[1];
  return {
    run: () => workflow.run(event, step),
    ai,
    browser,
    store,
    status: () => status,
    archivedMarkdown: () => artifacts.get("pages/example.com/runs/run/page.md"),
  };
}

describe("scan publication boundaries", () => {
  it("extracts, grounds and verifies quotes from the captured page state", async () => {
    const scan = setup(undefined, "# Pricing\nPro: $20 per month", undefined, STATE_HTML);
    await scan.run();
    const [, options] = scan.browser.mock.calls[0]!;
    expect(options).toMatchObject({
      waitForSelector: { selector: "#pricelog-state-ready", timeout: 30_000 },
    });
    expect((options as { addScriptTag: unknown[] }).addScriptTag).toHaveLength(2);
    expect(scan.archivedMarkdown()).toBe(
      "## state: default\n# Pricing\n## Pro\n$20 per month\n\n## state: billing=Yearly\n(within: ## Pro)\n$16 per month",
    );
    expect(scan.ai.mock.calls.map(([model]) => model)).toEqual([
      EXTRACTION_MODEL,
      EXTRACTION_MODEL,
      "typesafe/jev",
    ]);
    expect(scan.ai.mock.calls[2]?.[1].state).toBe(scan.archivedMarkdown());
    expect(scan.store.persistEvaluation).toHaveBeenCalledWith(
      "run",
      expect.objectContaining({
        model: "jev-1.13.0",
        draft: JSON.stringify({ offers: OFFERS, features: { features: [] } }),
        snapshot: {
          version: "pricing-snapshot-v3",
          status: "collected",
          billing_view: "monthly",
          currency_visible: "USD",
          flags: expect.objectContaining({ has_free_plan: true, has_free_trial: false }),
          offers: [
            {
              name: "Pro",
              prices: [
                {
                  role: "base_price",
                  price_raw: "$20 per month",
                  price_numeric: 20,
                  period: "month",
                  unit: "flat",
                  billing: "monthly",
                  state: "default",
                },
              ],
            },
          ],
          features: [],
        },
        review: [{ path: "coverage", reason: "unclaimed", value: "$16" }],
        coverage: { literals: 2, claimed: 1 },
      }),
    );
    expect(scan.store.recordEvent).toHaveBeenCalledWith(
      "run",
      expect.objectContaining({
        stage: "project",
        message:
          "Published 1 offers, 1 prices, and 0 features; 1 review items; quotes cover 1 of 2 price literals",
      }),
    );
  });

  it("falls back to cleaned Markdown when the state script does not finish", async () => {
    const scan = setup(
      undefined,
      "Home\nProducts\n# Pricing\nPro: $20 per month\nThis website uses cookies\nAccept all\nDecline all\nCookie report\n| Name | Provider / Domain | Expiration | Description |\n| --- | --- | --- | --- |\n| _ga | Example | 1 year | Analytics |",
    );
    await scan.run();
    expect(scan.archivedMarkdown()).toBe("Home\nProducts\n# Pricing\nPro: $20 per month");
    expect(scan.store.recordEvent).toHaveBeenCalledWith(
      "run",
      expect.objectContaining({ stage: "archive", kind: "warning" }),
    );
    expect(scan.ai.mock.calls[0]?.[1].messages?.[1]?.content).toBe("# Pricing\nPro: $20 per month");
    expect(scan.ai.mock.calls[2]?.[1].state).toBe("# Pricing\nPro: $20 per month");
    expect(scan.store.persistEvaluation).toHaveBeenCalledWith(
      "run",
      expect.objectContaining({
        snapshot: expect.objectContaining({
          status: "collected",
          offers: [expect.objectContaining({ name: "Pro" })],
        }),
      }),
    );
  });

  it("preserves accessible prices in the Markdown fallback", async () => {
    const scan = setup(undefined, "# Pricing\n\n### Business\n\nper month", {
      role: "RootWebArea",
      children: [
        {
          role: "group",
          children: [
            { role: "heading", name: "Business" },
            { role: "img", name: "$90" },
          ],
        },
      ],
    });
    await scan.run();
    expect(scan.archivedMarkdown()).toContain("### Business\n\n$90\n\nper month");
  });

  it("publishes an unavailable snapshot with a review item when extraction fails", async () => {
    const scan = setup("extraction");
    await scan.run();
    expect(scan.ai.mock.calls.map(([model]) => model)).toEqual([
      EXTRACTION_MODEL,
      EXTRACTION_MODEL,
    ]);
    expect(scan.store.persistEvaluation).toHaveBeenCalledWith(
      "run",
      expect.objectContaining({
        model: "unavailable",
        snapshot: expect.objectContaining({ status: "unavailable" }),
        review: [expect.objectContaining({ path: "draft", reason: "unavailable" })],
      }),
    );
    expect(scan.store.publishPending).toHaveBeenCalledOnce();
  });

  it("fails the scan if the page store cannot enter the draft stage", async () => {
    const scan = setup("stage");
    await expect(scan.run()).rejects.toThrow("Page store unavailable");
    expect(scan.ai).not.toHaveBeenCalled();
    expect(scan.store.persistEvaluation).not.toHaveBeenCalled();
    expect(scan.status()).toBe("failed");
  });

  it("does not persist or publish answers when Jev fails", async () => {
    const scan = setup("evaluation");
    await expect(scan.run()).rejects.toThrow("Evaluation failed");
    expect(scan.ai).toHaveBeenCalledTimes(3);
    expect(scan.store.persistAnswers).not.toHaveBeenCalled();
    expect(scan.store.persistEvaluation).not.toHaveBeenCalled();
    expect(scan.store.publishPending).not.toHaveBeenCalled();
    expect(scan.status()).toBe("failed");
  });

  it("freezes evaluation before publishing the D1 summary", async () => {
    const scan = setup();
    await scan.run();
    expect(scan.store.markRunning).toHaveBeenCalledWith("run", "capture");
    expect(scan.store.setStage.mock.calls.map(([, stage]) => stage)).toEqual([
      "capture",
      "archive",
      "draft",
      "verify",
      "project",
      "store",
      "publish",
    ]);
    expect(scan.store.persistAnswers).toHaveBeenCalledOnce();
    expect(scan.store.persistEvaluation).toHaveBeenCalledOnce();
    expect(scan.store.publishPending).toHaveBeenCalledOnce();
    expect(scan.status()).toBe("succeeded");
  });

  it("does not publish a run whose DO completion failed", async () => {
    const scan = setup("complete");
    await expect(scan.run()).rejects.toThrow("DO completion failed");
    expect(scan.store.publishPending).not.toHaveBeenCalled();
  });

  it("preserves the successful version if D1 projection fails", async () => {
    const scan = setup("projection");
    await expect(scan.run()).rejects.toThrow("D1 unavailable");
    expect(scan.status()).toBe("succeeded");
    expect(scan.store.completeFailure).not.toHaveBeenCalled();
  });

  it("does not evaluate a failed capture", async () => {
    const scan = setup("capture");
    await expect(scan.run()).rejects.toThrow("WebSocket connection failed");
    expect(scan.ai).not.toHaveBeenCalled();
    expect(scan.store.publishPending).not.toHaveBeenCalled();
  });
});
