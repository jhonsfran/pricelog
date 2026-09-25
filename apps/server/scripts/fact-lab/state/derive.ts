import type { LabFact } from "../schema";
import type { LocatedControl } from "./sections";
import type { StructuredOffer } from "./page-context";

/** Currency, JSON-LD corroboration and hidden offers: read by code, never asked of Jev. */
export function currencyOf(mark: string | null): string | null {
  if (!mark) return null;
  if (mark === "US$" || mark === "USD") return "USD";
  if (mark === "€" || mark === "EUR") return "EUR";
  if (mark === "£" || mark === "GBP") return "GBP";
  return mark === "$" ? "DOLLAR_UNSPECIFIED" : null;
}

const norm = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();

export function corroborate(fact: LabFact, offers: StructuredOffer[]): LabFact {
  const match = offers.filter(
    (offer) =>
      fact.plan &&
      norm(offer.name) === norm(fact.plan) &&
      (fact.role === "free_plan"
        ? offer.price !== null && Number(offer.price) === 0
        : offer.price !== null &&
          fact.amount !== null &&
          Number(offer.price) === Number(fact.amount)),
  );
  if (!match.length) return fact;
  return {
    ...fact,
    corroboration: match.map((offer) => ({
      source: "json-ld" as const,
      text: JSON.stringify(offer),
      currency: offer.currency,
    })),
  };
}

/** Offers the capture names only in unselected UI states or in structured data. */
export function hiddenOffers(
  controls: LocatedControl[],
  offers: StructuredOffer[],
  visiblePlans: (string | null)[],
): string[] {
  const visible = new Set(visiblePlans.filter(Boolean).map((plan) => norm(plan!)));
  const hidden = new Set<string>();
  for (const control of controls)
    if (control.section && control.section.level >= 2)
      for (const option of control.options) if (!option.selected) hidden.add(option.label);
  for (const offer of offers) if (!visible.has(norm(offer.name))) hidden.add(offer.name);
  return [...hidden];
}
