import { cardsVariantV2, type CardsV2Settings } from "./cards-engine-v2";

const base: CardsV2Settings = {
  batch: "card",
  kind: "fine",
  seat: "code",
  offer: "jev",
  offerWording: "purchasable",
  roleThreshold: 0.75,
  offerThreshold: 0.75,
  seatThreshold: 0.8,
};

/** Each child changes one lever relative to its parent. */
export const cardsV2Variants = [
  cardsVariantV2(
    {
      id: "cards-v2a",
      parent: "cards-v1",
      hypothesis: "Engine v2 with v1 settings reproduces cards-v1; the control for later levers.",
    },
    base,
  ),
  cardsVariantV2(
    {
      id: "cards-v2b",
      parent: "cards-v2a",
      hypothesis:
        "A coarse price-kind Choice plus code-read per-user wording removes the base-vs-seat ambiguity and raises role confidence.",
    },
    { ...base, kind: "coarse", seat: "code" },
  ),
  cardsVariantV2(
    {
      id: "cards-v2c",
      parent: "cards-v2b",
      hypothesis:
        "Asking for the plan or tier name instead of the purchasable offer raises attribution confidence for free and custom plans.",
    },
    { ...base, kind: "coarse", seat: "code", offerWording: "plan_or_tier" },
  ),
  cardsVariantV2(
    {
      id: "cards-v2d",
      parent: "cards-v2c",
      hypothesis:
        "Vendor JSON-LD offer names fix offer identity in code when exactly one card option matches, so Jev attributes only the rest.",
    },
    { ...base, kind: "coarse", seat: "code", offerWording: "plan_or_tier", offer: "jsonld+jev" },
  ),
];
