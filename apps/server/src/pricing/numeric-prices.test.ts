import { describe, expect, it } from "vitest";
import {
  collectNumericPrices,
  extractNumericCandidates,
  monetaryCandidates,
} from "./numeric-prices";
import type { Decide } from "./change-verification";

const source =
  "Starter USD $12.50 per seat/month, billed annually. Includes 1,000 requests/month. Overage USD $0.02 per request.";
function provider(
  overrides: Record<string, string | number> = {},
  inspect?: (input: Parameters<Decide>[0], call: number) => void,
  confidences: Record<string, number> = {},
): Decide {
  let calls = 0;
  const choices: Record<string, string | number> = {
    offer_3: "n0",
    currency_3: "USD",
    period_3: "month",
    usage_3: "n1",
    rate_3: "n2",
    usage_unit: "request",
    usage_period: "month",
    rate_unit: "request",
    rate_currency: "USD",
    rate_quantity: "one",
    baseline: 0.99,
    amount: 0.99,
    currency: 0.99,
    charge_unit: 0.99,
    period: 0.99,
    billing: 0.99,
    allowance: 0.99,
    overage: 0.99,
    ...overrides,
  };
  return async (input) => {
    inspect?.(input, ++calls);
    return {
      model: "jev-1.13.0",
      answers: Object.fromEntries(
        Object.entries(input.questions).map(([key, raw]) => {
          const question = raw as { type: string };
          const value = choices[key] ?? "unknown";
          return [
            key,
            question.type === "noul"
              ? { noul: value }
              : {
                  choice: value,
                  confidence: confidences[key] ?? 0.99,
                  probabilities: { [value]: confidences[key] ?? 0.99 },
                },
          ];
        }),
      ),
    };
  };
}
describe("literal numeric pricing", () => {
  it("parses exact decimals and grouping without interpreting malformed tokens", () => {
    expect(
      extractNumericCandidates(
        "USD $1,234.50 €0.002 £12 12,50 2e3 10% 11 % -20 abc30 1.2.3 01 20k",
      ).map((item) => item.amount),
    ).toEqual(["1234.50", "0.002", "12"]);
  });
  it("preserves annual commitment and monthly display, exact allowance and overage", async () => {
    const result = await collectNumericPrices(
      source,
      provider({}, (input) => {
        expect(JSON.parse(input.state).source).toBe(source);
        expect(JSON.parse(input.state).candidates[0]).toMatchObject({ id: "n0", amount: "12.50" });
        expect(JSON.parse(input.state).candidates[0]).not.toHaveProperty("evidence");
        expect(Object.keys(input.questions).length).toBeLessThanOrEqual(8);
      }),
    );
    expect(result.offers).toEqual([
      expect.objectContaining({
        billing: "annual",
        chargeUnit: "seat",
        amount: "12.50",
        amountPeriod: "month",
        currency: "USD",
        includedUsage: expect.objectContaining({
          amount: "1000",
          unit: "request",
          period: "month",
        }),
        overage: expect.objectContaining({ amount: "0.02", quantity: "1", unit: "request" }),
      }),
    ]);
    expect(source).toContain(result.offers[0]!.evidence);
  });
  it("keeps annual total display and does not manufacture a monthly price", async () => {
    const result = await collectNumericPrices(
      "Starter USD $150 per seat/year, billed annually.",
      provider({ period_3: "year", usage_3: "unknown", rate_3: "unknown" }),
    );
    expect(result.offers[0]).toMatchObject({ amount: "150", amountPeriod: "year" });
  });
  it("retains sentence punctuation and enforces API decimal bounds", () => {
    expect(
      extractNumericCandidates(
        "USD $20. USD $30, billed monthly. 1000000000 1000000001 0.000001 0.0000001",
      ).map((item) => item.amount),
    ).toEqual(["20", "30", "1000000000", "0.000001"]);
  });
  it.each(["offer_3", "currency_3", "period_3"])(
    "reports the actual lowest choice confidence for %s",
    async (key) => {
      const result = await collectNumericPrices(source, provider({}, undefined, { [key]: 0.92 }));
      expect(result.offers[0]!.confidence).toBe(0.92);
    },
  );
  it("includes independent validation confidence in the minimum", async () => {
    const result = await collectNumericPrices(source, provider({ baseline: 0.96 }));
    expect(result.offers[0]!.confidence).toBe(0.96);
  });
  it.each([
    ["Cursor", "$20 / mo.", "20"],
    ["Devin", "$20per month", "20"],
    ["CodeRabbit", "$24/ developer / month", "24"],
    ["Qodo", "$.012/credit, pooled across the team", "0.012"],
  ])("parses captured %s pricing text", (_vendor, excerpt, expected) => {
    expect(extractNumericCandidates(excerpt)[0]?.amount).toBe(expected);
  });
  it("preserves unspecified dollars and records bounded decisions without source copies", async () => {
    const dollarSource = source.replaceAll("USD ", "");
    const result = await collectNumericPrices(
      dollarSource,
      provider({ currency_3: "DOLLAR_UNSPECIFIED", rate_currency: "DOLLAR_UNSPECIFIED" }),
    );
    expect(result.offers[0]).toMatchObject({
      currency: "DOLLAR_UNSPECIFIED",
      overage: { currency: "DOLLAR_UNSPECIFIED" },
    });
    expect(result.audit?.map((item) => item.phase)).toEqual([
      "selection",
      "metadata",
      "details_3",
      "validation_3",
    ]);
    expect(result.audit?.[0]?.answers).toContainEqual({
      key: "offer_3",
      type: "choice",
      choice: "n0",
      confidence: 0.99,
    });
    expect(result.audit?.[3]?.answers).toContainEqual({
      key: "baseline",
      type: "noul",
      probability: 0.99,
    });
    expect(JSON.stringify(result.audit)).not.toContain(dollarSource);
    expect(result.audit?.every((item) => item.answers.length <= 8)).toBe(true);
  });
  it("retains selection decisions when no offer qualifies", async () => {
    const result = await collectNumericPrices(source, provider({ offer_3: "unknown" }));
    expect(result.offers).toEqual([]);
    expect(result.audit).toHaveLength(1);
    expect(result.audit?.[0]?.answers).toContainEqual({
      key: "offer_3",
      type: "choice",
      choice: "unknown",
      confidence: 0.99,
    });
  });
  it("limits baseline choices to positive monetary literals and supplies their local source context", async () => {
    const text =
      "## Starter\nUSD $12.50 per seat/month, billed annually. Includes 1,000 requests. Overage USD $0.02 per request. Free $0. Discount 20%.";
    const candidates = extractNumericCandidates(text);
    expect(monetaryCandidates(text, candidates).map((item) => item.amount)).toEqual([
      "12.50",
      "0.02",
    ]);
    await collectNumericPrices(
      text,
      provider({}, (input, call) => {
        if (call !== 1) return;
        const question = input.questions.offer_3 as { criteria: Record<string, string> };
        expect(Object.keys(question.criteria)).toEqual(["n0", "n2", "unknown"]);
        expect(question.criteria.n0).toContain("Starter");
        expect(question.criteria.n0).toContain("billed annually");
      }),
    );
  });
  it("uses literal bare dollars when denomination confidence is low without asserting USD", async () => {
    const result = await collectNumericPrices(
      source.replaceAll("USD ", ""),
      provider({ currency_3: "USD", rate_currency: "USD" }, undefined, {
        currency_3: 0.8,
        rate_currency: 0.7,
      }),
    );
    expect(result.offers[0]).toMatchObject({
      currency: "DOLLAR_UNSPECIFIED",
      confidence: 0.99,
      overage: { currency: "DOLLAR_UNSPECIFIED" },
    });
  });
  it.each(["CAD $", "AUD $", "A$", "US$", "USD $"])(
    "does not apply the bare-dollar fallback to %s",
    async (marker) => {
      const result = await collectNumericPrices(
        source.replaceAll("USD $", marker),
        provider({ currency_3: "unknown" }),
      );
      expect(result.offers).toEqual([]);
    },
  );
  it("still requires independent baseline verification for a literal dollar fallback", async () => {
    const result = await collectNumericPrices(
      source.replaceAll("USD ", ""),
      provider({ currency_3: "unknown", baseline: 0.89 }),
    );
    expect(result.offers).toEqual([]);
  });
  it("keeps uppercase plan names separate from an attached currency code", async () => {
    const text = "ProPOPULAR\n\n$20per month";
    const result = await collectNumericPrices(
      text,
      provider({ offer_3: "unknown", offer_0: "n0", currency_0: "unknown", period_0: "month" }),
    );
    expect(result.offers[0]).toMatchObject({ currency: "DOLLAR_UNSPECIFIED", amount: "20" });
  });
  it.each(["currency", "period", "billing", "charge_unit"])(
    "requires independent %s validation",
    async (key) => {
      expect((await collectNumericPrices(source, provider({ [key]: 0.89 }))).offers).toEqual([]);
    },
  );
  it("passes concrete proposal fields under the key used in validation instructions", async () => {
    await collectNumericPrices(
      source,
      provider({}, (input) => {
        if (!("baseline" in input.questions)) return;
        const state = JSON.parse(input.state);
        expect(state.proposals).toBeUndefined();
        expect(state.proposal.offer).toMatchObject({ amount: "12.50", billing: "annual" });
        expect(state.proposal.offer).not.toHaveProperty("confidence");
        expect(state.proposal.offer).not.toHaveProperty("plan");
        expect(state.proposal.selectedSource).toContain("USD $12.50");
        expect(state.proposal.selectedLiteral).toBe("12.50");
        expect(input.questions).not.toHaveProperty("amount");
        const periodQuestion = input.questions.period as {
          instructions: string;
          criteria: Record<string, string>;
        };
        expect(periodQuestion.criteria.true).toContain("displayed per month");
        expect(periodQuestion.criteria.false).toContain("different period");
        expect(periodQuestion.instructions).not.toContain("Exclude free");
      }),
    );
  });
  it("shrinks oversized batches while retaining the full source", async () => {
    const text = Array.from(
      { length: 100 },
      (_, i) => `$${i + 1} per month ${"x".repeat(400)}`,
    ).join("\n");
    let calls = 0;
    await collectNumericPrices(
      text,
      provider({ offer_3: "unknown" }, (input) => {
        calls++;
        expect(JSON.parse(input.state).source).toBe(text);
        expect(Object.keys(input.questions).length).toBeLessThan(4);
      }),
    );
    expect(calls).toBeGreaterThan(1);
  });
  it("keeps baseline prices when optional allowance choices exceed the provider limit", async () => {
    const text = `USD $12.50 per seat/month, billed annually.\n${Array.from({ length: 260 }, (_, i) => i + 1).join(" | ")}`;
    const result = await collectNumericPrices(
      text,
      provider({}, (input) => {
        for (const raw of Object.values(input.questions)) {
          const question = raw as { criteria: Record<string, string> };
          expect(Object.keys(question.criteria).length).toBeLessThanOrEqual(255);
        }
        expect(input.questions).not.toHaveProperty("usage_3");
        expect(input.questions).not.toHaveProperty("rate_3");
      }),
    );
    expect(result.offers[0]).toMatchObject({ amount: "12.50", includedUsage: null, overage: null });
  });
  it("fails closed rather than truncating too many baseline price options", async () => {
    const text = Array.from({ length: 255 }, (_, i) => `$${i + 1} per month`).join("\n");
    await expect(collectNumericPrices(text, provider())).rejects.toThrow("255 option limit");
  });
  it.each(["baseline", "currency", "period", "billing", "charge_unit"])(
    "accepts the documented 0.9 semantic boundary for %s",
    async (key) => {
      const result = await collectNumericPrices(source, provider({ [key]: 0.9 }));
      expect(result.offers[0]?.confidence).toBe(0.9);
    },
  );
  it("does not ask a model to prove literal numbers or bare-dollar markers", async () => {
    const result = await collectNumericPrices(
      source.replaceAll("USD ", ""),
      provider({ currency_3: "unknown" }, (input) => {
        if (!("baseline" in input.questions)) return;
        expect(input.questions).not.toHaveProperty("amount");
        expect(input.questions).not.toHaveProperty("currency");
      }),
    );
    expect(result.offers[0]).toMatchObject({
      amount: "12.50",
      currency: "DOLLAR_UNSPECIFIED",
      confidence: 0.99,
    });
    expect(extractNumericCandidates("-$20 −€30 - USD 40")).toEqual([]);
  });
  it("distinguishes Markdown price bullets from negative amounts", () => {
    const text =
      "- $20/month\n  - USD 30 per month\n\t- €40/month\n-$50/month\n−€60/month\nDiscount - USD 70 per month";
    expect(extractNumericCandidates(text).map((candidate) => candidate.amount)).toEqual([
      "20",
      "30",
      "40",
    ]);
  });
  it.each([" ", "\u00a0", "\u202f", "\t"])(
    "rejects every fragment of unsupported whitespace grouping with %j",
    (separator) => {
      expect(
        extractNumericCandidates(
          `€1${separator}234/month; ${separator}12${separator}345${separator}678 requests/month`,
        ),
      ).toEqual([]);
      expect(extractNumericCandidates(`€1${separator}000/month`)).toEqual([]);
    },
  );
  it.each(["million", "billion", "thousand", "trillion", "hundred", "k", "M", "bn", "MM"])(
    "rejects unsupported numeric scale %s without expansion",
    (scale) => {
      expect(extractNumericCandidates(`$1 ${scale}/year; includes 2.5 ${scale} tokens`)).toEqual(
        [],
      );
    },
  );
  it("keeps separate values outside unsupported grouped spans", () => {
    expect(
      extractNumericCandidates(
        "20 30; 1000 2000; | 1 | 234 |; 1\n234; 10 requests and 200 tokens",
      ).map((candidate) => candidate.amount),
    ).toEqual(["20", "30", "1000", "2000", "1", "234", "1", "234", "10", "200"]);
    expect(
      extractNumericCandidates("$0.02 per million tokens").map((candidate) => candidate.amount),
    ).toEqual(["0.02"]);
  });
  it("rejects fabricated candidate IDs", async () => {
    await expect(collectNumericPrices(source, provider({ offer_3: "n999" }))).rejects.toThrow(
      "invalid choice",
    );
  });
  it("omits uncertain baseline and independently omits unsupported related fields", async () => {
    expect((await collectNumericPrices(source, provider({ baseline: 0.89 }))).offers).toEqual([]);
    const result = await collectNumericPrices(source, provider({ allowance: 0.94, overage: 0.8 }));
    expect(result.offers[0]).toMatchObject({ includedUsage: null, overage: null });
  });
  it("does not infer USD when the classifier cannot establish currency", async () => {
    expect(
      (await collectNumericPrices(source, provider({ currency_3: "unknown" }))).offers,
    ).toEqual([]);
  });
  it("rejects late model changes and missing answers without partial output", async () => {
    let calls = 0;
    const base = provider();
    await expect(
      collectNumericPrices(source, async (input) => ({
        ...((await base(input)) as object),
        model: ++calls > 2 ? "jev-1.14.0" : "jev-1.13.0",
      })),
    ).rejects.toThrow("model version changed");
    calls = 0;
    await expect(
      collectNumericPrices(source, async (input) =>
        ++calls > 2 ? { model: "jev-1.13.0", answers: {} } : base(input),
      ),
    ).rejects.toThrow("invalid answer");
  });
  it("rejects a missing answer in the second metadata batch", async () => {
    let calls = 0;
    const base = provider({ offer_0: "n0", offer_1: "n0", offer_2: "n0" });
    await expect(
      collectNumericPrices(source, async (input) => {
        if (++calls === 3) {
          expect(Object.keys(input.questions)).toContain("currency_3");
          return { model: "jev-1.13.0", answers: {} };
        }
        return base(input);
      }),
    ).rejects.toThrow("invalid answer");
  });
  it("does not invent zero prices for a source without numeric candidates", async () => {
    let called = false;
    const result = await collectNumericPrices("Contact sales", async () => {
      called = true;
      throw new Error("unexpected request");
    });
    expect(result).toMatchObject({ status: "collected", model: null, offers: [] });
    expect(called).toBe(false);
  });
  it("fails closed on source and candidate bounds and retains large complete sources", async () => {
    await expect(collectNumericPrices("x".repeat(256 * 1024 + 1), provider())).rejects.toThrow(
      "transport byte limit",
    );
    expect(() => extractNumericCandidates("1 ".repeat(513))).toThrow("candidate limit");
    const fullSource = "x".repeat(70_000) + "\n" + source;
    await collectNumericPrices(
      fullSource,
      provider({}, (input) => expect(JSON.parse(input.state).source).toBe(fullSource)),
    );
  });
});
