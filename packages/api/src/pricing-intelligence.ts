import {
  isPricingChoiceKey,
  isPricingSignalKey,
  PRICING_CHOICE_CATALOG,
  PRICING_CHOICE_GROUPS,
  PRICING_SIGNAL_CATALOG,
} from "@my-better-t-app/db/pricing-intelligence";

export * from "@my-better-t-app/db/pricing-intelligence";

export function getPricingChoiceLabel(key: string): string {
  return isPricingChoiceKey(key) ? PRICING_CHOICE_CATALOG[key].label : formatPricingKey(key);
}

export function getPricingChoiceMetadata(key: string) {
  return isPricingChoiceKey(key) ? PRICING_CHOICE_CATALOG[key] : null;
}

export function getPricingSignalMetadata(key: string) {
  return isPricingSignalKey(key) ? PRICING_SIGNAL_CATALOG[key] : null;
}

export type PricingChoiceGroup<T> = {
  key: string;
  label: string;
  items: T[];
};

/**
 * Ten flat classifications read as a wall. Grouping them lets a founder find
 * the two that matter to the decision they are making right now.
 */
export function groupPricingChoices<T extends { key: string }>(
  choices: T[],
): PricingChoiceGroup<T>[] {
  const known = new Map<string, T[]>();
  const ungrouped: T[] = [];
  for (const choice of choices) {
    const metadata = getPricingChoiceMetadata(choice.key);
    if (!metadata) {
      ungrouped.push(choice);
      continue;
    }
    const bucket = known.get(metadata.group);
    if (bucket) bucket.push(choice);
    else known.set(metadata.group, [choice]);
  }

  const groups = PRICING_CHOICE_GROUPS.flatMap((group) => {
    const items = known.get(group.key);
    return items?.length ? [{ key: group.key, label: group.label, items }] : [];
  });
  // An unknown key means the client is older than the server. Show the data
  // rather than dropping it.
  return ungrouped.length
    ? [...groups, { key: "other", label: "Other", items: ungrouped }]
    : groups;
}

function formatPricingKey(value: string): string {
  const formatted = value.replaceAll("_", " ").replaceAll("-", " ").trim();
  return formatted ? formatted[0]!.toUpperCase() + formatted.slice(1) : "Unknown";
}

/** Reconstruct the comparison denominator without treating missing answers as policy facts. */
export function pricingPolicyCoverage(
  pageCount: number,
  share?: { answered: number; options: Record<string, number> },
) {
  const classified = share?.answered ?? 0;
  const notApplicable = share?.options.not_applicable ?? 0;
  return {
    classified,
    applicable: Math.max(0, classified - notApplicable),
    uncertain: Math.max(0, pageCount - classified),
    notApplicable,
    notDisclosed: share?.options.not_disclosed ?? 0,
  };
}
