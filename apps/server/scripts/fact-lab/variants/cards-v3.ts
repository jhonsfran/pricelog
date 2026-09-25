import { cardsVariantV3, type CardsV3Settings } from "./cards-engine-v3";

const base: CardsV3Settings = {
  batch: "card",
  roleThreshold: 0.75,
  headingThreshold: 0.8,
  jsonLdNames: true,
};

export const cardsV3Variants = [
  cardsVariantV3(
    {
      id: "cards-v3a",
      parent: "cards-v2d",
      hypothesis:
        "One Noul per card on whether the heading is a plan name replaces the per-price offer Choice; code composes heading, selected tier and JSON-LD names.",
    },
    base,
  ),
  cardsVariantV3(
    {
      id: "cards-v3b",
      parent: "cards-v3a",
      hypothesis:
        "Without JSON-LD names, heading Noul plus tier composition still attributes every price.",
    },
    { ...base, jsonLdNames: false },
  ),
  cardsVariantV3(
    {
      id: "cards-v3c",
      parent: "cards-v3a",
      hypothesis:
        "All cards in one request cost fewer tokens without lowering precision or recall (TypeSafe: batching adds no noise).",
    },
    { ...base, batch: "page" },
  ),
];
