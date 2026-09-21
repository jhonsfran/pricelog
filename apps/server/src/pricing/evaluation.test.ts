import { describe, expect, it } from "vitest";
import {
  CHOICE_CONFIDENCE_THRESHOLD,
  TAG_PROBABILITY_THRESHOLD,
} from "@my-better-t-app/db/pricing-intelligence";

import type { JevAnswer } from "./types";
import { buildPublicEvaluation } from "./evaluation";

describe("public pricing evaluation", () => {
  it("accepts confident controlled choices", () => {
    const result = buildPublicEvaluation([
      choiceAnswer("buying_motion", "self_serve", 0.82),
      choiceAnswer("primary_market", "unknown", 0.99),
      choiceAnswer("primary_customer_segment", "enterprise", 0.7),
    ]);

    expect(result.choices).toEqual([
      {
        key: "buying_motion",
        choice: "self_serve",
        confidence: 0.82,
        probabilities: { self_serve: 0.82, unknown: 0.18 },
      },
    ]);
  });

  it("uses the shared confidence boundary for controlled choices", () => {
    const result = buildPublicEvaluation([
      choiceAnswer("buying_motion", "sales_led", CHOICE_CONFIDENCE_THRESHOLD - 0.001),
      choiceAnswer("primary_market", "finance", CHOICE_CONFIDENCE_THRESHOLD),
    ]);

    expect(result.choices).toEqual([
      expect.objectContaining({ key: "primary_market", choice: "finance" }),
    ]);
  });

  it("retains explicit nondisclosure and raw probabilities but omits ambiguity", () => {
    const accepted = choiceAnswer("failed_run_policy", "not_disclosed", 0.91);
    const result = buildPublicEvaluation([
      accepted,
      choiceAnswer("customer_spend_cap", "unknown", 0.99),
      choiceAnswer("purchased_credit_expiry", "expires", 0.5),
      choiceAnswer("credit_conversion", "invented", 0.99),
      { key: "charges_credit_wallet", type: "noul", noul: 0.1 },
    ]);
    expect(result.choices).toEqual([
      expect.objectContaining({
        key: "failed_run_policy",
        choice: "not_disclosed",
        probabilities: accepted.type === "choice" ? accepted.probabilities : {},
      }),
    ]);
    expect(result.signals).toEqual([{ key: "charges_credit_wallet", probability: 0.1 }]);
    expect(result.tags).toEqual([]);
  });

  it("publishes only catalog signals and tags positive high-probability signals", () => {
    const result = buildPublicEvaluation([
      { key: "is_ai_native", type: "noul", noul: 0.91 },
      { key: "offers_autonomous_agent", type: "noul", noul: 0.79 },
      { key: "market_developer_tools", type: "noul", noul: 0.94 },
      { key: "has_free_plan", type: "noul", noul: 0.97 },
      { key: "unmapped_signal", type: "noul", noul: 0.99 },
    ]);

    expect(result.signals).toHaveLength(4);
    expect(result.tags).toEqual(["ai-native", "developer-tools", "free-plan"]);
    expect(TAG_PROBABILITY_THRESHOLD).toBe(0.8);
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
