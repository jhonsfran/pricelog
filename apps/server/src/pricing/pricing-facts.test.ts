import { describe, expect, it, vi } from "vitest";
import { collectPricingFacts } from "./pricing-facts";
import { numericPricesFromFacts } from "./fact-projection";
import { extractNumericCandidates } from "./source-candidates";
import { factFixtures, type FactFixture } from "./fixtures/pricing-facts";
import type { Decide } from "./change-verification";

/** Scripted classifications verify the pipeline, not Jev's semantic accuracy. */
function fixtureDecide(
  fixture: FactFixture,
  overrides: Record<string, string | number> = {},
): Decide {
  const numbers = extractNumericCandidates(fixture.source);
  return vi.fn(async ({ state, questions }) => {
    const data = JSON.parse(state);
    return {
      model: "jev-1.13.0",
      answers: Object.fromEntries(
        Object.entries(questions).map(([key, raw]) => {
          const question = raw as { type: string; criteria: Record<string, string> };
          const numberId = /_(n\d+)$/.exec(key)?.[1];
          const number = numbers.find((item) => item.id === numberId);
          const expected = fixture.expected.find((fact) => fact.amount === number?.amount);
          const field = numberId ? key.slice(0, -numberId.length - 1) : key;
          if (question.type === "noul") {
            const name =
              Array.isArray(data.candidates) &&
              data.candidates.find((item: { id: string }) => `name_${item.id}` === key)?.text;
            return [
              key,
              {
                noul:
                  overrides[key] ??
                  overrides[field] ??
                  (key.startsWith("name_") ? (fixture.offers.includes(name) ? 1 : 0) : 1),
              },
            ];
          }
          let value = "unknown";
          const policyKey = /^policy_(o\d+)_(.+)$/.exec(key);
          if (policyKey) {
            const policy = fixture.policies?.find(
              (item) => item.offer === data.offers[policyKey[1]!] && item.key === policyKey[2],
            );
            value = policy?.choice ?? "not_disclosed";
          } else if (key.startsWith("evidence_")) value = Object.keys(data.passages)[0]!;
          else if (field === "role") value = expected?.key ?? "other";
          else if (field === "offer")
            value =
              data.offers.find((item: { text: string }) => item.text === expected?.offer)?.id ??
              "unknown";
          else if (field === "quantity_scope") value = Object.keys(data.passages)[0]!;
          else if (field === "quantity")
            value =
              data.targets[numberId!].candidates.find(
                (item: { amount: string; id: string }) => item.amount === expected?.quantity,
              )?.id ?? "one";
          else if (field === "quantity_unit") value = expected?.quantityUnit ?? "unknown";
          else if (expected) value = String(expected[field as keyof typeof expected] ?? "unknown");
          else if ("not_disclosed" in question.criteria) value = "not_disclosed";
          value = String(overrides[key] ?? overrides[field] ?? value);
          const confidence = Number(overrides.confidence ?? 1);
          return [key, { choice: value, confidence, probabilities: { [value]: confidence } }];
        }),
      ),
    };
  });
}

describe("Jev source fact collection", () => {
  it.each(factFixtures)("preserves exact facts: $id", async (fixture) => {
    const facts = await collectPricingFacts(fixture.source, fixtureDecide(fixture));
    expect(facts.facts.map(({ evidence: _e, confidence: _c, ...fact }) => fact)).toEqual(
      fixture.expected,
    );
    for (const policy of fixture.policies ?? [])
      expect(facts.policies).toContainEqual(expect.objectContaining(policy));
    expect(facts.model).toBe("jev-1.13.0");
    expect(facts.coverage.accepted).toBe(fixture.expected.length);
    expect(facts.coverage.uncertain).toBe(0);
    for (const fact of facts.facts)
      expect(fixture.source.slice(fact.evidence.start, fact.evidence.end)).toBe(fact.evidence.text);
  });
  it("keeps all plans and attaches only each plan's allowance", async () => {
    const fixture = factFixtures[0]!;
    const prices = numericPricesFromFacts(
      await collectPricingFacts(fixture.source, fixtureDecide(fixture)),
    );
    expect(
      prices.offers.map((item) => [item.plan, item.amount, item.includedUsage?.amount]),
    ).toEqual([
      ["Pro", "20", "100"],
      ["Team", "50", "500"],
    ]);
  });
  it("asks independent facts and policies against shared state", async () => {
    const fixture = factFixtures[0]!;
    const decide = fixtureDecide(fixture);
    await collectPricingFacts(fixture.source, decide);
    expect(decide).toHaveBeenCalledTimes(5);
  });
  it("skips offer policy calls when the page-wide evaluation found no positive policy", async () => {
    const fixture = factFixtures[0]!;
    const decide = fixtureDecide(fixture);
    const result = await collectPricingFacts(fixture.source, decide, []);
    expect(result.facts).toHaveLength(fixture.expected.length);
    expect(result.policies).toEqual([]);
    expect(
      vi
        .mocked(decide)
        .mock.calls.some(([request]) =>
          Object.keys(request.questions).some((key) => key.startsWith("policy_")),
        ),
    ).toBe(false);
  });
  it("sends only relevant source passages for candidate decisions", async () => {
    const fixture = factFixtures[0]!;
    const source = `${fixture.source}\n\n${"Unrelated section text. ".repeat(150)}\nLAST_FOOTER_MARKER`;
    const decide = fixtureDecide({ ...fixture, source });
    const result = await collectPricingFacts(source, decide, []);
    expect(result.facts).toHaveLength(fixture.expected.length);
    const candidateCalls = vi
      .mocked(decide)
      .mock.calls.filter(([request]) =>
        Object.keys(request.questions).some((key) => key.startsWith("role_")),
      );
    expect(candidateCalls.length).toBeGreaterThan(0);
    for (const [request] of candidateCalls) {
      const state = JSON.parse(request.state) as { source: string };
      expect(state.source).not.toContain("LAST_FOOTER_MARKER");
    }
  });
  it("collects prices when a long feature table has more than 128 distinct labels", async () => {
    const fixture = factFixtures[0]!;
    const featureLines = Array.from({ length: 130 }, (_, index) => {
      const first = String.fromCharCode(65 + Math.floor(index / 26));
      const second = String.fromCharCode(65 + (index % 26));
      return `Feature ${first}${second}`;
    });
    const source = `${fixture.source}\n\n${featureLines.join("\n")}`;
    const prices = numericPricesFromFacts(
      await collectPricingFacts(source, fixtureDecide({ ...fixture, source })),
    );
    expect(prices.offers.map((offer) => [offer.plan, offer.amount])).toEqual([
      ["Pro", "20"],
      ["Team", "50"],
    ]);
  });
  it("retains free prices as facts but excludes them from paid baseline prices", async () => {
    const fixture = factFixtures.find((item) => item.id === "free-is-explicit")!;
    expect(
      numericPricesFromFacts(await collectPricingFacts(fixture.source, fixtureDecide(fixture)))
        .offers,
    ).toEqual([]);
  });
  it("abstains on uncertain classifications", async () => {
    const fixture = factFixtures[0]!;
    const result = await collectPricingFacts(
      fixture.source,
      fixtureDecide(fixture, { confidence: 0.89 }),
    );
    expect(result.facts).toEqual([]);
    expect(result.coverage.uncertain).toBe(4);
  });
  it("requires independent attribution checks", async () => {
    const fixture = factFixtures[0]!;
    const baseline = fixtureDecide(fixture);
    const result = await collectPricingFacts(fixture.source, async (request) => {
      const answer = (await baseline(request)) as { answers: Record<string, unknown> };
      if (JSON.parse(request.state).proposals)
        for (const key of Object.keys(answer.answers))
          if (key.startsWith("offer_")) answer.answers[key] = { noul: 0.94 };
      return answer;
    });
    expect(result.facts).toEqual([]);
    expect(result.coverage.uncertain).toBe(4);
  });
  it("does not fabricate a denominator, literal, offer or model", async () => {
    const fixture = factFixtures[0]!;
    await expect(
      collectPricingFacts(fixture.source, fixtureDecide(fixture, { offer: "invented" })),
    ).rejects.toThrow("invalid choice");
    const base = fixtureDecide(fixture);
    await expect(
      collectPricingFacts(fixture.source, async (request) => ({
        ...((await base(request)) as object),
        model: "jev-1.14.0",
      })),
    ).rejects.toThrow("Unapproved Jev model");
    await expect(
      collectPricingFacts(fixture.source, async () => ({ model: "jev-1.13.0", answers: {} })),
    ).rejects.toThrow("invalid answer");
  });
  it("does not treat an unsupported currency marker as a bare dollar", async () => {
    const fixture = { ...factFixtures[4]!, source: "## Pro\nCAD $20 per month, billed monthly." };
    const result = await collectPricingFacts(fixture.source, fixtureDecide(fixture));
    expect(result.facts).toEqual([]);
  });
  it("counts unsupported numeric syntax as unresolved", async () => {
    const fixture = {
      id: "shorthand",
      source: "## Pro\nIncludes 100k credits each month.",
      offers: ["Pro"],
      expected: [],
    };
    expect(
      (await collectPricingFacts(fixture.source, fixtureDecide(fixture))).coverage.uncertain,
    ).toBe(1);
  });
  it("fails closed on bounds before publishing partial facts", async () => {
    const decide = fixtureDecide(factFixtures[0]!);
    await expect(collectPricingFacts("x".repeat(100_000), decide)).rejects.toThrow(
      "transport byte limit",
    );
    expect(decide).not.toHaveBeenCalled();
  });
  it("classifies more than 253 numeric candidates without one global Choice menu", async () => {
    const source = Array.from({ length: 254 }, (_, i) => `${i} requests`).join("\n");
    const fixture = { id: "many-numbers", source, offers: [], expected: [] };
    const facts = await collectPricingFacts(source, fixtureDecide(fixture));
    expect(facts.coverage.ignored).toBe(254);
  });
});
