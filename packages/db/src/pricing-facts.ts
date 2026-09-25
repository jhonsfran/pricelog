import type { NumericCurrency, NumericUsageUnit } from "./numeric-prices";
import type { PRACTICE_CHOICE_CATALOG } from "./pricing-intelligence";

export const FACT_EXTRACTION_FINGERPRINT =
  "873c9f890a561b9c41384286b7edb559f87ae10c379fff9dcb66bdcdc609fdc8";
export const PRICING_FACTS_VERSION = "pricing-facts-v1";
export const FACT_CONFIDENCE = 0.9;
export const FACT_EVIDENCE_PROBABILITY = 0.95;

/** Each role describes the selected literal, never an inferred bill. */
export const NUMERIC_FACT_ROLES = {
  base_price: "A regular fixed recurring subscription fee, excluding per-seat fees.",
  seat_price: "A regular recurring price per customer seat or user.",
  usage_rate: "A standalone price for measured usage, outside credits and subscription overage.",
  outcome_rate: "A standalone price per explicitly successful business result.",
  overage_rate: "A rate charged after this offer's included allowance is exhausted.",
  credit_pack_price: "The money price of a separately purchased credit pack.",
  addon_price: "The money price of a separately purchased AI add-on.",
  included_allowance: "An exact included usage or credit quantity for this offer.",
  credit_conversion: "The number of credits consumed for a stated quantity of work.",
  purchased_credit_expiry: "The duration before separately purchased credits expire.",
  included_credit_rollover_limit: "The duration for which unused included credits carry over.",
  minimum_seats: "The minimum number of paid seats required to purchase this offer.",
} as const;
export type NumericFactRole = keyof typeof NUMERIC_FACT_ROLES;
export type FactUnit = NumericUsageUnit | "flat" | "day" | "month" | "year";
export type FactBilling = "monthly" | "annual" | "one_time" | "usage" | "unknown";
export type FactPeriod = "month" | "year" | "one_time" | "unknown";
export type EvidenceSpan = { text: string; start: number; end: number };

export type NumericFact = {
  key: NumericFactRole;
  /** Verbatim source name. Null means attribution was not established. */
  offer: string | null;
  amount: string;
  unit: FactUnit;
  currency: NumericCurrency | null;
  billing: FactBilling;
  period: FactPeriod;
  /** For rates and conversion only. Null never means one. */
  quantity: string | null;
  quantityUnit: NumericUsageUnit | null;
  evidence: EvidenceSpan;
  confidence: number;
};
export type OfferPolicy = {
  offer: string;
  key: keyof typeof PRACTICE_CHOICE_CATALOG;
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
  /** Missing disclosure has no positive evidence passage. */
  evidence: EvidenceSpan | null;
};
export type PricingFacts = {
  version: typeof PRICING_FACTS_VERSION;
  status: "collected" | "unavailable";
  model: string | null;
  facts: NumericFact[];
  policies: OfferPolicy[];
  coverage: {
    candidates: number;
    accepted: number;
    uncertain: number;
    ignored: number;
    policyUncertain: number;
  };
  reason?: string;
};

export function unavailablePricingFacts(reason: string): PricingFacts {
  return {
    version: PRICING_FACTS_VERSION,
    status: "unavailable",
    model: null,
    facts: [],
    policies: [],
    coverage: { candidates: 0, accepted: 0, uncertain: 0, ignored: 0, policyUncertain: 0 },
    reason,
  };
}

/** Duplicate identities remain ambiguous and must not be paired by array position. */
export function numericFactIdentity(fact: NumericFact): string | null {
  if (!fact.offer) return null;
  return JSON.stringify([
    fact.offer.trim().toLowerCase().replace(/\s+/g, " "),
    fact.key,
    fact.unit,
    fact.currency,
    fact.billing,
    fact.period,
    fact.quantityUnit,
  ]);
}
