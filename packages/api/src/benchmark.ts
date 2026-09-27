import type {
  BenchmarkChoiceShare,
  BenchmarkSignalShare,
  PageChoice,
  PageSignal,
  NumericPriceBenchmark,
} from "@my-better-t-app/db/schema/pages";
import type { NumericPrices } from "@my-better-t-app/db/numeric-prices";
import { buildNumericBenchmark } from "./numeric-prices";

import {
  AI_APPLICATION_CATEGORY_OPTIONS,
  PRICING_CHOICE_CATALOG,
  PRICING_SIGNAL_CATALOG,
  PRODUCT_CATEGORY_OPTIONS,
  NOT_ESTABLISHED_PROBABILITY_THRESHOLD,
  TAG_PROBABILITY_THRESHOLD,
} from "./pricing-intelligence";

/**
 * Minimum eligible pages for a headline percentage. Smaller cohorts show counts.
 */
export const COHORT_MINIMUM = 10;

export type BenchmarkPage = {
  numericPrices?: NumericPrices | null;
  choices: Pick<PageChoice, "key" | "choice">[];
  signals: Pick<PageSignal, "key" | "probability">[];
};

/** Persisted shapes live with the table so the column type cannot drift. */
export type ChoiceShare = BenchmarkChoiceShare;

export type BenchmarkSnapshot = {
  numericPrices?: NumericPriceBenchmark | null;
  cohort: string;
  pageCount: number;
  choiceShares: Record<string, ChoiceShare>;
  /** Count of pages whose page states the signal, not whose product has it. */
  signalCounts: Record<string, number>;
  signalShares: Record<string, BenchmarkSignalShare>;
};

export const ALL_COHORT = "all";
export const AI_APPLICATIONS_COHORT = "ai_applications";

export function cohortLabel(cohort: string): string {
  if (cohort === AI_APPLICATIONS_COHORT) return "AI applications";
  if (cohort === ALL_COHORT) return "All current pages";
  if (cohort.startsWith("category:")) {
    return cohort
      .slice("category:".length)
      .replaceAll("_", " ")
      .replace(/^./, (letter) => letter.toUpperCase());
  }
  return cohort;
}

/** Each page belongs to all pages and, when Jev classified it, to its product category. */
export function cohortsForPage(page: BenchmarkPage): string[] {
  const cohorts = [ALL_COHORT];
  const category = page.choices.find((choice) => choice.key === "product_category")?.choice;
  if (
    category &&
    Object.hasOwn(PRODUCT_CATEGORY_OPTIONS, category) &&
    category !== "not_disclosed" &&
    category !== "unknown"
  ) {
    cohorts.push(`category:${category}`);
    if (Object.hasOwn(AI_APPLICATION_CATEGORY_OPTIONS, category)) {
      cohorts.push(AI_APPLICATIONS_COHORT);
    }
  }
  return cohorts;
}

export function buildBenchmarkSnapshots(pages: BenchmarkPage[]): BenchmarkSnapshot[] {
  const cohorts = new Map<string, BenchmarkPage[]>();
  for (const page of pages) {
    for (const cohort of cohortsForPage(page)) {
      const bucket = cohorts.get(cohort);
      if (bucket) bucket.push(page);
      else cohorts.set(cohort, [page]);
    }
  }

  return [...cohorts.entries()]
    .map(([cohort, members]) => buildSnapshot(cohort, members))
    .sort(
      (left, right) => right.pageCount - left.pageCount || left.cohort.localeCompare(right.cohort),
    );
}

function buildSnapshot(cohort: string, members: BenchmarkPage[]): BenchmarkSnapshot {
  const choiceShares: Record<string, ChoiceShare> = {};
  for (const key of Object.keys(PRICING_CHOICE_CATALOG)) {
    choiceShares[key] = { answered: 0, options: {} };
  }
  for (const member of members) {
    for (const choice of member.choices) {
      const share = choiceShares[choice.key];
      if (!share) continue;
      share.answered += 1;
      share.options[choice.choice] = (share.options[choice.choice] ?? 0) + 1;
    }
  }

  const signalCounts: Record<string, number> = {};
  const signalShares: Record<string, BenchmarkSignalShare> = {};
  for (const key of Object.keys(PRICING_SIGNAL_CATALOG)) signalCounts[key] = 0;
  for (const key of Object.keys(PRICING_SIGNAL_CATALOG)) {
    const values = members.map(
      (member) => member.signals.find((signal) => signal.key === key)?.probability,
    );
    const stated = values.filter(
      (value) => value !== undefined && value >= TAG_PROBABILITY_THRESHOLD,
    ).length;
    const notEstablished = values.filter(
      (value) => value !== undefined && value <= NOT_ESTABLISHED_PROBABILITY_THRESHOLD,
    ).length;
    signalShares[key] = {
      stated,
      notEstablished,
      uncertain: members.length - stated - notEstablished,
    };
  }
  for (const member of members) {
    for (const signal of member.signals) {
      if (signal.probability < TAG_PROBABILITY_THRESHOLD) continue;
      const current = signalCounts[signal.key];
      if (current !== undefined) signalCounts[signal.key] = current + 1;
    }
  }

  return {
    cohort,
    numericPrices: buildNumericBenchmark(members),
    pageCount: members.length,
    choiceShares,
    signalCounts,
    signalShares,
  };
}
