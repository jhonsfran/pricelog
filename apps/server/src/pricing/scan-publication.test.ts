import { describe, expect, it, vi } from "vitest";
import { createDb } from "@my-better-t-app/db";
import { ScanWorkflow } from "./scan-workflow";
import { PRICING_INTELLIGENCE_RUBRIC } from "./rubric";
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

function setup(
  failure?: "start" | "capture" | "complete" | "projection" | "evaluation" | "numeric",
) {
  let status = "running";
  let prepared = false;
  const store = {
    markRunning: vi.fn(),
    setStage: vi.fn(),
    persistVersion: vi.fn(),
    persistAnswers: vi.fn(),
    persistEvaluation: vi.fn(),
    getActiveRubric: async () =>
      failure === "evaluation"
        ? {
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
          }
        : {
            id: "pricing-intelligence-v4",
            questions: [
              {
                key: "has_free_plan",
                type: "noul",
                instructions: "Is a free plan stated?",
                criteria: { true: "Yes", false: "No" },
              },
            ],
          },
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
  let aiCalls = 0;
  const ai = vi.fn(
    async (_model: string, input: { questions: Record<string, PersistedQuestion> }) => {
      aiCalls++;
      if (failure === "evaluation") throw new Error("Evaluation failed");
      if (failure === "numeric" && aiCalls > 1) throw new Error("Numeric provider failed");
      return {
        result: {
          model: "jev-1.13.0",
          answers: Object.fromEntries(
            Object.entries(input.questions).map(([key, question]) => {
              const choice = Object.keys(question.criteria)[0]!;
              return [
                key,
                question.type === "noul"
                  ? { noul: 0.9 }
                  : {
                      choice,
                      confidence: 0.9,
                      probabilities: { [choice]: 0.9 },
                    },
              ];
            }),
          ),
        },
      };
    },
  );
  const workflow: ScanWorkflow = Object.assign(Object.create(ScanWorkflow.prototype), {
    env: {
      DB: {},
      PAGE_STORE: { getByName: () => store },
      AI: { run: ai },
      ARTIFACTS: {
        put: async () => undefined,
        get: async () => ({
          text: async () =>
            failure === "evaluation"
              ? "x".repeat(24_000)
              : failure === "numeric"
                ? "Pro USD 20 per month."
                : "Free plan. Paid plan available.",
        }),
      },
      BROWSER: {
        quickAction: async () => {
          if (failure === "capture") throw new Error("WebSocket connection failed.");
          return Response.json({
            success: true,
            result: {
              content: "<h1>Pricing</h1>",
              markdown: "Free plan. Paid plan available.",
              screenshot: "eA==",
            },
            meta: { status: 200, title: "Pricing" },
          });
        },
      },
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
  return { run: () => workflow.run(event, step), ai, store, status: () => status };
}

describe("scan publication boundaries", () => {
  it("preserves practice results and records unavailable numeric collection on provider failure", async () => {
    const scan = setup("numeric");
    await scan.run();
    expect(scan.status()).toBe("succeeded");
    expect(scan.store.persistEvaluation).toHaveBeenCalledWith(
      "run",
      expect.objectContaining({
        numericPrices: expect.objectContaining({ status: "unavailable", offers: [], model: null }),
      }),
    );
    expect(scan.store.publishPending).toHaveBeenCalledOnce();
  });
  it("does not persist or publish answers when Jev evaluation fails", async () => {
    const scan = setup("evaluation");
    await expect(scan.run()).rejects.toThrow("Evaluation failed");
    expect(scan.ai).toHaveBeenCalledTimes(1);
    expect(scan.store.persistAnswers).not.toHaveBeenCalled();
    expect(scan.store.persistEvaluation).not.toHaveBeenCalled();
    expect(scan.store.preparePublication).not.toHaveBeenCalled();
    expect(scan.store.publishPending).not.toHaveBeenCalled();
    expect(scan.status()).toBe("failed");
  });
  it("records failure when the running owner projection cannot be written", async () => {
    const scan = setup("start");
    await expect(scan.run()).rejects.toThrow("D1 start unavailable");
    expect(scan.status()).toBe("failed");
    expect(scan.ai).not.toHaveBeenCalled();
    expect(scan.store.publishPending).not.toHaveBeenCalled();
  });
  it("freezes the evaluated DO version before publishing D1 summaries", async () => {
    const scan = setup();
    await scan.run();
    expect(scan.store.persistEvaluation).toHaveBeenCalledWith(
      "run",
      expect.objectContaining({ model: "jev-1.13.0" }),
    );
    expect(scan.store.publishPending).toHaveBeenCalledOnce();
    expect(scan.status()).toBe("succeeded");
  });
  it("never publishes a run whose DO completion failed", async () => {
    const scan = setup("complete");
    await expect(scan.run()).rejects.toThrow("DO completion failed");
    expect(scan.store.publishPending).not.toHaveBeenCalled();
    expect(scan.status()).toBe("failed");
  });
  it("preserves the successful authoritative version if its D1 projection fails", async () => {
    const scan = setup("projection");
    await expect(scan.run()).rejects.toThrow("D1 unavailable");
    expect(scan.status()).toBe("succeeded");
    expect(scan.store.completeFailure).not.toHaveBeenCalled();
  });
  it("records a browser connection failure without evaluating or publishing", async () => {
    const scan = setup("capture");
    await expect(scan.run()).rejects.toThrow("WebSocket connection failed");
    expect(scan.ai).not.toHaveBeenCalled();
    expect(scan.store.publishPending).not.toHaveBeenCalled();
    expect(scan.status()).toBe("failed");
  });
});
