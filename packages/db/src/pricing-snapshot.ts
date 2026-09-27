export const PRICING_SNAPSHOT_VERSION = "pricing-snapshot-v4" as const;
export const SNAPSHOT_IMPLEMENTATION_FINGERPRINT =
  "ebcffaad1f9253455e9edd8131f9c75acc068b9180e6812ae0819e1f98ec2f86";
/** Identifies the capture and extraction code that produced a snapshot. */
export const PRICING_PIPELINE_ID = `${PRICING_SNAPSHOT_VERSION}-${SNAPSHOT_IMPLEMENTATION_FINGERPRINT.slice(0, 12)}`;

export const PRICE_KINDS = ["flat", "per_seat", "usage", "add_on", "free", "custom"] as const;
export const PRICE_PERIODS = ["month", "year", "one_time", "usage", "none"] as const;
export const PRICE_BILLINGS = ["monthly", "annual", "one_time", "usage", "unknown"] as const;

export type PriceKind = (typeof PRICE_KINDS)[number];
export type PricePeriod = (typeof PRICE_PERIODS)[number];
export type PriceBilling = (typeof PRICE_BILLINGS)[number];
export type BillingView = "monthly" | "annual" | "unknown";
export type FeatureStatus =
  | "included"
  | "not_included"
  | "add_on"
  | "limited"
  | "contact"
  | "unknown";

/** One price the extraction model quoted from the page and Jev confirmed as a whole claim. */
export type PublishedPrice = {
  kind: PriceKind;
  price_raw: string;
  price_numeric: number | null;
  period: PricePeriod;
  billing: PriceBilling;
  state: string;
};

export type PublishedOffer = {
  name: string;
  prices: PublishedPrice[];
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
  offers: PublishedOffer[];
  /** Usage, overage, add-on and credit prices that apply to no single plan. */
  shared_prices?: PublishedPrice[];
  features: PublishedFeature[];
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
    offers: [],
    features: [],
    reason,
  };
}

export type DerivedProfile = {
  price_disclosure: "full" | "partial" | "none";
  has_free_plan: boolean;
  requires_sales_contact: boolean;
  publishes_numeric_limits: boolean;
  charges_fixed_subscription: boolean;
  charges_per_seat: boolean;
  charges_direct_usage: boolean;
  charges_credit_wallet: boolean;
  charges_ai_addon: boolean;
};

/** Profile fields that follow from the published facts, so Jev is not asked about them. */
export function deriveProfile(snapshot: PublishedSnapshot): DerivedProfile {
  const planPrices = snapshot.offers.flatMap((offer) => offer.prices ?? []);
  const prices = [...planPrices, ...(snapshot.shared_prices ?? [])];
  const has = (kind: PriceKind) => prices.some((price) => price.kind === kind);
  const priced = snapshot.offers.filter((offer) =>
    (offer.prices ?? []).some((price) => price.kind !== "custom"),
  ).length;
  const quoted = snapshot.offers.filter((offer) =>
    (offer.prices ?? []).some((price) => price.kind === "custom"),
  ).length;
  return {
    price_disclosure:
      priced === 0 ? "none" : quoted > 0 || priced < snapshot.offers.length ? "partial" : "full",
    has_free_plan: planPrices.some((price) => price.kind === "free" || price.price_numeric === 0),
    requires_sales_contact: has("custom"),
    publishes_numeric_limits: snapshot.features.some((feature) =>
      feature.availability.some((cell) => /\d/.test(cell.limit_raw ?? "")),
    ),
    charges_fixed_subscription: has("flat"),
    charges_per_seat: has("per_seat"),
    charges_direct_usage: has("usage"),
    charges_credit_wallet: prices.some(
      (price) =>
        (price.kind === "usage" || price.kind === "add_on") && /credit/i.test(price.price_raw),
    ),
    charges_ai_addon: has("add_on"),
  };
}
