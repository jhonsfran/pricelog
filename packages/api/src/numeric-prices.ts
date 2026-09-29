import { EXPECTED_JEV_MODEL } from "@pricelog/db/measurement-policy";
import {
  BASE_PRICE_CONFIDENCE,
  type NumericOffer,
  type NumericPrices,
} from "@pricelog/db/numeric-prices";
import type { NumericPriceBenchmark, NumericPriceGroup } from "@pricelog/db/schema/pages";
export type { NumericOffer, NumericPrices } from "@pricelog/db/numeric-prices";
export type { NumericPriceBenchmark } from "@pricelog/db/schema/pages";

export const PRICE_SAMPLE_MINIMUM = 3;

/** A display conversion, not a claim that an annual plan is payable monthly. */
export function monthlyEquivalent(offer: NumericOffer): number | null {
  if (!/^\d+(?:\.\d{1,6})?$/.test(offer.amount)) return null;
  const value = Number(offer.amount);
  if (!Number.isFinite(value) || value <= 0 || value > 1_000_000_000) return null;
  if (!["USD", "EUR", "GBP"].includes(offer.currency)) return null;
  if (!["flat", "seat"].includes(offer.chargeUnit)) return null;
  if (!["monthly", "annual"].includes(offer.billing)) return null;
  if (offer.amountPeriod === "month") return value;
  return offer.amountPeriod === "year" && offer.billing === "annual" ? value / 12 : null;
}

export function buildNumericBenchmark(
  pages: { numericPrices?: NumericPrices | null }[],
): NumericPriceBenchmark {
  const result: NumericPriceBenchmark = {
    version: "numeric-prices-v1",
    collected: 0,
    withOffers: 0,
    unavailable: 0,
    notCollected: 0,
    groups: [],
  };
  const groups = new Map<
    string,
    { group: Omit<NumericPriceGroup, "count" | "median" | "minimum" | "maximum">; values: number[] }
  >();
  for (const page of pages) {
    const prices = page.numericPrices;
    if (!prices || prices.version !== result.version) {
      result.notCollected++;
      continue;
    }
    if (prices.status !== "collected" || prices.model !== EXPECTED_JEV_MODEL) {
      result.unavailable++;
      continue;
    }
    result.collected++;
    const perProduct = new Map<string, { offer: NumericOffer; value: number }>();
    for (const offer of prices.offers) {
      const value = monthlyEquivalent(offer);
      if (value === null || offer.confidence < BASE_PRICE_CONFIDENCE || !offer.evidence.trim())
        continue;
      const key = `${offer.currency}:${offer.billing}:${offer.chargeUnit}`;
      const previous = perProduct.get(key);
      if (!previous || value < previous.value) perProduct.set(key, { offer, value });
    }
    if (
      prices.offers.some(
        (offer) =>
          offer.confidence >= BASE_PRICE_CONFIDENCE &&
          offer.evidence.trim() &&
          /^\d+(?:\.\d{1,6})?$/.test(offer.amount) &&
          Number(offer.amount) > 0 &&
          Number(offer.amount) <= 1_000_000_000,
      )
    )
      result.withOffers++;
    for (const [key, { offer, value }] of perProduct) {
      if (offer.currency === "DOLLAR_UNSPECIFIED") continue;
      let bucket = groups.get(key);
      if (!bucket) {
        bucket = {
          group: { currency: offer.currency, billing: offer.billing, chargeUnit: offer.chargeUnit },
          values: [],
        };
        groups.set(key, bucket);
      }
      bucket.values.push(value);
    }
  }
  result.groups = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, { group, values }]) => {
      values.sort((a, b) => a - b);
      const count = values.length;
      const enough = count >= PRICE_SAMPLE_MINIMUM;
      return {
        ...group,
        count,
        median: enough
          ? (values[Math.floor((count - 1) / 2)]! + values[Math.floor(count / 2)]!) / 2
          : null,
        minimum: enough ? values[0]! : null,
        maximum: enough ? values[count - 1]! : null,
      };
    });
  return result;
}
