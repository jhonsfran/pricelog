/** Acceptance policy, not a calibrated accuracy estimate. */
export const BASE_PRICE_CONFIDENCE = 0.9;
/** Literal published prices; never estimates derived from classification scores. */
export const NUMERIC_USAGE_UNITS = [
  "request",
  "token",
  "message",
  "minute",
  "second",
  "gb",
  "seat",
  "credit",
  "workflow",
  "execution",
  "image",
  "page",
  "contact",
  "email",
  "record",
  "resolution",
  "action",
  "video",
  "conversation",
] as const;
export type NumericUsageUnit = (typeof NUMERIC_USAGE_UNITS)[number];
/** DOLLAR_UNSPECIFIED records a literal bare $ marker; denomination is not asserted. */
export type NumericCurrency = "USD" | "EUR" | "GBP" | "DOLLAR_UNSPECIFIED";
export type NumericUsage = {
  amount: string;
  unit: NumericUsageUnit;
  period: "month" | "year" | "one_time" | "unknown";
  evidence: string;
};
export type NumericRate = {
  amount: string;
  currency: NumericCurrency;
  quantity: string;
  unit: NumericUsageUnit;
  evidence: string;
};
export type NumericOffer = {
  billing: "monthly" | "annual";
  chargeUnit: "flat" | "seat";
  amount: string;
  currency: NumericCurrency;
  amountPeriod: "month" | "year";
  evidence: string;
  plan: string | null;
  includedUsage: NumericUsage | null;
  overage: NumericRate | null;
  confidence: number;
};
export type NumericDecisionAudit = {
  phase: string;
  answers: (
    | { key: string; type: "choice"; choice: string; confidence: number }
    | { key: string; type: "noul"; probability: number }
  )[];
};
export type NumericPrices = {
  version: "numeric-prices-v1";
  status: "collected" | "unavailable";
  model: string | null;
  offers: NumericOffer[];
  reason?: string;
  audit?: NumericDecisionAudit[];
};
