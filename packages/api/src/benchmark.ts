import type {
  BenchmarkChoiceShare,
  BenchmarkScoreDistribution,
  PageChoice,
  PageScore,
  PageSignal,
} from "@my-better-t-app/db/schema/pages";

import {
  PRICING_CHOICE_CATALOG,
  PRICING_SCORE_CATALOG,
  PRICING_SIGNAL_CATALOG,
  TAG_PROBABILITY_THRESHOLD,
} from "./pricing-intelligence";

/**
 * A distribution over fewer than this many pages is noise presented as
 * authority. Cohorts below it are computed but never published.
 */
export const COHORT_MINIMUM = 10;

/** Histogram resolution over the 0-100 score range. */
const BUCKET_COUNT = 20;
const BUCKET_WIDTH = 100 / BUCKET_COUNT;

/** The pseudo score key for the composite score, so it charts like any other. */
export const OVERALL_SCORE_KEY = "overall";

export type BenchmarkPage = {
  overallScore: number;
  scores: Pick<PageScore, "key" | "score">[];
  choices: Pick<PageChoice, "key" | "choice">[];
  signals: Pick<PageSignal, "key" | "probability">[];
};

/** Persisted shapes live with the table so the column type cannot drift. */
export type ScoreDistribution = BenchmarkScoreDistribution;
export type ChoiceShare = BenchmarkChoiceShare;

export type BenchmarkSnapshot = {
  cohort: string;
  pageCount: number;
  scoreDistributions: Record<string, ScoreDistribution>;
  choiceShares: Record<string, ChoiceShare>;
  /** Count of pages whose page states the signal, not whose product has it. */
  signalCounts: Record<string, number>;
};

export const ALL_COHORT = "all";
export const AI_NATIVE_COHORT = "ai_native";

/** `market_developer_tools` -> `market:developer_tools`. */
function marketCohort(signalKey: string) {
  return `market:${signalKey.slice("market_".length)}`;
}

export function cohortLabel(cohort: string): string {
  if (cohort === ALL_COHORT) return "All indexed pages";
  if (cohort === AI_NATIVE_COHORT) return "AI-native products";
  if (cohort.startsWith("market:")) {
    const signalKey = `market_${cohort.slice("market:".length)}`;
    const signal = PRICING_SIGNAL_CATALOG[signalKey as keyof typeof PRICING_SIGNAL_CATALOG];
    if (signal) return signal.label;
  }
  return cohort;
}

/**
 * Cohorts overlap on purpose. A page that serves developer tools and data
 * analytics belongs in both distributions, and each claim stays well formed:
 * "among N pages that materially serve developer tools". Overlap only becomes
 * ambiguous for a single page's percentile, which is why `peerCohortForPage`
 * picks exactly one and the interface names it.
 */
export function cohortsForPage(page: BenchmarkPage): string[] {
  const cohorts = [ALL_COHORT];
  for (const signal of page.signals) {
    if (signal.probability < TAG_PROBABILITY_THRESHOLD) continue;
    if (signal.key === "is_ai_native") cohorts.push(AI_NATIVE_COHORT);
    else if (signal.key.startsWith("market_")) cohorts.push(marketCohort(signal.key));
  }
  return cohorts;
}

/**
 * The single cohort a page is measured against. Preference order is the page's
 * own primary market, then AI-native, then the whole index — and only cohorts
 * the page actually belongs to and that are large enough to publish.
 */
export function peerCohortForPage(
  page: BenchmarkPage,
  publishable: ReadonlySet<string>,
): string | null {
  const member = new Set(cohortsForPage(page));
  const primaryMarket = page.choices.find((choice) => choice.key === "primary_market")?.choice;
  const preferred = [
    ...(primaryMarket ? [`market:${primaryMarket}`] : []),
    AI_NATIVE_COHORT,
    ALL_COHORT,
  ];
  return preferred.find((cohort) => member.has(cohort) && publishable.has(cohort)) ?? null;
}

function quantile(sorted: number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0]!;
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower]!;
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (position - lower);
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}

export function summarizeDistribution(values: number[]): ScoreDistribution {
  const sorted = [...values].sort((left, right) => left - right);
  const histogram: number[] = Array.from({ length: BUCKET_COUNT }, () => 0);
  for (const value of sorted) {
    histogram[bucketIndex(value)]! += 1;
  }
  return {
    count: sorted.length,
    min: sorted.length ? round(sorted[0]!) : 0,
    max: sorted.length ? round(sorted.at(-1)!) : 0,
    p25: round(quantile(sorted, 0.25)),
    median: round(quantile(sorted, 0.5)),
    p75: round(quantile(sorted, 0.75)),
    histogram,
  };
}

function bucketIndex(value: number) {
  const bounded = Math.max(0, Math.min(100, value));
  return Math.min(BUCKET_COUNT - 1, Math.floor(bounded / BUCKET_WIDTH));
}

/**
 * Percentile rank read off the stored histogram, counting half of the value's
 * own bucket so a cluster of equal scores lands mid-band instead of all at its
 * top or bottom edge.
 */
export function percentileRank(distribution: ScoreDistribution, value: number): number | null {
  if (distribution.count === 0) return null;
  const index = bucketIndex(value);
  let below = 0;
  for (let i = 0; i < index; i += 1) below += distribution.histogram[i] ?? 0;
  const within = distribution.histogram[index] ?? 0;
  return Math.round(((below + within / 2) / distribution.count) * 100);
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
  const scoreValues = new Map<string, number[]>([
    [OVERALL_SCORE_KEY, members.map((member) => member.overallScore)],
  ]);
  for (const key of Object.keys(PRICING_SCORE_CATALOG)) scoreValues.set(key, []);
  for (const member of members) {
    for (const score of member.scores) {
      scoreValues.get(score.key)?.push(score.score);
    }
  }

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
  for (const key of Object.keys(PRICING_SIGNAL_CATALOG)) signalCounts[key] = 0;
  for (const member of members) {
    for (const signal of member.signals) {
      if (signal.probability < TAG_PROBABILITY_THRESHOLD) continue;
      const current = signalCounts[signal.key];
      if (current !== undefined) signalCounts[signal.key] = current + 1;
    }
  }

  const scoreDistributions: Record<string, ScoreDistribution> = {};
  for (const [key, values] of scoreValues) {
    if (values.length > 0) scoreDistributions[key] = summarizeDistribution(values);
  }

  return { cohort, pageCount: members.length, scoreDistributions, choiceShares, signalCounts };
}

/** Cohorts large enough to publish, newest computation wins. */
export function publishableCohorts(snapshots: BenchmarkSnapshot[]): Set<string> {
  return new Set(
    snapshots.filter((snapshot) => snapshot.pageCount >= COHORT_MINIMUM).map((s) => s.cohort),
  );
}

/**
 * Resolves the requested cohort. Returns null rather than falling back to a
 * larger cohort: silently answering with a different peer group would present
 * a comparison the reader did not ask for as the one they did.
 */
export function selectCohort(
  snapshots: BenchmarkSnapshot[],
  publishable: ReadonlySet<string>,
  requested: string,
): BenchmarkSnapshot | null {
  if (!publishable.has(requested)) return null;
  return snapshots.find((snapshot) => snapshot.cohort === requested) ?? null;
}
