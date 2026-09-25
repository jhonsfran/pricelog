import { cardsVariant } from "./cards-engine-v1";

export const cardsV1 = cardsVariant(
  {
    id: "cards-v1",
    parent: "baseline",
    hypothesis:
      "One small state per plan card with two Choice questions per price (role, offer); code derives unit, period, commitment and currency. Removes whole-page state, id indirection and chained gates.",
  },
  { batch: "card", roleThreshold: 0.75, offerThreshold: 0.75 },
);
