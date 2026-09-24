import { describe, expect, it, vi } from "vitest";
import {
  CHARGING_SIGNAL_KEYS,
  PRACTICE_CHOICE_KEYS,
} from "@my-better-t-app/db/pricing-intelligence";
import type { ObservationPair } from "@my-better-t-app/api/pricing-history";
import {
  changeCandidates,
  jevModelVersion,
  jevRequestWithinBudget,
  requireJevModelVersion,
  sourceBlocks,
  verifyChanges,
  type Decide,
} from "./change-verification";

function pair(): ObservationPair {
  const common = {
    pageId: "p",
    rubricId: "v4",
    model: "jev-1.13.0",
    capturedAt: new Date(),
    contentKey: "source",
    slug: "p",
    name: "Page",
    choices: PRACTICE_CHOICE_KEYS.map((key) => ({
      key,
      choice: key === "failed_run_policy" ? "charged" : "not_applicable",
      confidence: 1,
      probabilities: {},
    })),
    signals: CHARGING_SIGNAL_KEYS.map((key) => ({ key, probability: 0 })),
  };
  return {
    before: { ...common, runId: "before", contentSha256: "before" },
    after: {
      ...common,
      runId: "after",
      contentSha256: "after",
      choices: common.choices.map((choice) =>
        choice.key === "failed_run_policy" ? { ...choice, choice: "not_charged" } : choice,
      ),
    },
  };
}
const before = "Failed runs are charged.";
const after = "Failed runs are not charged.";
function responder(validationProbability = 1, evidenceId = "b0"): Decide {
  return vi.fn(async ({ questions }) => ({
    model: "jev-1.13.0",
    answers: Object.fromEntries(
      Object.keys(questions).map((key) => {
        if (key.startsWith("evidence_")) return [key, { noul: validationProbability }];
        const value = key.startsWith("change_")
          ? "commercial"
          : key.startsWith("before_")
            ? evidenceId
            : "a0";
        return [key, { choice: value, confidence: 1, probabilities: { [value]: 1 } }];
      }),
    ),
  }));
}

describe("pricing change evidence", () => {
  it("keeps source excerpts in state without repeating them in every choice", async () => {
    const requests: Parameters<Decide>[0][] = [];
    const answer = responder();
    await verifyChanges(pair(), before, after, async (request) => {
      requests.push(request);
      return answer(request);
    });
    expect(requests[0]?.state).toContain(before);
    expect(JSON.stringify(requests[0]?.questions)).not.toContain(before);
    expect(JSON.stringify(requests[0]?.questions)).toContain("Source block b0");
  });
  it("leaves oversized combined sources unresolved without a provider request", async () => {
    const decide = responder();
    expect(
      await verifyChanges(pair(), "a".repeat(20_000), "b".repeat(20_000), decide),
    ).toMatchObject({ status: "uncertain", changes: [] });
    expect(decide).not.toHaveBeenCalled();
  });
  it("bounds both individual context and total request bytes, including Unicode", () => {
    expect(jevRequestWithinBudget({ state: "a".repeat(20_000), questions: { q: "small" } })).toBe(
      true,
    );
    expect(jevRequestWithinBudget({ state: "界".repeat(11_000), questions: { q: "small" } })).toBe(
      false,
    );
    expect(
      jevRequestWithinBudget({
        state: "a".repeat(20_000),
        questions: Object.fromEntries(Array.from({ length: 5 }, (_, i) => [i, "b".repeat(9_000)])),
      }),
    ).toBe(false);
  });
  it("uses the inclusive shared boundary for charging disclosure candidates", () => {
    const input = pair();
    input.before.signals = [{ key: "charges_credit_wallet", probability: 0.2 }];
    input.after.signals = [{ key: "charges_credit_wallet", probability: 0.8 }];
    expect(changeCandidates(input).candidates).toContainEqual(
      expect.objectContaining({ key: "charges_credit_wallet", disclosureOnly: true }),
    );
    input.before.signals[0]!.probability = 0.200001;
    expect(changeCandidates(input).candidates).not.toContainEqual(
      expect.objectContaining({ key: "charges_credit_wallet" }),
    );
  });

  it("publishes literal evidence only after the second verification", async () => {
    const decide = responder();
    const result = await verifyChanges(pair(), before, after, decide);
    expect(result.status).toBe("uncertain");
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]).toMatchObject({
      kind: "commercial",
      beforeEvidence: before,
      afterEvidence: after,
    });
    expect(decide).toHaveBeenCalledTimes(2);
  });
  it("suppresses a candidate when the selected excerpts fail verification", async () => {
    expect(await verifyChanges(pair(), before, after, responder(0.2))).toMatchObject({
      status: "uncertain",
      changes: [],
    });
  });
  it("rejects evidence IDs outside the supplied source blocks", async () => {
    await expect(verifyChanges(pair(), before, after, responder(1, "invented"))).rejects.toThrow(
      "invalid choice",
    );
  });
  it("does not interpret answer drift on identical sources as change", async () => {
    const input = pair();
    input.after.contentSha256 = input.before.contentSha256;
    const decide = responder();
    expect(await verifyChanges(input, before, before, decide)).toMatchObject({
      status: "reviewed",
      changes: [],
    });
    expect(decide).not.toHaveBeenCalled();
  });
  it("does not publish from truncated sources", async () => {
    const decide = responder();
    expect(await verifyChanges(pair(), "a".repeat(24_001), after, decide)).toMatchObject({
      status: "uncertain",
      changes: [],
    });
    expect(decide).not.toHaveBeenCalled();
  });
  it("treats newly disclosed terms as disclosure changes", async () => {
    const input = pair();
    input.before.choices = input.before.choices.map((choice) =>
      choice.key === "failed_run_policy" ? { ...choice, choice: "not_disclosed" } : choice,
    );
    const result = await verifyChanges(input, "See the plan terms.", after, responder());
    expect(result.changes[0]?.kind).toBe("disclosure");
  });
  it("keeps source block IDs bounded and resolves to exact source substrings", () => {
    const text = "x".repeat(24_000);
    const blocks = sourceBlocks(text, "b");
    expect(Object.keys(blocks).length).toBeLessThan(255);
    for (const excerpt of Object.values(blocks)) expect(text).toContain(excerpt);
  });
  it("reads the exact provider model and excludes aliases", () => {
    expect(jevModelVersion({ result: { model: "jev-1.13.0" } })).toBe("jev-1.13.0");
    expect(jevModelVersion({ model: "typesafe/jev" })).toBeNull();
  });
  it.each([{}, { model: "typesafe/jev" }, { result: { answers: {} } }])(
    "rejects an evaluation without an exact provider version",
    (response) => {
      expect(() => requireJevModelVersion(response)).toThrow(
        "Jev returned no exact provider model version",
      );
    },
  );
  it("returns the exact model version before evaluation persistence", () => {
    expect(requireJevModelVersion({ result: { model: "jev-1.13.0" } })).toBe("jev-1.13.0");
  });
});
