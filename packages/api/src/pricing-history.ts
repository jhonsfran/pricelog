import { EXPECTED_JEV_MODEL } from "@pricelog/db/measurement-policy";
import type { PageChoice, PageSignal } from "@pricelog/db/schema/pages";
import { PRICING_SNAPSHOT_VERSION, type PublishedSnapshot } from "@pricelog/db/pricing-snapshot";
import { cohortsForPage } from "./benchmark";

export const COMPARISON_VERSION = "snapshot-diff-v1";
const WEEK_MS = 7 * 24 * 60 * 60 * 1_000;

export type VerifiedPricingChange = {
  key: string;
  label: string;
  kind: "commercial" | "disclosure";
  beforeLabel: string;
  afterLabel: string;
  beforeEvidence: string;
  afterEvidence: string;
};

export type StoredObservation = {
  analysisId?: string;
  runId: string;
  pageId: string;
  rubricId: string;
  model: string;
  capturedAt: Date;
  contentKey: string;
  contentSha256: string;
  choices: PageChoice[];
  signals: PageSignal[];
  snapshot?: PublishedSnapshot | null;
  pipeline?: string;
};
export type Observation = StoredObservation & { slug: string; name: string };
export type Comparison = {
  beforeAnalysisId?: string;
  afterAnalysisId?: string;
  id: string;
  beforeRunId: string;
  afterRunId: string;
  verifierVersion: string;
  model: string | null;
  status: "reviewed" | "uncertain";
  changes: VerifiedPricingChange[];
  createdAt: Date;
};
export type WeeklyPageHistory = {
  observations: StoredObservation[];
  comparisons: Comparison[];
};
export type ObservationPair = { before: Observation; after: Observation };

export function completedWeeks(now = new Date()) {
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  periodEnd.setUTCDate(periodEnd.getUTCDate() - ((periodEnd.getUTCDay() + 6) % 7));
  return {
    periodEnd,
    periodStart: new Date(periodEnd.getTime() - WEEK_MS),
    previousPeriodStart: new Date(periodEnd.getTime() - 2 * WEEK_MS),
  };
}

function latestPerPage(observations: Observation[]) {
  const latest = new Map<string, Observation>();
  for (const observation of observations) {
    const prior = latest.get(observation.pageId);
    if (
      !prior ||
      observation.capturedAt > prior.capturedAt ||
      (observation.capturedAt.getTime() === prior.capturedAt.getTime() &&
        observation.runId > prior.runId)
    ) {
      latest.set(observation.pageId, observation);
    }
  }
  return latest;
}

const comparableSnapshot = (observation: Observation) =>
  observation.snapshot?.status === "collected" &&
  observation.snapshot.version === PRICING_SNAPSHOT_VERSION;

export function pairWeeklyObservations(
  observations: Observation[],
  cohort = "all",
  now = new Date(),
) {
  const periods = completedWeeks(now);
  const belongs = (observation: Observation) =>
    cohortsForPage({
      choices: observation.choices,
      signals: observation.signals,
    }).includes(cohort);
  // Select the latest capture before applying membership so an older category is not revived.
  const before = latestPerPage(
    observations.filter(
      (row) =>
        row.capturedAt >= periods.previousPeriodStart && row.capturedAt < periods.periodStart,
    ),
  );
  const after = latestPerPage(
    observations.filter(
      (row) => row.capturedAt >= periods.periodStart && row.capturedAt < periods.periodEnd,
    ),
  );
  for (const [key, row] of before) if (!belongs(row)) before.delete(key);
  for (const [key, row] of after) if (!belongs(row)) after.delete(key);
  const pairs: ObservationPair[] = [];
  let incompatiblePages = 0;
  for (const [pageId, current] of after) {
    const previous = before.get(pageId);
    if (!previous) continue;
    // Snapshots of the same version compare field by field, even across pipeline changes. A
    // page shown in another currency is a different view, not a price change.
    if (
      !comparableSnapshot(previous) ||
      !comparableSnapshot(current) ||
      previous.snapshot?.currency_visible !== current.snapshot?.currency_visible ||
      previous.model !== current.model ||
      current.model !== EXPECTED_JEV_MODEL
    ) {
      incompatiblePages++;
      continue;
    }
    pairs.push({ before: previous, after: current });
  }
  return {
    ...periods,
    pairs,
    incompatiblePages,
    newPages: [...after.keys()].filter((key) => !before.has(key)).length,
    missingPages: [...before.keys()].filter((key) => !after.has(key)).length,
  };
}

export function sourceUrl(pageId: string, runId: string) {
  return `/api/public/pages/${encodeURIComponent(pageId)}/runs/${encodeURIComponent(runId)}/source`;
}

export function comparisonPairKey(
  before: Pick<StoredObservation, "runId" | "analysisId">,
  after: Pick<StoredObservation, "runId" | "analysisId">,
) {
  return JSON.stringify([
    before.runId,
    after.runId,
    before.analysisId ?? null,
    after.analysisId ?? null,
  ]);
}

export function buildWeeklyReport(
  observations: Observation[],
  comparisons: Comparison[],
  cohort = "all",
  now = new Date(),
) {
  const { pairs, ...coverage } = pairWeeklyObservations(observations, cohort, now);
  const byPair = new Map(
    comparisons
      .filter((row) => row.verifierVersion === COMPARISON_VERSION)
      .map((row) => [
        comparisonPairKey(
          { runId: row.beforeRunId, analysisId: row.beforeAnalysisId },
          { runId: row.afterRunId, analysisId: row.afterAnalysisId },
        ),
        row,
      ]),
  );
  let reviewedPages = 0;
  let verifiedPages = 0;
  let changedPages = 0;
  const items = pairs.flatMap(({ before, after }) => {
    const comparison = byPair.get(comparisonPairKey(before, after));
    if (comparison?.status === "reviewed") reviewedPages++;
    if (!comparison) return [];
    if (comparison.changes.length > 0) changedPages++;
    if (comparison.changes.some((change) => change.kind === "commercial")) verifiedPages++;
    return comparison.changes.map((change) => ({
      ...change,
      pageId: after.pageId,
      slug: after.slug,
      name: after.name,
      beforeRunId: before.runId,
      afterRunId: after.runId,
      beforeCapturedAt: before.capturedAt,
      afterCapturedAt: after.capturedAt,
      beforeSourceUrl: sourceUrl(before.pageId, before.runId),
      afterSourceUrl: sourceUrl(after.pageId, after.runId),
    }));
  });
  return {
    ...coverage,
    pairedPages: pairs.length,
    reviewedPages,
    verifiedPages,
    changedPages,
    uncertainPages: pairs.length - reviewedPages,
    items,
  };
}
