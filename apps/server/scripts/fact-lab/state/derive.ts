import type { FactBilling, FactPeriod } from "@my-better-t-app/db/pricing-facts";
import type { LabFact, LabRole } from "../schema";
import type { LocatedControl, PriceCandidate } from "./cards";
import type { StructuredOffer } from "./page-context";

/** Deterministic terms read from the literal and page state. Jev is not asked for these. */
export function currencyOf(mark: string | null): string | null {
  if (!mark) return null;
  if (mark === "US$" || mark === "USD") return "USD";
  if (mark === "€" || mark === "EUR") return "EUR";
  if (mark === "£" || mark === "GBP") return "GBP";
  return mark === "$" ? "DOLLAR_UNSPECIFIED" : null;
}

export function periodOf(suffix: string): FactPeriod {
  if (/\b(?:mo|mos|month|months|monthly)\b\.?/i.test(suffix)) return "month";
  if (/\b(?:yr|yrs|year|years|yearly|annually|annual)\b\.?/i.test(suffix)) return "year";
  return "unknown";
}

export function unitOf(role: LabRole): string | null {
  if (role === "base_price") return "flat";
  if (role === "seat_price") return "seat";
  return null;
}

const MONTHLY = /^(?:monthly|month|billed monthly|pay monthly)$/i;
const YEARLY = /^(?:yearly|annually|annual|year|billed yearly|billed annually|pay yearly)$/i;

/** The purchase commitment the capture shows, from a billing toggle outside plan cards. */
export function billingOf(controls: LocatedControl[], cardText: string): FactBilling {
  if (/\bbilled (?:annually|yearly)\b/i.test(cardText)) return "annual";
  for (const control of controls) {
    if (control.kind === "switch") {
      const option = control.options[0]!;
      if (/\b(?:yearly|annual)\b/i.test(option.label))
        return option.selected ? "annual" : "monthly";
      continue;
    }
    const selected = control.options.find((option) => option.selected)?.label ?? "";
    const labels = control.options.map((option) => option.label);
    if (!labels.some((label) => MONTHLY.test(label)) || !labels.some((label) => YEARLY.test(label)))
      continue;
    if (MONTHLY.test(selected)) return "monthly";
    if (YEARLY.test(selected)) return "annual";
  }
  return "unknown";
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

export function candidateLabel(candidate: PriceCandidate): string {
  return candidate.text;
}
