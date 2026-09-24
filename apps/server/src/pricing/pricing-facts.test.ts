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
  return vi.fn(async ({ state, questions }) => {
    const data = JSON.parse(state);
    const expected = fixture.expected.find((fact) => fact.amount === data.selected?.amount);
    return {
      model: "jev-1.13.0",
      answers: Object.fromEntries(
        Object.entries(questions).map(([key, raw]) => {
          const question = raw as { type: string; criteria: Record<string, string> };
          if (question.type === "noul") {
            const name = data.candidates?.find(
              (item: { id: string }) => `name_${item.id}` === key,
            )?.text;
            return [
              key,
              {
                noul:
                  overrides[key] ??
                  (key.startsWith("name_") ? (fixture.offers.includes(name) ? 1 : 0) : 1),
              },
            ];
          }
          let value = "unknown";
          const policy = fixture.policies?.find(
            (item) => item.offer === data.offer && item.key === key,
          );
          if (policy) value = policy.choice;
          else if (key === "evidence") value = data.passages[0].id;
          else if (key.startsWith("role_")) {
            const number = data.candidates.find(
              (item: { id: string }) => `role_${item.id}` === key,
            );
            value = fixture.expected.find((fact) => fact.amount === number.amount)?.key ?? "other";
          } else if (key === "offer")
            value =
              data.offers.find((item: { text: string }) => item.text === expected?.offer)?.id ??
              "unknown";
          else if (key === "quantity")
            value =
              extractNumericCandidates(fixture.source).find(
                (item) => item.amount === expected?.quantity,
              )?.id ?? "one";
          else if (key === "quantity_unit") value = expected?.quantityUnit ?? "unknown";
          else if (expected) value = String(expected[key as keyof typeof expected] ?? "unknown");
          else if ("not_disclosed" in question.criteria) value = "not_disclosed";
          value = String(overrides[key] ?? value);
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
      if (JSON.parse(request.state).proposal) answer.answers.offer = { noul: 0.94 };
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
    await expect(
      collectPricingFacts(
        Array.from({ length: 254 }, (_, i) => `${i} requests`).join("\n"),
        decide,
      ),
    ).rejects.toThrow("candidate limit");
    expect(decide).not.toHaveBeenCalled();
  });
});
