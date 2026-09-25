import type { Gold, GoldFact, LabFact, LabResult } from "./schema";

const FIELDS = ["unit", "currency", "period", "billing", "quantity", "quantityUnit"] as const;
const UNKNOWN = new Set([null, "unknown"]);

export type FactVerdict = {
  fact: LabFact;
  verdict: "correct" | "correct_unattributed" | "duplicate" | "wrong";
  gold?: string;
  reasons: string[];
  missingFields: string[];
};

export type Score = {
  accepted: number;
  correct: number;
  unattributed: number;
  duplicates: number;
  wrong: number;
  /** Null when nothing was accepted. */
  precision: number | null;
  inCapture: number;
  recall: number;
  recallAny: number;
  /** Recall over the production numeric roles only, comparable with the baseline. */
  recallNumeric: number;
  fieldCompleteness: number;
  missed: string[];
  verdicts: FactVerdict[];
};

const norm = (value: string | null | undefined) =>
  value ? value.toLowerCase().replace(/\s+/g, " ").trim() : null;
const sameAmount = (a: string | null, b: string | null) =>
  a === b || (a !== null && b !== null && Number(a) === Number(b));
const numericRole = (role: string) => role !== "free_plan" && role !== "custom_price";

/** Evidence is correct when its span overlaps an occurrence of the gold literal. */
function overlapsLiteral(markdown: string, span: LabFact["evidence"], literal: string): boolean {
  for (let at = markdown.indexOf(literal); at >= 0; at = markdown.indexOf(literal, at + 1))
    if (span.start < at + literal.length && at < span.end) return true;
  return false;
}

function planMatches(fact: LabFact, gold: GoldFact): boolean {
  if (!fact.plan || !gold.plan) return false;
  return [gold.plan, ...(gold.aliases ?? [])].map(norm).includes(norm(fact.plan));
}

export function scoreResult(result: LabResult, gold: Gold, markdown: string): Score {
  const visible = gold.facts.filter((item) => item.status === "in_capture");
  const matched = new Map<string, "attributed" | "unattributed">();
  const verdicts: FactVerdict[] = [];
  let definiteGold = 0;
  let definiteFound = 0;
  for (const fact of result.facts) {
    const reasons: string[] = [];
    const missingFields: string[] = [];
    if (markdown.slice(fact.evidence.start, fact.evidence.end) !== fact.evidence.text)
      reasons.push("evidence span does not match the capture");
    const sameValue = gold.facts.filter(
      (item) =>
        (item.role === fact.role && sameAmount(item.amount, fact.amount)) ||
        item.alsoAccept?.some(
          (other) => other.role === fact.role && sameAmount(other.amount, fact.amount),
        ),
    );
    const named = sameValue.filter((item) => planMatches(fact, item));
    // An unattributed fact matches a gold fact that names no offer, or the only visible match.
    const matchable = (item: GoldFact) =>
      item.status === "in_capture" || item.status === "restatement";
    const unnamed = sameValue.filter((item) => item.plan === null && matchable(item));
    const visibleValue = sameValue.filter(matchable);
    const target =
      named.find(matchable) ??
      (fact.plan
        ? undefined
        : unnamed.length === 1
          ? unnamed[0]
          : visibleValue.length === 1
            ? visibleValue[0]
            : undefined);
    if (!target) {
      const hidden = named.find((item) => !matchable(item));
      reasons.push(
        hidden
          ? `matches ${hidden.id} (${hidden.status}), not visible in this capture`
          : `no gold fact for ${fact.plan ?? "unattributed"} ${fact.role} ${fact.amount ?? ""}`.trim(),
      );
      verdicts.push({ fact, verdict: "wrong", reasons, missingFields });
      continue;
    }
    // Location matters for attributed facts and price states. An unattributed numeric
    // restatement elsewhere on the page is valid evidence for the same value.
    const restatement = !fact.plan && numericRole(fact.role);
    if (target.literal && !restatement && !overlapsLiteral(markdown, fact.evidence, target.literal))
      reasons.push(`evidence does not overlap ${JSON.stringify(target.literal)}`);
    for (const field of FIELDS) {
      const expected = target[field];
      const actual = fact[field];
      if (UNKNOWN.has(expected)) continue;
      definiteGold++;
      // A bare $ is less specific than USD established elsewhere on the page, not contradictory.
      if (
        UNKNOWN.has(actual) ||
        (field === "currency" && expected === "USD" && actual === "DOLLAR_UNSPECIFIED")
      ) {
        if (!target.optional?.includes(field as never)) missingFields.push(field);
        continue;
      }
      if (field === "quantity" ? !sameAmount(expected, actual) : expected !== actual)
        reasons.push(`${field}: expected ${expected}, got ${actual}`);
      else definiteFound++;
    }
    if (reasons.length) {
      verdicts.push({ fact, verdict: "wrong", gold: target.id, reasons, missingFields });
      continue;
    }
    if (matched.has(target.id)) {
      verdicts.push({ fact, verdict: "duplicate", gold: target.id, reasons, missingFields });
      continue;
    }
    // An unattributed fact is the correct attribution when the gold fact names no offer.
    const attributed = fact.plan !== null || target.plan === null;
    matched.set(target.id, attributed ? "attributed" : "unattributed");
    verdicts.push({
      fact,
      verdict: fact.plan !== null || target.plan === null ? "correct" : "correct_unattributed",
      gold: target.id,
      reasons,
      missingFields,
    });
  }
  const count = (verdict: FactVerdict["verdict"]) =>
    verdicts.filter((item) => item.verdict === verdict).length;
  const correct = count("correct") + count("correct_unattributed");
  const numericGold = visible.filter((item) => numericRole(item.role));
  return {
    accepted: result.facts.length,
    correct,
    unattributed: count("correct_unattributed"),
    duplicates: count("duplicate"),
    wrong: count("wrong"),
    precision: result.facts.length ? correct / result.facts.length : null,
    inCapture: visible.length,
    recall: visible.length
      ? visible.filter((item) => matched.get(item.id) === "attributed").length / visible.length
      : 1,
    recallAny: visible.length
      ? visible.filter((item) => matched.has(item.id)).length / visible.length
      : 1,
    recallNumeric: numericGold.length
      ? numericGold.filter((item) => matched.get(item.id) === "attributed").length /
        numericGold.length
      : 1,
    fieldCompleteness: definiteGold ? definiteFound / definiteGold : 1,
    missed: visible.filter((item) => !matched.has(item.id)).map((item) => item.id),
    verdicts,
  };
}

/** Identity follows the production rule: offer, role and terms, never array position. */
export function factIdentity(fact: LabFact): string | null {
  if (!fact.plan) return null;
  return JSON.stringify([
    norm(fact.plan),
    fact.role,
    fact.unit,
    fact.currency,
    fact.billing,
    fact.period,
  ]);
}

export type ChangeEvents = {
  unchanged: string[];
  changedAmount: string[];
  added: string[];
  removed: string[];
  /** Removed facts whose offer is still present in an unselected UI state. */
  hidden: string[];
  ambiguous: string[];
};

export function diffResults(before: LabResult, after: LabResult): ChangeEvents {
  const index = (result: LabResult) => {
    const map = new Map<string, LabFact[]>();
    for (const fact of result.facts) {
      const id = factIdentity(fact);
      if (id) map.set(id, [...(map.get(id) ?? []), fact]);
    }
    return map;
  };
  const a = index(before);
  const b = index(after);
  const hiddenNames = new Set((after.hiddenOffers ?? []).map(norm));
  const events: ChangeEvents = {
    unchanged: [],
    changedAmount: [],
    added: [],
    removed: [],
    hidden: [],
    ambiguous: [],
  };
  const label = (fact: LabFact) => `${fact.plan} ${fact.role} ${fact.amount ?? ""}`.trim();
  for (const [id, facts] of a) {
    const next = b.get(id);
    if (facts.length > 1 || (next && next.length > 1)) events.ambiguous.push(label(facts[0]!));
    else if (!next)
      (hiddenNames.has(norm(facts[0]!.plan)) ? events.hidden : events.removed).push(
        label(facts[0]!),
      );
    else if (sameAmount(facts[0]!.amount, next[0]!.amount)) events.unchanged.push(label(facts[0]!));
    else events.changedAmount.push(`${label(facts[0]!)} -> ${next[0]!.amount}`);
  }
  for (const [id, facts] of b) if (!a.has(id)) events.added.push(label(facts[0]!));
  return events;
}
