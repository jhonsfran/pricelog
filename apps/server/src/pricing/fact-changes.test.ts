import { describe, expect, it } from "vitest";
import { factChangeCandidates } from "./fact-changes";
import { verifyChanges, type Decide } from "./change-verification";
import { CHARGING_SIGNAL_KEYS } from "@my-better-t-app/db/pricing-intelligence";
import type { NumericFact, PricingFacts } from "@my-better-t-app/db/pricing-facts";
import type { ObservationPair } from "@my-better-t-app/api/pricing-history";
const expiryBefore = "Pro purchased credits expire after 12 months.";
const fact: NumericFact = {
  key: "purchased_credit_expiry",
  offer: "Pro",
  amount: "12",
  unit: "month",
  currency: null,
  billing: "one_time",
  period: "unknown",
  quantity: null,
  quantityUnit: null,
  evidence: { text: expiryBefore, start: 0, end: expiryBefore.length },
  confidence: 1,
};
function collection(facts: NumericFact[]): PricingFacts {
  return {
    version: "pricing-facts-v1",
    model: "jev-1.13.0",
    status: "collected",
    facts,
    policies: [],
    coverage: {
      candidates: facts.length,
      accepted: facts.length,
      uncertain: 0,
      ignored: 0,
      policyUncertain: 0,
    },
  };
}
describe("offer fact changes", () => {
  it.each([
    ["purchased_credit_expiry", "12", "3"],
    ["included_allowance", "100", "50"],
    ["base_price", "20", "30"],
  ] as const)("detects changed %s values when labels stay the same", (key, before, after) => {
    const a = { ...fact, key, amount: before, period: "month" as const };
    const b = { ...a, amount: after };
    const result = factChangeCandidates(collection([a]), collection([b]));
    expect(result.candidates).toHaveLength(1);
    expect(result.uncertain).toBe(false);
  });
  it("compares conversion denominators and ignores decimal formatting", () => {
    const a = {
      ...fact,
      key: "credit_conversion" as const,
      unit: "credit" as const,
      amount: "1.00",
      quantity: "1000",
      quantityUnit: "token" as const,
    };
    expect(
      factChangeCandidates(collection([a]), collection([{ ...a, amount: "1" }])).candidates,
    ).toEqual([]);
    expect(
      factChangeCandidates(collection([a]), collection([{ ...a, quantity: "500" }])).candidates,
    ).toHaveLength(1);
  });
  it("never pairs duplicates, renamed offers, unknown names, or mismatched contexts", () => {
    for (const after of [
      [fact, fact],
      [{ ...fact, offer: "New Pro" }],
      [{ ...fact, offer: null }],
      [{ ...fact, billing: "annual" as const }],
    ]) {
      expect(factChangeCandidates(collection([fact]), collection(after))).toMatchObject({
        candidates: [],
        uncertain: true,
      });
    }
  });
  it("keeps equal values unresolved when context is unknown or evidence qualifiers change", () => {
    const unknown = {
      ...fact,
      key: "base_price" as const,
      currency: "USD" as const,
      billing: "unknown" as const,
    };
    expect(factChangeCandidates(collection([unknown]), collection([unknown])).uncertain).toBe(true);
    expect(
      factChangeCandidates(
        collection([{ ...unknown, key: "addon_price", billing: "annual" }]),
        collection([{ ...unknown, key: "addon_price", billing: "annual" }]),
      ).uncertain,
    ).toBe(true);
    const changedEvidence = {
      ...fact,
      evidence: { ...fact.evidence, text: "Different unstated conditions" },
    };
    expect(factChangeCandidates(collection([fact]), collection([changedEvidence])).uncertain).toBe(
      true,
    );
  });
  it("retains uncertainty for absent, rejected and incompatible facts", () => {
    expect(factChangeCandidates(undefined, collection([fact])).uncertain).toBe(true);
    expect(factChangeCandidates(collection([fact]), collection([])).uncertain).toBe(true);
    expect(
      factChangeCandidates(collection([fact]), { ...collection([fact]), model: "jev-1.12.0" })
        .uncertain,
    ).toBe(true);
    expect(
      factChangeCandidates(collection([fact]), {
        ...collection([fact]),
        coverage: { ...collection([]).coverage, uncertain: 1 },
      }).uncertain,
    ).toBe(true);
  });
  it("detects per-offer policy changes even if the page still varies by offer", () => {
    const policy = {
      offer: "Pro",
      key: "failed_run_policy" as const,
      choice: "charged",
      confidence: 1,
      probabilities: {},
      evidence: null,
    };
    const before = { ...collection([]), policies: [policy] };
    const after = { ...before, policies: [{ ...policy, choice: "not_charged" }] };
    expect(factChangeCandidates(before, after).candidates).toHaveLength(1);
    const sameLabel = {
      ...collection([fact]),
      policies: [
        {
          ...policy,
          choice: "depends_on_failure",
          evidence: { text: "Network failures charged", start: 0, end: 24 },
        },
      ],
    };
    expect(
      factChangeCandidates(sameLabel, {
        ...sameLabel,
        policies: [
          {
            ...sameLabel.policies[0]!,
            evidence: { text: "Network failures not charged", start: 0, end: 28 },
          },
        ],
      }).uncertain,
    ).toBe(true);
  });
  it("publishes a literal expiry change only after independent evidence verification", async () => {
    const before = expiryBefore;
    const after = "Pro purchased credits expire after 3 months.";
    const common = {
      pageId: "p",
      rubricId: "v6",
      model: "jev-1.13.0",
      capturedAt: new Date(),
      contentKey: "k",
      choices: [],
      signals: CHARGING_SIGNAL_KEYS.map((key) => ({ key, probability: 0 })),
      name: "Product",
      slug: "p",
    };
    const pair: ObservationPair = {
      before: { ...common, runId: "a", contentSha256: "a", pricingFacts: collection([fact]) },
      after: {
        ...common,
        runId: "b",
        contentSha256: "b",
        pricingFacts: collection([
          { ...fact, amount: "3", evidence: { text: after, start: 0, end: after.length } },
        ]),
      },
    };
    let calls = 0;
    const decide: Decide = async ({ questions }) => {
      calls++;
      return {
        model: "jev-1.13.0",
        answers: Object.fromEntries(
          Object.keys(questions).map((key) => {
            const value = key.startsWith("change_")
              ? "commercial"
              : key.startsWith("before_")
                ? "b0"
                : "a0";
            return [
              key,
              key.startsWith("evidence_")
                ? { noul: 1 }
                : { choice: value, confidence: 1, probabilities: { [value]: 1 } },
            ];
          }),
        ),
      };
    };
    expect(await verifyChanges(pair, before, after, decide)).toMatchObject({
      status: "reviewed",
      changes: [{ kind: "commercial", beforeEvidence: before, afterEvidence: after }],
    });
    expect(calls).toBe(2);
    expect(
      await verifyChanges(
        pair,
        `${before}\n${"x".repeat(30_000)}`,
        `${after}\n${"y".repeat(30_000)}`,
        decide,
      ),
    ).toMatchObject({ status: "reviewed", changes: [{ kind: "commercial" }] });
    expect(await verifyChanges(pair, `Other offer: ${before}`, after, decide)).toMatchObject({
      status: "uncertain",
      changes: [],
    });
  });
});
