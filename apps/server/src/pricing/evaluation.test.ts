import { describe, expect, it } from "vitest";
import { CHOICE_CONFIDENCE_THRESHOLD } from "@my-better-t-app/db/pricing-intelligence";
import type { PublishedSnapshot } from "@my-better-t-app/db/pricing-snapshot";

import type { JevAnswer } from "./types";
import { buildPublicEvaluation } from "./evaluation";

const SNAPSHOT: PublishedSnapshot = {
  version: "pricing-snapshot-v4",
  status: "collected",
  offers: [
    {
      name: "Pro",
      prices: [
        {
          kind: "per_seat",
          price_raw: "$20/user/month",
          price_numeric: 20,
          period: "month",
          billing: "monthly",
          state: "default",
        },
      ],
    },
  ],
  features: [],
};

describe("public pricing evaluation", () => {
  it("keeps Jev's category and monetization answers and derives the rest from the snapshot", () => {
    const result = buildPublicEvaluation(
      [
        choiceAnswer("product_category", "coding_assistants", 0.9),
        choiceAnswer("limit_behavior", "pay_as_you_go", 0.6),
        choiceAnswer("metered_unit", "credits", 0.55),
        { key: "is_ai_native", type: "noul", noul: 0.99 },
      ],
      SNAPSHOT,
    );
    expect(result.choices).toEqual([
      {
        key: "product_category",
        choice: "coding_assistants",
        confidence: 0.9,
        probabilities: { coding_assistants: 0.9, unknown: 0.1 },
      },
      {
        key: "limit_behavior",
        choice: "pay_as_you_go",
        confidence: 0.6,
        probabilities: { pay_as_you_go: 0.6, unknown: 0.4 },
      },
      {
        key: "metered_unit",
        choice: "credits",
        confidence: 0.55,
        probabilities: { credits: 0.55, unknown: 0.45 },
      },
      { key: "price_disclosure", choice: "full", confidence: 1, probabilities: { full: 1 } },
    ]);
    expect(result.signals).toEqual([
      { key: "has_free_plan", probability: 0 },
      { key: "requires_sales_contact", probability: 0 },
      { key: "publishes_numeric_limits", probability: 0 },
      { key: "charges_fixed_subscription", probability: 0 },
      { key: "charges_per_seat", probability: 1 },
      { key: "charges_direct_usage", probability: 0 },
      { key: "charges_credit_wallet", probability: 0 },
      { key: "charges_ai_addon", probability: 0 },
    ]);
    expect(result.tags).toEqual(["per-seat"]);
  });

  it("leaves out a monetization answer that is not stated or below a majority", () => {
    expect(
      buildPublicEvaluation([
        choiceAnswer("spend_cap", "not_stated", 0.95),
        choiceAnswer("limit_behavior", "hard_stop", 0.49),
        choiceAnswer("metered_unit", "none_stated", 0.9),
        choiceAnswer("spend_cap", "yes", 0.4),
      ]).choices,
    ).toEqual([]);
  });

  it("drops a category below the confidence boundary or marked unknown", () => {
    expect(
      buildPublicEvaluation([
        choiceAnswer("product_category", "voice_agents", CHOICE_CONFIDENCE_THRESHOLD - 0.001),
      ]).choices,
    ).toEqual([]);
    expect(
      buildPublicEvaluation([choiceAnswer("product_category", "unknown", 0.99)]).choices,
    ).toEqual([]);
  });

  it("derives nothing from an unavailable snapshot", () => {
    const result = buildPublicEvaluation([], { ...SNAPSHOT, status: "unavailable" });
    expect(result).toEqual({ choices: [], signals: [], tags: [] });
  });
});

function choiceAnswer(key: string, choice: string, confidence: number): JevAnswer {
  return {
    key,
    type: "choice",
    choice,
    confidence,
    probabilities: { [choice]: confidence, unknown: Math.round((1 - confidence) * 100) / 100 },
  };
}
