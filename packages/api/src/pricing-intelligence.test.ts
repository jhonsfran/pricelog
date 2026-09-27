import { describe, expect, it } from "vitest";

import {
  CHOICE_CONFIDENCE_THRESHOLD,
  getPricingChoiceLabel,
  getPricingSignalMetadata,
  groupPricingChoices,
} from "./pricing-intelligence";

describe("pricing metadata", () => {
  it("uses current labels and keeps unknown signals out of catalog metadata", () => {
    expect(getPricingChoiceLabel("price_disclosure")).toBe("Price disclosure");
    expect(getPricingChoiceLabel("buying_motion")).toBe("Buying motion");
    expect(getPricingSignalMetadata("has_free_plan")?.label).toBe("Free plan");
    expect(getPricingSignalMetadata("unrecognized")).toBeNull();
    expect(CHOICE_CONFIDENCE_THRESHOLD).toBe(0.75);
  });
});

describe("grouping the commercial profile", () => {
  it("orders groups and keeps each choice in its catalog group", () => {
    const groups = groupPricingChoices([{ key: "product_category" }, { key: "price_disclosure" }]);
    expect(groups.map((group) => group.key)).toEqual(["access", "audience"]);
    expect(groups[0]?.items.map((item) => item.key)).toEqual(["price_disclosure"]);
  });

  it("omits groups with no choices rather than rendering an empty heading", () => {
    const groups = groupPricingChoices([{ key: "product_category" }]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.key).toBe("audience");
  });

  it("keeps a choice from an older rubric visible under Other", () => {
    const groups = groupPricingChoices([{ key: "product_category" }, { key: "buying_motion" }]);
    expect(groups.at(-1)).toMatchObject({ key: "other", items: [{ key: "buying_motion" }] });
  });
});
