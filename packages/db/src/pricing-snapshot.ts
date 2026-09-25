import type { NumericFactRole } from "./pricing-facts";
import type { PRICING_CHOICE_CATALOG } from "./pricing-intelligence";

export const PRICING_SNAPSHOT_VERSION = "pricing-snapshot-v2" as const;
export const SNAPSHOT_IMPLEMENTATION_FINGERPRINT =
  "e258dcd5cae2320c0b1bcdabeca07e25835e13e68f1907bed0665e3b2d60e47c";

export const DRAFT_CHOICE_KEYS = [
  "buying_motion",
  "price_disclosure",
  "primary_customer_segment",
  "primary_market",
  "product_category",
] as const;

export const DRAFT_FLAG_KEYS = [
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

export type DraftChoiceKey = (typeof DRAFT_CHOICE_KEYS)[number];
export type DraftFlagKey = (typeof DRAFT_FLAG_KEYS)[number];
export type PriceRole = NumericFactRole | "free_plan" | "custom_price";
export type FeatureStatus =
  | "included"
  | "not_included"
  | "add_on"
  | "limited"
  | "contact"
  | "unknown";

export type DraftPrice = {
  role: PriceRole;
  price_raw: string;
  price_numeric: number | null;
  period: "month" | "year" | "one_time" | "unknown";
  unit: "per_seat" | "flat" | "usage" | "custom" | "unknown";
};

export type DraftOffer = {
  name: string;
  is_highlighted: boolean;
  is_free: boolean;
  is_contact_sales: boolean;
  audience_blurb: string | null;
  prices: DraftPrice[];
};

export type DraftFeature = {
  name: string;
  availability: { offer: string; status: FeatureStatus; limit_raw: string | null }[];
};

export type DraftSnapshot = {
  [Key in DraftChoiceKey]: keyof (typeof PRICING_CHOICE_CATALOG)[Key]["options"] & string;
} & {
  billing_view: "monthly" | "annual" | "unknown";
  currency_visible: string | null;
  flags: Record<DraftFlagKey, boolean>;
  offers: DraftOffer[];
  features: DraftFeature[];
};

export type PublishedOffer = {
  name: string;
  is_highlighted?: boolean;
  is_free?: boolean;
  is_contact_sales?: boolean;
  audience_blurb?: string;
  prices: DraftPrice[];
};

export type PublishedFeature = {
  name: string;
  availability: { offer: string; status: FeatureStatus; limit_raw?: string }[];
};

export type PublishedSnapshot = {
  version: typeof PRICING_SNAPSHOT_VERSION;
  status: "collected" | "unavailable";
  billing_view?: DraftSnapshot["billing_view"];
  currency_visible?: string;
  flags: Partial<Record<DraftFlagKey, boolean>>;
  offers: PublishedOffer[];
  features: PublishedFeature[];
  reason?: string;
};

export type SnapshotReview = {
  path: string;
  reason: "missing" | "rejected" | "uncertain" | "invalid" | "unavailable";
  draftValue: string | number | boolean | null;
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
