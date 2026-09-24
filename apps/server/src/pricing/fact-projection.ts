import type { PricingFacts, NumericFact } from "@my-better-t-app/db/pricing-facts";
import {
  NUMERIC_USAGE_UNITS,
  type NumericOffer,
  type NumericPrices,
  type NumericUsageUnit,
} from "@my-better-t-app/db/numeric-prices";

/** Facts retain every accepted offer. The API chooses category minima in code. */
export function numericPricesFromFacts(collection: PricingFacts): NumericPrices {
  if (collection.status !== "collected")
    return {
      version: "numeric-prices-v1",
      status: "unavailable",
      model: collection.model,
      offers: [],
      reason: collection.reason,
    };
  const offers: NumericOffer[] = [];
  for (const fact of collection.facts) {
    if (
      (fact.key !== "base_price" && fact.key !== "seat_price") ||
      !fact.currency ||
      Number(fact.amount) <= 0 ||
      (fact.billing !== "monthly" && fact.billing !== "annual") ||
      (fact.period !== "month" && fact.period !== "year") ||
      (fact.billing === "monthly" && fact.period !== "month")
    )
      continue;
    // An unnamed or ambiguous plan cannot borrow an allowance from the whole page.
    const related = (key: NumericFact["key"]) =>
      fact.offer
        ? collection.facts.filter(
            (item) =>
              item.key === key && item.offer === fact.offer && item.billing === fact.billing,
          )
        : [];
    const allowances = related("included_allowance");
    const rates = related("overage_rate");
    const allowance =
      allowances.length === 1 &&
      NUMERIC_USAGE_UNITS.includes(allowances[0]!.unit as NumericUsageUnit)
        ? allowances[0]
        : undefined;
    const rate = rates.length === 1 ? rates[0] : undefined;
    offers.push({
      plan: fact.offer,
      billing: fact.billing,
      chargeUnit: fact.key === "seat_price" ? "seat" : "flat",
      amount: fact.amount,
      amountPeriod: fact.period,
      currency: fact.currency,
      confidence: fact.confidence,
      evidence: fact.evidence.text,
      includedUsage: allowance
        ? {
            amount: allowance.amount,
            unit: allowance.unit as NumericUsageUnit,
            period: allowance.period,
            evidence: allowance.evidence.text,
          }
        : null,
      overage:
        rate?.currency && rate.quantity && rate.quantityUnit
          ? {
              amount: rate.amount,
              currency: rate.currency,
              quantity: rate.quantity,
              unit: rate.quantityUnit,
              evidence: rate.evidence.text,
            }
          : null,
    });
  }
  return { version: "numeric-prices-v1", status: "collected", model: collection.model, offers };
}
