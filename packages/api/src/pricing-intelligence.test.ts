import { describe, expect, it } from "vitest";

import {
  CHOICE_CONFIDENCE_THRESHOLD,
  getPricingChoiceLabel,
  getPricingScoreLabel,
  getPricingScoreMetadata,
  getPricingSignalMetadata,
  groupPricingChoices,
} from "./pricing-intelligence";

describe("pricing intelligence display compatibility", () => {
  it("keeps historical score and choice keys readable", () => {
    expect(getPricingScoreLabel("cost_predictability")).toBe("Cost predictability");
    expect(getPricingScoreLabel("pricing_transparency")).toBe("Pricing transparency");
    expect(getPricingChoiceLabel("legacy_buying_motion")).toBe("Legacy buying motion");
  });

  it("does not expose unknown signals as catalog metadata", () => {
    expect(getPricingSignalMetadata("has_free_plan")?.label).toBe("Free plan");
    expect(getPricingSignalMetadata("legacy_signal")).toBeNull();
  });
});

describe("score methodology metadata", () => {
  it("exports the evaluator's classification threshold", () => {
    expect(CHOICE_CONFIDENCE_THRESHOLD).toBe(0.75);
  });

  it("exposes the exact question behind a known score", () => {
    expect(getPricingScoreMetadata("value_metric_alignment")?.question).toBe(
      "How closely does the billing unit track the value the customer receives?",
    );
    expect(getPricingScoreMetadata("value_metric_alignment")?.criteria).toHaveLength(5);
  });

  it("returns null for an unknown score so the client can degrade to the label", () => {
    expect(getPricingScoreMetadata("pricing_transparency")).toBeNull();
  });
});

describe("grouping the commercial profile", () => {
  it("orders groups and keeps each choice in its catalog group", () => {
    const groups = groupPricingChoices([
      { key: "primary_market" },
      { key: "ai_cost_passthrough" },
      { key: "value_metric" },
      { key: "price_disclosure" },
    ]);
    expect(groups.map((group) => group.key)).toEqual(["model", "access", "ai_cost", "audience"]);
    expect(groups[0]?.items.map((item) => item.key)).toEqual(["value_metric"]);
  });

  it("omits groups with no choices rather than rendering an empty heading", () => {
    const groups = groupPricingChoices([{ key: "buying_motion" }]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.key).toBe("model");
  });

  it("keeps a choice from a newer server visible under Other", () => {
    const groups = groupPricingChoices([{ key: "buying_motion" }, { key: "future_choice" }]);
    expect(groups.at(-1)).toMatchObject({ key: "other", items: [{ key: "future_choice" }] });
  });
});
