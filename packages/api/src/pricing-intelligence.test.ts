import { describe, expect, it } from "vitest";

import {
  CHOICE_CONFIDENCE_THRESHOLD,
  getPricingChoiceLabel,
  getPricingSignalMetadata,
  groupPricingChoices,
  pricingPolicyCoverage,
} from "./pricing-intelligence";

describe("pricing metadata", () => {
  it("uses current labels and keeps unknown signals out of catalog metadata", () => {
    expect(getPricingChoiceLabel("buying_motion")).toBe("Buying motion");
    expect(getPricingSignalMetadata("has_free_plan")?.label).toBe("Free plan");
    expect(getPricingSignalMetadata("unrecognized")).toBeNull();
    expect(CHOICE_CONFIDENCE_THRESHOLD).toBe(0.75);
  });
});

describe("grouping the commercial profile", () => {
  it("orders groups and keeps each choice in its catalog group", () => {
    const groups = groupPricingChoices([
      { key: "primary_market" },
      { key: "buying_motion" },
      { key: "price_disclosure" },
    ]);
    expect(groups.map((group) => group.key)).toEqual(["model", "access", "audience"]);
    expect(groups[0]?.items.map((item) => item.key)).toEqual(["buying_motion"]);
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

describe("policy comparison coverage", () => {
  it("does not treat nondisclosure as known applicability", () => {
    expect(
      pricingPolicyCoverage(12, {
        answered: 9,
        options: { charged: 3, not_disclosed: 4, not_applicable: 2 },
      }),
    ).toEqual({
      disclosed: 3,
      uncertain: 3,
      notApplicable: 2,
      notDisclosed: 4,
    });
  });
  it("keeps absent answers uncertain", () => {
    expect(pricingPolicyCoverage(5)).toEqual({
      disclosed: 0,
      uncertain: 5,
      notApplicable: 0,
      notDisclosed: 0,
    });
  });
  it("keeps explicit unknown answers uncertain rather than disclosed", () => {
    expect(
      pricingPolicyCoverage(10, {
        answered: 8,
        options: { charged: 2, unknown: 3, not_disclosed: 2, not_applicable: 1 },
      }),
    ).toEqual({ disclosed: 2, uncertain: 5, notApplicable: 1, notDisclosed: 2 });
  });
});
