import type {
  FeatureStatus,
  PublishedFeature,
  PublishedPrice,
  PublishedSnapshot,
} from "@pricelog/api/pricing-snapshot";

export type Billing = "monthly" | "annual";

const CURRENCY_CODES: Record<string, string> = { $: "USD", "€": "EUR", "£": "GBP" };

/** The currency a quote is printed in, or null when it names none. */
export function currencyOf(raw: string): string | null {
  const match = /[$€£]|\b(USD|EUR|GBP)\b/.exec(raw);
  return match ? (match[1] ?? CURRENCY_CODES[match[0]] ?? null) : null;
}

/** The quote as the page printed it, without the separators extraction puts between its parts. */
export function cleanQuote(raw: string) {
  return raw
    .replace(/\s*\|\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: amount > 0 && amount < 1 ? 4 : Number.isInteger(amount) ? 0 : 2,
  }).format(amount);
}

const recurring = (price: PublishedPrice) => price.kind === "flat" || price.kind === "per_seat";

/** "$0.21 /hr" → "/hr", "from $2/minute" → "/minute": the unit a usage rate is quoted per. */
function usageUnit(raw: string) {
  const match = /(?:\/|\bper\b)\s*([a-z][a-z\s.]{0,18})/i.exec(cleanQuote(raw));
  return match ? `/${match[1]!.trim()}` : null;
}

export type PriceDisplay = {
  /** The figure a pricing page would set large. */
  amount: string;
  /** What the figure is per, set small beside it. */
  unit: string | null;
};

/**
 * A price as a pricing page sets it: the amount large, its unit small. The amount comes from the
 * verified number and the currency printed in the quote; a quote without both stays as printed.
 */
export function displayPrice(price: PublishedPrice): PriceDisplay {
  const currency = currencyOf(price.price_raw);
  if (price.kind === "free")
    return {
      amount: price.price_numeric === 0 && currency ? formatMoney(0, currency) : "Free",
      unit: null,
    };
  if (price.kind === "custom") return { amount: "Custom", unit: null };
  if (price.price_numeric === null || !currency)
    return { amount: cleanQuote(price.price_raw), unit: null };
  const per =
    price.period === "month"
      ? "/mo"
      : price.period === "year"
        ? "/yr"
        : price.period === "one_time"
          ? " once"
          : price.period === "usage"
            ? usageUnit(price.price_raw)
            : null;
  const seat = price.kind === "per_seat" ? "/seat" : "";
  return {
    amount: formatMoney(price.price_numeric, currency),
    unit: seat || per ? `${seat}${per ?? ""}` : null,
  };
}

export function priceText(price: PublishedPrice) {
  const { amount, unit } = displayPrice(price);
  return unit ? `${amount}${unit}` : amount;
}

export function billingNote(price: PublishedPrice) {
  if (price.billing === "annual") return "Billed annually";
  if (price.billing === "monthly") return "Billed monthly";
  if (price.billing === "one_time") return "One-time payment";
  if (price.billing === "usage") return "Charged per use";
  return null;
}

const KIND_RANK: Record<PublishedPrice["kind"], number> = {
  flat: 0,
  per_seat: 0,
  free: 1,
  usage: 2,
  add_on: 3,
  custom: 4,
};

/**
 * The price a plan leads with under the chosen billing view: a recurring price billed that way
 * first, then a quote from the visible page over one from its structured data.
 */
export function headlinePrice(prices: PublishedPrice[], billing: Billing | null) {
  const rank = (price: PublishedPrice) => [
    billing && recurring(price) && price.billing !== billing ? 1 : 0,
    price.state === "structured data" ? 1 : 0,
    KIND_RANK[price.kind],
  ];
  return prices
    .map((price, index) => ({ price, index, rank: rank(price) }))
    .sort(
      (left, right) =>
        left.rank[0]! - right.rank[0]! ||
        left.rank[1]! - right.rank[1]! ||
        left.rank[2]! - right.rank[2]! ||
        left.index - right.index,
    )[0]?.price;
}

/** Every other quote for the plan, without repeats of a figure already shown. */
export function otherQuotes(prices: PublishedPrice[], headline: PublishedPrice | undefined) {
  const shown = new Set(headline ? [priceKey(headline)] : []);
  return prices.filter((price) => {
    if (price === headline) return false;
    const key = priceKey(price);
    if (shown.has(key)) return false;
    shown.add(key);
    return true;
  });
}

/** Two quotes repeat each other when a reader would see the same figure: every custom quote does. */
const priceKey = (price: PublishedPrice) =>
  price.kind === "custom" || price.kind === "free"
    ? price.kind
    : price.price_numeric === null
      ? `${price.kind}:${cleanQuote(price.price_raw).toLowerCase()}`
      : `${price.kind}:${price.price_numeric}:${recurring(price) ? price.billing : ""}`;

/** The billing views a reader can switch between: both only when some plan prices both. */
export function billingViews(snapshot: PublishedSnapshot): Billing[] {
  const views = new Set<Billing>();
  for (const offer of snapshot.offers)
    for (const price of offer.prices)
      if (recurring(price) && (price.billing === "monthly" || price.billing === "annual"))
        views.add(price.billing);
  return (["monthly", "annual"] as const).filter((view) => views.has(view));
}

export function defaultBilling(snapshot: PublishedSnapshot): Billing | null {
  const views = billingViews(snapshot);
  const shown = snapshot.billing_view;
  if (shown === "monthly" || shown === "annual")
    return views.includes(shown) ? shown : (views[0] ?? null);
  return views[0] ?? null;
}

export type PlanColumn = { name: string; prices: PublishedPrice[] };

/** Every plan the page names: priced plans in page order, then plans only the feature grid names. */
export function planColumns(snapshot: PublishedSnapshot): PlanColumn[] {
  const columns: PlanColumn[] = snapshot.offers.map((offer) => ({
    name: offer.name,
    prices: offer.prices,
  }));
  const named = new Set(columns.map((column) => column.name));
  for (const feature of snapshot.features)
    for (const cell of feature.availability)
      if (!named.has(cell.offer)) {
        named.add(cell.offer);
        columns.push({ name: cell.offer, prices: [] });
      }
  return columns;
}

export type FeatureCell = { status: FeatureStatus; limit?: string };
export type FeatureRow = { key: string; name: string; cells: (FeatureCell | null)[] };

const OFFERED: FeatureStatus[] = ["included", "limited", "add_on", "contact"];

/** Icon labels a page prints in place of a value, such as "[available]", read as what they mean. */
const MARKERS: Record<string, FeatureStatus> = {
  available: "included",
  included: "included",
  "not-available": "not_included",
  "not available": "not_included",
  unavailable: "not_included",
  "not included": "not_included",
};

function readCell(status: FeatureStatus, raw: string | undefined): FeatureCell {
  const limit = raw?.trim() || undefined;
  const marker = limit
    ?.toLowerCase()
    .replace(/^\[|\]$/g, "")
    .trim();
  return marker && marker in MARKERS ? { status: MARKERS[marker]! } : { status, limit };
}

/**
 * The feature grid, one row per feature and one cell per plan. Rows no plan offers are split out:
 * they are what the page lists as missing everywhere, not what tells plans apart.
 */
export function featureRows(features: PublishedFeature[], columns: PlanColumn[]) {
  const offered: FeatureRow[] = [];
  const absent: FeatureRow[] = [];
  features.forEach((feature, index) => {
    const row: FeatureRow = {
      key: `${index}:${feature.name}`,
      name: feature.name,
      cells: columns.map((column) => {
        const cell = feature.availability.find((item) => item.offer === column.name);
        return cell ? readCell(cell.status, cell.limit_raw) : null;
      }),
    };
    (row.cells.some((cell) => cell && OFFERED.includes(cell.status)) ? offered : absent).push(row);
  });
  return { offered, absent };
}

export type LadderStep = {
  plan: string;
  /** The figure the step is drawn to: a monthly equivalent where the quote gives one. */
  amount: number | null;
  label: string;
  tier: "free" | "paid" | "custom";
};

const monthlyFigure = (price: PublishedPrice) =>
  price.period === "year" ? (price.price_numeric ?? 0) / 12 : (price.price_numeric ?? 0);

/** Plans from cheapest to dearest, as a pricing page's own columns would climb. */
export function priceLadder(snapshot: PublishedSnapshot | null | undefined): LadderStep[] {
  if (snapshot?.status !== "collected") return [];
  const billing = defaultBilling(snapshot);
  const steps = snapshot.offers.flatMap((offer): LadderStep[] => {
    const price = headlinePrice(offer.prices, billing);
    if (!price) return [];
    if (price.kind === "free" || (recurring(price) && price.price_numeric === 0))
      return [{ plan: offer.name, amount: 0, label: "Free", tier: "free" }];
    if (price.kind === "custom")
      return [{ plan: offer.name, amount: null, label: "Custom", tier: "custom" }];
    if (!recurring(price) || price.price_numeric === null || !currencyOf(price.price_raw))
      return [];
    return [
      { plan: offer.name, amount: monthlyFigure(price), label: priceText(price), tier: "paid" },
    ];
  });
  const order = { free: 0, paid: 1, custom: 2 };
  return steps.sort(
    (left, right) =>
      order[left.tier] - order[right.tier] || (left.amount ?? 0) - (right.amount ?? 0),
  );
}

/** How a list row names where a page's pricing starts. */
export function entryLabel(snapshot: PublishedSnapshot | null | undefined) {
  if (snapshot?.status !== "collected") return null;
  const paid = priceLadder(snapshot).find((step) => step.tier === "paid");
  if (paid) return paid.label;
  const prices = [
    ...snapshot.offers.flatMap((offer) => offer.prices),
    ...(snapshot.shared_prices ?? []),
  ];
  // A page can print its plan prices without naming the plans; the cheapest is still where it starts.
  const cheapest = prices
    .filter(
      (price) => recurring(price) && (price.price_numeric ?? 0) > 0 && currencyOf(price.price_raw),
    )
    .sort((left, right) => monthlyFigure(left) - monthlyFigure(right))[0];
  if (cheapest) return priceText(cheapest);
  const usage = prices.find((price) => price.kind === "usage" && price.price_numeric !== null);
  if (usage && currencyOf(usage.price_raw)) return priceText(usage);
  if (prices.some((price) => price.kind === "free")) return "Free";
  if (prices.some((price) => price.kind === "custom")) return "Custom";
  return null;
}
