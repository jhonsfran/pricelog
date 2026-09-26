import {
  BASE_PRICE_CONFIDENCE,
  type NumericCurrency,
  type NumericOffer,
  type NumericPrices,
} from "@my-better-t-app/db/numeric-prices";
import type { PublishedSnapshot } from "@my-better-t-app/db/pricing-snapshot";
import { parseAmount } from "./quote-snapshot";

const CURRENCIES: readonly NumericCurrency[] = ["USD", "EUR", "GBP"];

/**
 * Projects a published snapshot onto the numeric price shape the benchmarks read. Only
 * subscription prices with a stated amount, currency, period and billing term qualify.
 */
export function numericPricesFromSnapshot(
  snapshot: PublishedSnapshot,
  model: string,
): NumericPrices {
  const offers: NumericOffer[] = [];
  for (const offer of snapshot.status === "collected" ? snapshot.offers : []) {
    for (const price of offer.prices) {
      if (price.role !== "base_price" && price.role !== "seat_price") continue;
      if (price.price_numeric === null) continue;
      if (price.period !== "month" && price.period !== "year") continue;
      const billing =
        price.billing === "monthly" || price.billing === "annual"
          ? price.billing
          : snapshot.billing_view;
      if (billing !== "monthly" && billing !== "annual") continue;
      const currency = parseAmount(price.price_raw)?.currency as NumericCurrency | undefined;
      if (!currency || !CURRENCIES.includes(currency)) continue;
      offers.push({
        billing,
        chargeUnit: price.role === "seat_price" || price.unit === "per_seat" ? "seat" : "flat",
        amount: String(price.price_numeric),
        currency,
        amountPeriod: price.period,
        evidence: price.price_raw,
        plan: offer.name,
        includedUsage: null,
        overage: null,
        confidence: BASE_PRICE_CONFIDENCE,
      });
    }
  }
  return offers.length
    ? { version: "numeric-prices-v1", status: "collected", model, offers }
    : {
        version: "numeric-prices-v1",
        status: "unavailable",
        model,
        offers: [],
        reason: "No published subscription price states its amount, currency, period and billing",
      };
}
