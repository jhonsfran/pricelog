import type { NumericFactRole } from "./pricing-facts";

export const PRICING_SNAPSHOT_VERSION = "pricing-snapshot-v3" as const;
export const SNAPSHOT_IMPLEMENTATION_FINGERPRINT =
  "e62c5cfc2503ef0861b2c3f2b8676b32ae6b89ae96d1d66c0476b523abd53564";

export const PROFILE_CHOICE_KEYS = [
  "buying_motion",
  "price_disclosure",
  "primary_customer_segment",
  "primary_market",
  "product_category",
] as const;

export const PROFILE_FLAG_KEYS = [
  "has_free_plan",
  "has_free_trial",
  "requires_card_for_free",
  "requires_sales_contact",
  "shows_enterprise_plan",
  "publishes_numeric_limits",
  "has_usage_calculator",
  "is_ai_native",
  "offers_copilot",
  "offers_autonomous_agent",
  "offers_agent_platform",
  "offers_agent_workforce",
  "has_usage_visibility",
] as const;

export type ProfileChoiceKey = (typeof PROFILE_CHOICE_KEYS)[number];
export type ProfileFlagKey = (typeof PROFILE_FLAG_KEYS)[number];
export type PriceRole = NumericFactRole | "free_plan" | "custom_price";
export type PriceBilling = "monthly" | "annual" | "one_time" | "usage" | "unknown";
export type BillingView = "monthly" | "annual" | "unknown";
export type FeatureStatus =
  | "included"
  | "not_included"
  | "add_on"
  | "limited"
  | "contact"
  | "unknown";

/** One price quoted from a captured UI state and classified by Jev. */
export type PublishedPrice = {
  role: PriceRole;
  price_raw: string;
  price_numeric: number | null;
  period: "month" | "year" | "one_time" | "unknown";
  unit: "per_seat" | "flat" | "usage" | "custom" | "unknown";
  billing: PriceBilling;
  state: string;
};

export type PublishedOffer = {
  name: string;
  is_highlighted?: boolean;
  is_free?: boolean;
  is_contact_sales?: boolean;
  audience_blurb?: string;
  prices: PublishedPrice[];
};

/** A usage, overage, add-on or credit-pack price that no plan card carries. */
export type PublishedRate = {
  name: string;
  price_raw: string;
  price_numeric: number;
  currency: string | null;
  per: string | null;
  offer: string | null;
  role: "usage_rate" | "overage_rate" | "addon_price" | "credit_pack_price";
  state: string;
};

export type PublishedFeature = {
  name: string;
  availability: { offer: string; status: FeatureStatus; limit_raw?: string }[];
};

export type PublishedSnapshot = {
  version: typeof PRICING_SNAPSHOT_VERSION;
  status: "collected" | "unavailable";
  billing_view?: BillingView;
  currency_visible?: string;
  flags: Partial<Record<ProfileFlagKey, boolean>>;
  offers: PublishedOffer[];
  features: PublishedFeature[];
  rates?: PublishedRate[];
  reason?: string;
};

/** Every quote or claim that did not publish, with the reason it stopped. */
export type SnapshotReview = {
  path: string;
  reason:
    | "missing"
    | "rejected"
    | "uncertain"
    | "invalid"
    | "unavailable"
    | "ungrounded"
    | "unclaimed"
    | "mismatch";
  value: string | number | boolean | null;
};

export function unavailableSnapshot(reason: string): PublishedSnapshot {
  return {
    version: PRICING_SNAPSHOT_VERSION,
    status: "unavailable",
    flags: {},
    offers: [],
    features: [],
    reason,
  };
}
