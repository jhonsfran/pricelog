import { describe, expect, it, vi } from "vitest";
import { createDb } from "@my-better-t-app/db";
import { DRAFT_FLAG_KEYS, type DraftSnapshot } from "@my-better-t-app/db/pricing-snapshot";
import { ScanWorkflow } from "./scan-workflow";
import { PRICING_INTELLIGENCE_RUBRIC } from "./rubric";
import { QWEN_DRAFT_MODEL } from "./draft-extraction";
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

const draft: DraftSnapshot = {
  buying_motion: "self_serve",
  price_disclosure: "full",
  primary_customer_segment: "small_business",
  primary_market: "developer_tools",
  product_category: "coding_assistants",
  billing_view: "monthly",
  currency_visible: "USD",
  flags: Object.fromEntries(DRAFT_FLAG_KEYS.map((key) => [key, false])) as DraftSnapshot["flags"],
  offers: [
    {
      name: "Pro",
      is_highlighted: false,
      is_free: false,
      is_contact_sales: false,
      audience_blurb: null,
      prices: [
        {
          role: "base_price",
          price_raw: "$20 per month",
          price_numeric: 20,
          period: "month",
          unit: "flat",
        },
      ],
    },
  ],
  features: [],
};

function requestedDraftPart(schema: {
  properties: Record<string, unknown>;
}): Record<string, unknown> {
  return Object.fromEntries(
    Object.keys(schema.properties).map((key) => [key, draft[key as keyof DraftSnapshot]]),
  );
}

function setup(
  failure?:
    | "start"
    | "capture"
    | "complete"
    | "projection"
    | "evaluation"
    | "json"
    | "jsonOne"
    | "json422"
    | "jsonTimeout"
    | "jsonEnvelope"
    | "stage",
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
      _model: string,
      input: {
        state: string;
        questions: Record<string, PersistedQuestion>;
        response_format?: { json_schema: { properties: Record<string, unknown> } };
      },
    ) => {
      if (_model === "@cf/meta/llama-3.3-70b-instruct-fp8-fast")
        return { response: requestedDraftPart(input.response_format!.json_schema) };
      if (failure === "evaluation") throw new Error("Evaluation failed");
      const choiceValues: Record<string, string> = {
        buying_motion: draft.buying_motion,
        price_disclosure: draft.price_disclosure,
        primary_customer_segment: draft.primary_customer_segment,
        primary_market: draft.primary_market,
        product_category: draft.product_category,
        draft_billing_view: draft.billing_view,
        offer_0_price_0_role: "base_price",
        offer_0_price_0_period: "month",
        offer_0_price_0_unit: "flat",
      };
      return {
        result: {
          model: "jev-1.13.0",
          answers: Object.fromEntries(
            Object.entries(input.questions).map(([key, question]) => [
              key,
              question.type === "noul"
                ? {
                    noul:
                      key === "offer_0_name" ||
                      key === "offer_0_price_0_raw" ||
                      key === "draft_currency_visible"
                        ? 0.95
                        : 0.05,
                  }
                : {
                    choice: choiceValues[key],
                    confidence: 0.9,
                    probabilities: { [choiceValues[key]!]: 0.9 },
                  },
            ]),
          ),
        },
      };
    },
  );
  const artifacts = new Map<string, string>();
  const browser = vi.fn(
    async (
      action: string,
      options: {
        html?: string;
        response_format?: { json_schema: { properties: Record<string, unknown> } };
      },
    ) => {
      if (failure === "capture" && action === "snapshot")
        throw new Error("WebSocket connection failed.");
      if (action === "json") {
        const part = requestedDraftPart(options.response_format!.json_schema);
        if (failure === "json") return Response.json({ success: true, result: {} });
        if (failure === "jsonOne" && "offers" in part)
          return Response.json({ success: true, result: {} });
        if (failure === "jsonEnvelope")
          return Response.json({
            success: true,
            result: {
              choices: [{ finish_reason: "stop", message: { content: JSON.stringify(part) } }],
            },
          });
        if (failure === "json422")
          return Response.json(
            {
              success: false,
              errors: [
                { message: "Unable to form JSON based on user prompt and/or webpage text." },
              ],
              rawAiResponse: '{"features":[{"name":"Multich',
            },
            { status: 422 },
          );
        if (failure === "jsonTimeout")
          return Response.json(
            { success: false, errors: [{ message: "AiError: 3046: Request timeout" }] },
            { status: 422 },
          );
        return Response.json({ success: true, result: part });
      }
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
    },
  );
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
  it("extracts bounded Markdown and judges cleaned Markdown from the same capture", async () => {
    const scan = setup(
      undefined,
      "Home\nProducts\n# Pricing\nPro: $20 per month\nThis website uses cookies\nAccept all\nDecline all\nCookie report\n| Name | Provider / Domain | Expiration | Description |\n| --- | --- | --- | --- |\n| _ga | Example | 1 year | Analytics |",
    );
    await scan.run();
    expect(scan.archivedMarkdown()).toBe("Home\nProducts\n# Pricing\nPro: $20 per month");
    expect(scan.browser).toHaveBeenCalledWith(
      "json",
      expect.objectContaining({
        html: "<html><body><main><pre># Pricing\nPro: $20 per month</pre></main></body></html>",
        custom_ai: [{ model: QWEN_DRAFT_MODEL }],
      }),
    );
    expect(scan.browser.mock.calls.filter(([action]) => action === "json")).toHaveLength(4);
    expect(scan.ai.mock.calls[0]?.[1].state).toBe("# Pricing\nPro: $20 per month");
    expect(scan.ai.mock.calls[0]?.[1].state).not.toContain("Cookie report");
    expect(scan.store.persistEvaluation).toHaveBeenCalledWith(
      "run",
      expect.objectContaining({
        model: "jev-1.13.0",
        snapshot: expect.objectContaining({
          status: "collected",
          offers: [expect.objectContaining({ name: "Pro" })],
        }),
      }),
    );
  });

  it("preserves accessible prices in the archived source and Jev state", async () => {
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
    expect(scan.ai.mock.calls[0]?.[1].state).toContain("$90");
  });

  it("recovers an invalid Browser JSON draft before calling Jev", async () => {
    const scan = setup("json");
    await scan.run();
    expect(scan.ai).toHaveBeenCalledTimes(5);
    expect(scan.store.persistEvaluation).toHaveBeenCalledWith(
      "run",
      expect.objectContaining({
        snapshot: expect.objectContaining({ status: "collected" }),
      }),
    );
    expect(scan.store.publishPending).toHaveBeenCalledOnce();
  });

  it("recovers only the failed Qwen part", async () => {
    const scan = setup("jsonOne");
    await scan.run();
    expect(scan.ai.mock.calls.map(([model]) => model)).toEqual([
      "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
      "typesafe/jev",
    ]);
    expect(scan.store.recordEvent).toHaveBeenCalledWith(
      "run",
      expect.objectContaining({ message: expect.stringContaining("recovered offers") }),
    );
  });

  it("accepts Qwen chat completion JSON from Browser Run", async () => {
    const scan = setup("jsonEnvelope");
    await scan.run();
    expect(scan.ai.mock.calls.map(([model]) => model)).toEqual(["typesafe/jev"]);
    expect(scan.store.persistEvaluation).toHaveBeenCalledWith(
      "run",
      expect.objectContaining({ snapshot: expect.objectContaining({ status: "collected" }) }),
    );
  });

  it("recovers a Qwen timeout reported as Browser JSON 422", async () => {
    const scan = setup("jsonTimeout");
    await scan.run();
    expect(scan.ai).toHaveBeenCalledTimes(5);
    expect(scan.store.recordEvent).toHaveBeenCalledWith(
      "run",
      expect.objectContaining({ stage: "draft", httpStatus: 422, kind: "warning" }),
    );
    expect(scan.store.persistEvaluation).toHaveBeenCalledWith(
      "run",
      expect.objectContaining({ snapshot: expect.objectContaining({ status: "collected" }) }),
    );
  });

  it("does not send large captured HTML to Qwen", async () => {
    const scan = setup(undefined, "# Pricing\nPro: $20 per month", undefined, "x".repeat(9 * 1024));
    await scan.run();
    const requests = scan.browser.mock.calls.filter(([action]) => action === "json");
    expect(requests).toHaveLength(4);
    expect(requests.every(([, options]) => !options.html?.includes("x".repeat(100)))).toBe(true);
    expect(scan.ai).toHaveBeenCalledTimes(1);
  });

  it("recovers a truncated Browser JSON response and records the provider error", async () => {
    const scan = setup("json422");
    await scan.run();
    expect(scan.ai.mock.calls.map(([model]) => model)).toEqual([
      "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
      "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
      "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
      "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
      "typesafe/jev",
    ]);
    expect(scan.browser.mock.calls.filter(([action]) => action === "json")).toHaveLength(4);
    expect(scan.store.recordEvent).toHaveBeenCalledWith(
      "run",
      expect.objectContaining({ stage: "draft", httpStatus: 422, kind: "warning" }),
    );
    expect(scan.store.persistEvaluation).toHaveBeenCalledWith(
      "run",
      expect.objectContaining({ model: "jev-1.13.0" }),
    );
  });

  it("fails the scan if the page store cannot enter the draft stage", async () => {
    const scan = setup("stage");
    await expect(scan.run()).rejects.toThrow("Page store unavailable");
    expect(scan.browser).not.toHaveBeenCalledWith("json", expect.anything());
    expect(scan.store.persistEvaluation).not.toHaveBeenCalled();
    expect(scan.status()).toBe("failed");
  });

  it("does not persist or publish answers when Jev fails", async () => {
    const scan = setup("evaluation");
    await expect(scan.run()).rejects.toThrow("Evaluation failed");
    expect(scan.ai).toHaveBeenCalledTimes(1);
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
