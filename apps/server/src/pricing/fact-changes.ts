import {
  numericFactIdentity,
  type EvidenceSpan,
  type NumericFact,
  type PricingFacts,
  PRICING_FACTS_VERSION,
} from "@my-better-t-app/db/pricing-facts";
import { PRACTICE_CHOICE_CATALOG } from "@my-better-t-app/db/pricing-intelligence";
import { EXPECTED_JEV_MODEL } from "@my-better-t-app/db/measurement-policy";
import { FACT_ROLE_SPEC } from "./fact-role-spec";

export type ChangeCandidate = {
  key: string;
  label: string;
  question: string;
  beforeLabel: string;
  afterLabel: string;
  disclosureOnly: boolean;
  beforeEvidence?: EvidenceSpan;
  afterEvidence?: EvidenceSpan;
};
const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
// Compare the decimal literals without floating-point arithmetic.
function decimal(value: string | null) {
  if (value === null) return null;
  return value.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}
function factLabel(fact: NumericFact) {
  return `${fact.offer}: ${fact.currency ? `${fact.currency} ` : ""}${fact.amount} ${fact.unit}${fact.quantity ? ` per ${fact.quantity} ${fact.quantityUnit}` : ""}; ${fact.billing} commitment; ${fact.period} period`;
}
function groups<T>(items: T[], identity: (item: T) => string | null) {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const key = identity(item);
    if (key) grouped.set(key, [...(grouped.get(key) ?? []), item]);
  }
  return grouped;
}

/** Offer matching is conservative. A missing, renamed or duplicate term is unresolved. */
export function factChangeCandidates(before?: PricingFacts, after?: PricingFacts) {
  const candidates: ChangeCandidate[] = [];
  if (
    !before ||
    !after ||
    [before, after].some(
      (item) =>
        item.status !== "collected" ||
        item.version !== PRICING_FACTS_VERSION ||
        item.model !== EXPECTED_JEV_MODEL,
    )
  )
    return { candidates, uncertain: true, available: false };
  let uncertain = [before, after].some(
    (item) =>
      item.facts.length === 0 ||
      item.coverage.uncertain > 0 ||
      item.coverage.policyUncertain > 0 ||
      item.facts.some((fact) => !fact.offer),
  );
  const left = groups(before.facts, numericFactIdentity);
  const right = groups(after.facts, numericFactIdentity);
  for (const key of new Set([...left.keys(), ...right.keys()])) {
    const a = left.get(key),
      b = right.get(key);
    if (a?.length !== 1 || b?.length !== 1) {
      uncertain = true;
      continue;
    }
    const previous = a[0]!,
      current = b[0]!;
    const spec = FACT_ROLE_SPEC[previous.key];
    const needsPeriod =
      spec.comparePeriod === "always" ||
      (spec.comparePeriod === "recurring" &&
        (previous.billing === "monthly" || previous.billing === "annual"));
    if (
      (spec.compareBilling && previous.billing === "unknown") ||
      (needsPeriod && previous.period === "unknown")
    ) {
      uncertain = true;
      continue;
    }
    if (
      decimal(previous.amount) === decimal(current.amount) &&
      decimal(previous.quantity) === decimal(current.quantity)
    ) {
      // Unstructured qualifiers can change while all modeled values stay equal.
      if (previous.evidence.text !== current.evidence.text) uncertain = true;
      continue;
    }
    candidates.push({
      key: `fact:${key}`,
      label: `${current.offer} · ${current.key.replaceAll("_", " ")}`,
      question: `Code found different literal values for ${current.key}. Verify that both values describe the same offer, unit, billing context, model, usage tier and conditions. Do not calculate or infer amounts.`,
      beforeLabel: factLabel(previous),
      afterLabel: factLabel(current),
      disclosureOnly: false,
      beforeEvidence: previous.evidence,
      afterEvidence: current.evidence,
    });
  }
  const policyKey = (item: PricingFacts["policies"][number]) =>
    `${normalize(item.offer)}:${item.key}`;
  const previousPolicies = groups(before.policies, policyKey);
  const currentPolicies = groups(after.policies, policyKey);
  for (const key of new Set([...previousPolicies.keys(), ...currentPolicies.keys()])) {
    const a = previousPolicies.get(key),
      b = currentPolicies.get(key);
    if (a?.length !== 1 || b?.length !== 1) {
      uncertain = true;
      continue;
    }
    const previous = a[0]!,
      current = b[0]!;
    if (previous.choice === current.choice) {
      if (previous.evidence?.text !== current.evidence?.text) uncertain = true;
      continue;
    }
    const entry = PRACTICE_CHOICE_CATALOG[current.key];
    const options = entry.options as Record<string, string>;
    candidates.push({
      key: `policy:${key}`,
      label: `${current.offer} · ${entry.label}`,
      question: `For offer ${current.offer} only: ${entry.question}`,
      beforeLabel: options[previous.choice] ?? previous.choice,
      afterLabel: options[current.choice] ?? current.choice,
      disclosureOnly: [previous.choice, current.choice].some(
        (value) => value === "not_disclosed" || value === "not_applicable",
      ),
      beforeEvidence: previous.evidence ?? undefined,
      afterEvidence: current.evidence ?? undefined,
    });
  }
  return { candidates, uncertain, available: true };
}
