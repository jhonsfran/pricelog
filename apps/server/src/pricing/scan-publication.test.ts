import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createDb } from "@pricelog/db";
import { ScanWorkflow } from "./scan-workflow";
import { PRICING_INTELLIGENCE_RUBRIC } from "./rubric";
import { EXTRACTION_MODELS } from "./quote-snapshot";

const [QWEN, LLAMA] = EXTRACTION_MODELS;
import { PRICING_PIPELINE_ID } from "@pricelog/db/pricing-snapshot";
import type { PersistedQuestion } from "./types";

vi.mock("cloudflare:workers", () => ({ WorkflowEntrypoint: class {} }));
const captureThroughBotCheck = vi.fn();
vi.mock("./capture-session", () => ({
  captureThroughBotCheck: (...args: unknown[]) => captureThroughBotCheck(...args),
}));
vi.mock("@pricelog/db", () => ({ createDb: vi.fn() }));
vi.mock("./url", () => ({
  normalizePricingUrl: async () => ({
    canonicalUrl: "https://example.com/pricing",
    normalizedDomain: "example.com",
  }),
  resolveDnsAddresses: vi.fn(),
}));

const PRICES = {
  prices: [
    { plan: "Pro", text: "$20 per month", state: "default" },
    { plan: null, text: "Extra emails | $0.90 | / 1,000", state: "default" },
  ],
};
const CHOICES: Record<string, string> = {
  product_category: "coding_assistants",
  limit_behavior: "pay_as_you_go",
  spend_cap: "not_stated",
  metered_unit: "credits",
  price_0: "flat_monthly",
  price_1: "usage",
};
const STATE_HTML = `<h1>Pricing</h1><script type="application/json" id="pricelog-state">${JSON.stringify(
  {
    version: 1,
    billingView: "monthly",
    blocks: [
      {
        label: "default",
        text: "# Pricing\n## Pro\n$20 per month\nExtra emails | $0.90 | / 1,000",
      },
      { label: "billing=Yearly", text: "(within: ## Pro)\n$16 per month" },
    ],
  },
)}</script>`;

function setup(
  failure?:
    | "start"
    | "capture"
    | "complete"
    | "projection"
    | "evaluation"
    | "extraction"
    | "primary"
    | "stage",
  sourceMarkdown = "# Pricing\nPro: $20 per month",
  accessibilityTree?: unknown,
  capturedHtml: string | string[] = "<h1>Pricing</h1>",
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
    findReusableEvaluation: vi.fn(async (): Promise<unknown> => null),
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
      if ((EXTRACTION_MODELS as readonly string[]).includes(model)) {
        if (failure === "extraction" || (failure === "primary" && model === QWEN))
          return { response: "{truncated" };
        const properties = input.response_format!.json_schema.properties;
        if ("prices" in properties)
          return { response: PRICES, usage: { prompt_tokens: 100, completion_tokens: 20 } };
        return { response: { features: [] }, usage: { prompt_tokens: 100, completion_tokens: 5 } };
      }
      if (failure === "evaluation") throw new Error("Evaluation failed");
      return {
        result: {
          model: "jev-1.13.0",
          answers: Object.fromEntries(
            Object.entries(input.questions!).map(([key, question]) => [
              key,
              question.type === "noul"
                ? { noul: /^feature_\d+$/.test(key) ? 0.95 : 0.05 }
                : {
                    choice: CHOICES[key] ?? "flat_monthly",
                    confidence: 0.9,
                    probabilities: { [CHOICES[key] ?? "flat_monthly"]: 0.9 },
                  },
            ]),
          ),
        },
      };
    },
  );
  const artifacts = new Map<string, string>();
  const pages = [capturedHtml].flat();
  const browser = vi.fn(async (action: string, _options: Record<string, unknown>) => {
    if (failure === "capture" && action === "snapshot")
      throw new Error("WebSocket connection failed.");
    return Response.json({
      success: true,
      result: {
        content: pages.length > 1 ? pages.shift() : pages[0],
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
      setExtraHTTPHeaders: { "Accept-Language": "en-IE,en;q=0.9" },
    });
    const { addScriptTag, rejectRequestPattern } = options as {
      addScriptTag: { content: string }[];
      rejectRequestPattern: string[];
    };
    expect(addScriptTag).toHaveLength(3);
    expect(addScriptTag[0]).toEqual({
      content: 'document.documentElement.dataset.pricelogCurrency = "EUR";',
    });
    expect(rejectRequestPattern[0]).toBe(String.raw`/\/api\/geo/`);
    expect(scan.archivedMarkdown()).toBe(
      "## state: default\n# Pricing\n## Pro\n$20 per month\nExtra emails | $0.90 | / 1,000\n\n## state: billing=Yearly\n(within: ## Pro)\n$16 per month",
    );
    expect(scan.ai.mock.calls.map(([model]) => model)).toEqual([QWEN, QWEN, "typesafe/jev"]);
    expect(scan.ai.mock.calls[2]?.[1].state).toBe(scan.archivedMarkdown());
    expect(Object.keys(scan.ai.mock.calls[2]?.[1].questions ?? {})).toEqual([
      "product_category",
      "limit_behavior",
      "spend_cap",
      "metered_unit",
      "price_0",
      "price_1",
    ]);
    expect(scan.store.persistEvaluation).toHaveBeenCalledWith(
      "run",
      expect.objectContaining({
        model: "jev-1.13.0",
        pipeline: PRICING_PIPELINE_ID,
        numericPrices: expect.objectContaining({
          version: "numeric-prices-v1",
          model: "jev-1.13.0",
        }),
        draft: JSON.stringify({ prices: PRICES, features: { features: [] } }),
        choices: [
          expect.objectContaining({ key: "product_category", choice: "coding_assistants" }),
          expect.objectContaining({ key: "limit_behavior", choice: "pay_as_you_go" }),
          expect.objectContaining({ key: "metered_unit", choice: "credits" }),
          expect.objectContaining({ key: "price_disclosure" }),
        ],
        signals: expect.arrayContaining([
          { key: "charges_fixed_subscription", probability: 1 },
          { key: "charges_direct_usage", probability: 1 },
        ]),
        snapshot: {
          version: "pricing-snapshot-v4",
          status: "collected",
          billing_view: "monthly",
          currency_visible: "USD",
          offers: [
            {
              name: "Pro",
              prices: [
                {
                  kind: "flat",
                  price_raw: "$20 per month",
                  price_numeric: 20,
                  period: "month",
                  billing: "monthly",
                  state: "default",
                },
              ],
            },
          ],
          shared_prices: [
            {
              kind: "usage",
              price_raw: "Extra emails | $0.90 | / 1,000",
              price_numeric: 0.9,
              period: "usage",
              billing: "usage",
              state: "default",
            },
          ],
          features: [],
        },
        review: [
          { path: "currency_visible", reason: "mismatch", value: "USD shown; EUR requested" },
          { path: "coverage", reason: "unclaimed", value: "$16" },
        ],
        coverage: { literals: 3, claimed: 2 },
      }),
    );
    expect(scan.store.recordEvent).toHaveBeenCalledWith(
      "run",
      expect.objectContaining({
        stage: "project",
        message:
          "Published 1 offers, 1 prices, and 0 features; 2 review items; quotes cover 2 of 3 price literals",
      }),
    );
  });

  it("adds the prices the page declares as schema.org data to the archived text", async () => {
    const declared = `<script type="application/ld+json">${JSON.stringify({
      "@type": "Offer",
      name: "Pro",
      price: "20",
      priceCurrency: "USD",
    })}</script>`;
    const scan = setup(
      undefined,
      "# Pricing\nPro: $20 per month",
      undefined,
      STATE_HTML + declared,
    );
    await scan.run();
    expect(scan.archivedMarkdown()).toBe(
      "## state: default\n# Pricing\n## Pro\n$20 per month\nExtra emails | $0.90 | / 1,000\n\n## state: billing=Yearly\n(within: ## Pro)\n$16 per month\n\n## state: structured data\nPro: 20 USD",
    );
  });

  it("reuses the previous evaluation without model calls when the content is unchanged", async () => {
    const scan = setup(undefined, "# Pricing\nPro: $20 per month", undefined, STATE_HTML);
    const previous = {
      runId: "previous",
      rubricId: PRICING_INTELLIGENCE_RUBRIC.id,
      model: "jev-1.13.0",
      evaluation: {
        choices: [],
        signals: [],
        tags: [],
        snapshot: {
          version: "pricing-snapshot-v4",
          status: "collected",
          offers: [{ name: "Pro", prices: [] }],
          features: [],
        },
        review: [],
      },
      answers: [
        {
          key: "spend_cap",
          type: "choice",
          choice: "yes",
          confidence: 0.9,
          probabilities: { yes: 0.9, no: 0.05, not_stated: 0.05 },
        },
      ],
    };
    scan.store.findReusableEvaluation.mockResolvedValue(previous);
    await scan.run();
    expect(scan.store.findReusableEvaluation).toHaveBeenCalledWith(
      "run",
      createHash("sha256").update(scan.archivedMarkdown()!).digest("hex"),
      PRICING_INTELLIGENCE_RUBRIC.id,
      PRICING_PIPELINE_ID,
    );
    expect(scan.ai).not.toHaveBeenCalled();
    expect(scan.store.persistAnswers).toHaveBeenCalledWith(
      "run",
      PRICING_INTELLIGENCE_RUBRIC.id,
      previous.answers,
    );
    expect(scan.store.persistEvaluation).toHaveBeenCalledWith("run", {
      rubricId: PRICING_INTELLIGENCE_RUBRIC.id,
      model: "jev-1.13.0",
      ...previous.evaluation,
    });
    expect(scan.store.recordEvent).toHaveBeenCalledWith(
      "run",
      expect.objectContaining({
        message: "Content unchanged since run previous; reused its evaluation (no model calls)",
      }),
    );
    expect(scan.store.publishPending).toHaveBeenCalledOnce();
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
    expect(scan.ai.mock.calls[0]?.[1].messages?.[1]?.content).toBe(
      "# Pricing\nPro: $20 per month\n\n/no_think",
    );
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

  it("asks Llama for each part when Qwen returns broken JSON", async () => {
    const scan = setup("primary");
    await scan.run();
    expect(scan.ai.mock.calls.map(([model]) => model)).toEqual([
      QWEN,
      QWEN,
      LLAMA,
      LLAMA,
      "typesafe/jev",
    ]);
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

  it("captures a page behind a bot check in a browser session after the redirect", async () => {
    const botCheck = `<p>Please wait</p><script type="application/json" id="pricelog-state">${JSON.stringify(
      { version: 1, interstitial: true },
    )}</script>`;
    captureThroughBotCheck.mockResolvedValueOnce({
      success: true,
      result: { content: STATE_HTML, markdown: "Pricing", screenshot: "eA==" },
      meta: { status: 200, title: "Pricing", finalUrl: "https://example.com/pricing" },
    });
    const scan = setup(undefined, "# Pricing\nPro: $20 per month", undefined, botCheck);
    await scan.run();
    expect(scan.browser).toHaveBeenCalledTimes(1);
    const [, input] = captureThroughBotCheck.mock.calls[0]!;
    expect(input).toMatchObject({
      url: "https://example.com/pricing",
      readySelector: "#pricelog-state-ready",
      headers: { "Accept-Language": "en-IE,en;q=0.9" },
    });
    expect((input as { scripts: string[] }).scripts).toHaveLength(3);
    expect(scan.archivedMarkdown()).toContain("## state: billing=Yearly");
  });

  it("falls back to a fixed wait when the browser session fails", async () => {
    const botCheck = `<p>Please wait</p><script type="application/json" id="pricelog-state">${JSON.stringify(
      { version: 1, interstitial: true },
    )}</script>`;
    captureThroughBotCheck.mockRejectedValueOnce(new Error("session limit"));
    const scan = setup(undefined, "# Pricing\nPro: $20 per month", undefined, [
      botCheck,
      "<h1>Pricing</h1>",
    ]);
    await scan.run();
    expect(scan.browser).toHaveBeenCalledTimes(2);
    expect(scan.browser.mock.calls[1]?.[1]).toMatchObject({ waitForTimeout: 8_000 });
    expect(scan.archivedMarkdown()).toBe("# Pricing\nPro: $20 per month");
  });

  it("publishes an unavailable snapshot with a review item when extraction fails", async () => {
    const scan = setup("extraction");
    await scan.run();
    expect(scan.ai.mock.calls.map(([model]) => model)).toEqual([QWEN, QWEN, LLAMA, LLAMA]);
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
