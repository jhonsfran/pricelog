export const PRICING_SNAPSHOT_VERSION = "pricing-snapshot-v4" as const;
export const SNAPSHOT_IMPLEMENTATION_FINGERPRINT =
  "41f7bb7a74c2afbda53130533e7e24a286143b9f5ed0e3250467d7beee18d4ce";
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

export type MonetizationMetrics = {
  annual_discount?: { plans: { plan: string; percent: number }[]; median: number };
  entry_price?: { plan: string; amount: number; currency: string };
  price_ladder?: { tiers: { plan: string; amount: number }[]; currency: string; ratio: number };
  effective_unit_price?: {
    plan: string;
    unit: string;
    included: number;
    per_unit: number;
    per_thousand: number;
    currency: string;
  }[];
  overage_markup?: {
    quote: string;
    unit: string;
    per_unit: number;
    plan: string;
    markup: number;
  }[];
};

const CURRENCY_CODES: Record<string, string> = { $: "USD", "€": "EUR", "£": "GBP" };
const currencyOf = (raw: string) => {
  const match = /[$€£]|\b(USD|EUR|GBP)\b/.exec(raw);
  return match ? (match[1] ?? CURRENCY_CODES[match[0]] ?? null) : null;
};

/** Plain unit words a plan can include; the key is the unit reported. */
const UNIT_WORDS: Record<string, RegExp> = {
  credit: /\bcredits?\b/i,
  token: /\btokens?\b/i,
  minute: /\bminutes?\b|\bmins?\b/i,
  run: /\bruns?\b|\btasks?\b|\bexecutions?\b|\bworkflows?\b|\bcalls?\b/i,
  message: /\bmessages?\b|\bemails?\b|\bconversations?\b/i,
  request: /\brequests?\b/i,
};
const METERED_UNITS: Record<string, string> = {
  credits: "credit",
  tokens: "token",
  minutes: "minute",
  runs_tasks: "run",
  messages: "message",
};

/** An absolute quantity such as "300", "10,000 emails", "2.5K" or "1M"; not "10x" or "Unlimited". */
function absoluteQuantity(raw: string): number | null {
  const match = /^\s*(\d[\d,]*(?:\.\d+)?)\s*([KkMm])?(?![\dx×%])/.exec(raw);
  if (!match || /^\s*[\d,.]+\s*[x×%]/i.test(raw)) return null;
  const scale = !match[2] ? 1 : /k/i.test(match[2]) ? 1_000 : 1_000_000;
  const value = Number(match[1]!.replaceAll(",", "")) * scale;
  return value > 0 ? value : null;
}

const round = (value: number, places: number) => Math.round(value * 10 ** places) / 10 ** places;
const monthlyEquivalent = (price: PublishedPrice) =>
  price.price_numeric === null
    ? null
    : price.period === "month"
      ? price.price_numeric
      : price.period === "year"
        ? price.price_numeric / 12
        : null;

/**
 * Numbers that follow from published prices and features alone: annual discounts, entry price,
 * the price ladder, the effective price of an included unit, and how overage compares to it.
 * Anything the facts do not settle is left out rather than estimated.
 */
export function monetizationMetrics(
  snapshot: PublishedSnapshot,
  meteredUnit?: string,
): MonetizationMetrics {
  const metrics: MonetizationMetrics = {};
  const recurring = (price: PublishedPrice) => price.kind === "flat" || price.kind === "per_seat";

  const discounts = snapshot.offers.flatMap((offer) => {
    const monthly = offer.prices.find((price) => recurring(price) && price.billing === "monthly");
    const annual = offer.prices.find(
      (price) => recurring(price) && price.billing === "annual" && price.kind === monthly?.kind,
    );
    const [month, year] = [
      monthly && monthlyEquivalent(monthly),
      annual && monthlyEquivalent(annual),
    ];
    if (!month || !year || year >= month) return [];
    return [{ plan: offer.name, percent: Math.round((1 - year / month) * 100) }];
  });
  if (discounts.length) {
    const sorted = discounts.map((item) => item.percent).sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    metrics.annual_discount = {
      plans: discounts,
      median:
        sorted.length % 2
          ? sorted[middle]!
          : Math.round((sorted[middle - 1]! + sorted[middle]!) / 2),
    };
  }

  const tiers = snapshot.offers.flatMap((offer) => {
    const price =
      offer.prices.find((item) => recurring(item) && item.billing === "monthly") ??
      offer.prices.find((item) => recurring(item) && item.billing === "annual");
    const amount = price && monthlyEquivalent(price);
    const currency = price && currencyOf(price.price_raw);
    return amount && amount > 0 && currency
      ? [{ plan: offer.name, amount: round(amount, 2), currency }]
      : [];
  });
  const currencies = [...new Set(tiers.map((tier) => tier.currency))];
  if (currencies.length === 1) {
    const ladder = [...tiers].sort((left, right) => left.amount - right.amount);
    metrics.entry_price = ladder[0]!;
    if (ladder.length > 1)
      metrics.price_ladder = {
        tiers: ladder.map(({ plan, amount }) => ({ plan, amount })),
        currency: currencies[0]!,
        ratio: round(ladder.at(-1)!.amount / ladder[0]!.amount, 2),
      };
  }

  const wanted = meteredUnit ? METERED_UNITS[meteredUnit] : undefined;
  const units = Object.entries(UNIT_WORDS).filter(([unit]) => !wanted || unit === wanted);
  const effective = tiers.flatMap((tier) => {
    for (const feature of snapshot.features) {
      const unit = units.find(([, pattern]) => pattern.test(feature.name))?.[0];
      if (!unit) continue;
      const cell = feature.availability.find((item) => item.offer === tier.plan);
      const included = cell?.limit_raw ? absoluteQuantity(cell.limit_raw) : null;
      if (!included) continue;
      return [
        {
          plan: tier.plan,
          unit,
          included,
          per_unit: round(tier.amount / included, 4),
          per_thousand: round((tier.amount / included) * 1_000, 2),
          currency: tier.currency,
        },
      ];
    }
    return [];
  });
  if (effective.length) metrics.effective_unit_price = effective;

  const usage = [
    ...snapshot.offers.flatMap((offer) =>
      offer.prices.map((price) => ({ plan: offer.name as string | null, price })),
    ),
    ...(snapshot.shared_prices ?? []).map((price) => ({ plan: null, price })),
  ].filter(({ price }) => price.kind === "usage" && price.price_numeric !== null);
  const markups = usage.flatMap(({ plan, price }) => {
    const quote = price.price_raw.replace(/\s*\|\s*/g, " ");
    const unit = units.find(([, pattern]) => pattern.test(quote))?.[0];
    if (!unit) return [];
    const per = /(?:\/|\bper\b)\s*(?:extra\s+)?(\d[\d,]*(?:\.\d+)?\s*[KkMm]?)?/i.exec(quote);
    const quantity = per?.[1] ? absoluteQuantity(per[1]) : 1;
    if (!per || !quantity) return [];
    const perUnit = price.price_numeric! / quantity;
    const tierAmount = (name: string) => tiers.find((tier) => tier.plan === name)!.amount;
    const sameUnit = effective.filter((item) => item.unit === unit);
    // A rate for one plan compares with that plan; a rate for all plans with the cheapest tier.
    const baseline =
      sameUnit.find((item) => item.plan === plan) ??
      [...sameUnit].sort((left, right) => tierAmount(left.plan) - tierAmount(right.plan))[0];
    if (!baseline || currencyOf(quote) !== baseline.currency) return [];
    const included = tierAmount(baseline.plan) / baseline.included;
    return [
      {
        quote: price.price_raw,
        unit,
        per_unit: round(perUnit, 4),
        plan: baseline.plan,
        markup: round(perUnit / included, 2),
      },
    ];
  });
  if (markups.length) metrics.overage_markup = markups;
  return metrics;
}
