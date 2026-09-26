import type { VerifiedPricingChange } from "@my-better-t-app/api/pricing-history";
import type {
  PublishedPrice,
  PublishedRate,
  PublishedSnapshot,
} from "@my-better-t-app/db/pricing-snapshot";

const ROLE_LABELS: Record<string, string> = {
  base_price: "price",
  seat_price: "per-seat price",
  free_plan: "free plan",
  custom_price: "custom price",
};

const priceKey = (offer: string, price: PublishedPrice) =>
  `price:${offer}:${price.role}:${price.billing}:${price.period}:${price.unit}`;
const priceLabel = (offer: string, price: PublishedPrice) =>
  [offer, price.billing === "unknown" ? "" : price.billing, ROLE_LABELS[price.role] ?? price.role]
    .filter(Boolean)
    .join(" ");
const rateKey = (rate: PublishedRate) =>
  `rate:${rate.offer ?? "all"}:${rate.name}:${rate.per ?? ""}`;
const rateLabel = (rate: PublishedRate) =>
  `${rate.name}${rate.offer ? ` (${rate.offer})` : ""} rate`;

/** Groups quotes by key; a key can hold several quotes, such as a price and its "free forever" line. */
function group<Item>(items: Item[], keyOf: (item: Item) => string) {
  const groups = new Map<string, Item[]>();
  for (const item of items) groups.set(keyOf(item), [...(groups.get(keyOf(item)) ?? []), item]);
  return groups;
}

const amounts = (items: { price_numeric: number | null }[]) =>
  items
    .map((item) => item.price_numeric)
    .sort()
    .join(",");
const quotes = (items: { price_raw: string }[]) => items.map((item) => item.price_raw).join(" · ");

/**
 * The changes between two published snapshots of one page, with the quoted text on each side
 * as evidence. It is deterministic and makes no model calls.
 */
export function diffSnapshots(
  before: PublishedSnapshot,
  after: PublishedSnapshot,
): VerifiedPricingChange[] {
  const changes: VerifiedPricingChange[] = [];
  const beforeOffers = new Map(before.offers.map((offer) => [offer.name, offer]));
  const afterOffers = new Map(after.offers.map((offer) => [offer.name, offer]));

  for (const [name, offer] of afterOffers)
    if (!beforeOffers.has(name))
      changes.push({
        key: `offer:${name}`,
        label: `${name} plan`,
        kind: "commercial",
        beforeLabel: "Not listed",
        afterLabel: "Listed",
        beforeEvidence: "",
        afterEvidence: quotes(offer.prices) || name,
      });
  for (const [name, offer] of beforeOffers)
    if (!afterOffers.has(name))
      changes.push({
        key: `offer:${name}`,
        label: `${name} plan`,
        kind: "commercial",
        beforeLabel: "Listed",
        afterLabel: "Not listed",
        beforeEvidence: quotes(offer.prices) || name,
        afterEvidence: "",
      });

  const prices = (snapshot: PublishedSnapshot, shared: (name: string) => boolean) =>
    group(
      snapshot.offers
        .filter((offer) => shared(offer.name))
        .flatMap((offer) => offer.prices.map((price) => ({ offer: offer.name, ...price }))),
      (price) => priceKey(price.offer, price),
    );
  const shared = (name: string) => beforeOffers.has(name) && afterOffers.has(name);
  changes.push(
    ...compareGroups(prices(before, shared), prices(after, shared), "commercial", (items) =>
      priceLabel(items[0]!.offer, items[0]!),
    ),
    ...compareGroups(
      group(before.rates ?? [], rateKey),
      group(after.rates ?? [], rateKey),
      "commercial",
      (items) => rateLabel(items[0]!),
    ),
  );

  const cells = (snapshot: PublishedSnapshot) =>
    new Map(
      snapshot.features.flatMap((feature) =>
        feature.availability.map(
          (cell) =>
            [`feature:${feature.name.toLowerCase()}:${cell.offer}`, { feature, cell }] as const,
        ),
      ),
    );
  const beforeCells = cells(before);
  for (const [key, current] of cells(after)) {
    const previous = beforeCells.get(key);
    // A row quoted on only one side is as likely an extraction difference as a page change.
    if (!previous) continue;
    const describe = ({ cell }: typeof current) =>
      [cell.status.replaceAll("_", " "), cell.limit_raw].filter(Boolean).join(": ");
    if (describe(previous) === describe(current)) continue;
    changes.push({
      key,
      label: `${current.feature.name} (${current.cell.offer})`,
      kind: "disclosure",
      beforeLabel: describe(previous),
      afterLabel: describe(current),
      beforeEvidence: previous.cell.limit_raw ?? describe(previous),
      afterEvidence: current.cell.limit_raw ?? describe(current),
    });
  }

  for (const [flag, value] of Object.entries(after.flags)) {
    const previous = before.flags[flag as keyof typeof before.flags];
    if (previous === undefined || value === undefined || previous === value) continue;
    changes.push({
      key: `flag:${flag}`,
      label: flag.replaceAll("_", " "),
      kind: "disclosure",
      beforeLabel: previous ? "Yes" : "No",
      afterLabel: value ? "Yes" : "No",
      beforeEvidence: previous ? "Stated on the page" : "Not stated",
      afterEvidence: value ? "Stated on the page" : "Not stated",
    });
  }

  return changes.sort((left, right) => left.key.localeCompare(right.key));
}

function compareGroups<Item extends { price_raw: string; price_numeric: number | null }>(
  before: Map<string, Item[]>,
  after: Map<string, Item[]>,
  kind: VerifiedPricingChange["kind"],
  label: (items: Item[]) => string,
): VerifiedPricingChange[] {
  const changes: VerifiedPricingChange[] = [];
  for (const key of new Set([...before.keys(), ...after.keys()])) {
    const previous = before.get(key) ?? [];
    const current = after.get(key) ?? [];
    if (previous.length && current.length && amounts(previous) === amounts(current)) continue;
    changes.push({
      key,
      label: label(current.length ? current : previous),
      kind,
      beforeLabel: previous.length ? quotes(previous) : "Not listed",
      afterLabel: current.length ? quotes(current) : "Not listed",
      beforeEvidence: quotes(previous),
      afterEvidence: quotes(current),
    });
  }
  return changes;
}

const normalize = (value: string) =>
  value
    .replace(/\s*\|\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/** The plan, rate or feature a change is about, read back from its key. */
function subjectOf(key: string): string | null {
  const [kind, first, second] = key.split(":");
  if (kind === "offer" || kind === "price") return first ?? null;
  if (kind === "rate") return second ?? null;
  if (kind === "feature") return first ?? null;
  return null;
}

/**
 * Keeps only changes the two captured pages show. Two extractions of the same text can word a
 * quote differently, so a change counts when one side's quote is missing from the other page,
 * or, for cells without a quote, when the page lines naming the feature differ.
 */
export function confirmChanges(
  changes: VerifiedPricingChange[],
  beforeText: string,
  afterText: string,
): VerifiedPricingChange[] {
  const beforePage = normalize(beforeText);
  const afterPage = normalize(afterText);
  const beforeLines = beforeText.split("\n").map(normalize);
  const afterLines = afterText.split("\n").map(normalize);
  const quotesIn = (evidence: string, page: string) =>
    evidence
      .split(" · ")
      .map(normalize)
      .filter((quote) => quote && page.includes(quote));
  const linesAbout = (lines: string[], subject: string) =>
    lines
      .filter((line) => line.includes(subject))
      .sort()
      .join("\n");
  return changes.filter((change) => {
    const subject = subjectOf(change.key);
    if (subject === null) return true;
    const before = quotesIn(change.beforeEvidence, beforePage);
    const after = quotesIn(change.afterEvidence, afterPage);
    if (before.length || after.length)
      return (
        before.some((quote) => !afterPage.includes(quote)) ||
        after.some((quote) => !beforePage.includes(quote))
      );
    const name = normalize(subject);
    return linesAbout(beforeLines, name) !== linesAbout(afterLines, name);
  });
}
