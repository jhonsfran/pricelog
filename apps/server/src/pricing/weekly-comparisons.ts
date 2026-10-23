import type { Database } from "@pricelog/db";
import { COMPARISON_VERSION, pairWeeklyObservations } from "@pricelog/api/pricing-history";
import { readWeeklyHistory } from "@pricelog/api/pricing-history-store";
import { createPricingHistoryRepository } from "@pricelog/api/pricing-history-repository";
import { confirmChanges, diffSnapshots } from "./snapshot-changes";

export async function runWeeklyComparisons(
  db: Database,
  readContent: (key: string) => Promise<string | null>,
  now = new Date(),
) {
  const repository = createPricingHistoryRepository(db);
  let processed = 0;
  let pending = 0;
  const failures: { pageId: string; runId?: string; message: string }[] = [];
  const history = await readWeeklyHistory(db, now);
  const { pairs } = pairWeeklyObservations(history.observations, "all", now);
  for (const pair of pairs) {
    try {
      if (!pair.before.analysisId || !pair.after.analysisId)
        throw new Error("Weekly comparison analysis identities are missing");
      if (
        history.comparisons.some(
          (prior) =>
            prior.beforeRunId === pair.before.runId &&
            prior.afterRunId === pair.after.runId &&
            prior.beforeAnalysisId === pair.before.analysisId &&
            prior.afterAnalysisId === pair.after.analysisId &&
            prior.verifierVersion === COMPARISON_VERSION,
        )
      )
        continue;
      const [beforeText, afterText] = await Promise.all([
        readContent(pair.before.contentKey),
        readContent(pair.after.contentKey),
      ]);
      if (beforeText === null || afterText === null)
        throw new Error(`Missing captured page for weekly comparison ${pair.after.runId}`);
      const changes = confirmChanges(
        diffSnapshots(pair.before.snapshot!, pair.after.snapshot!),
        beforeText,
        afterText,
      );
      await repository.persistComparison(pair.after.pageId, {
        id: `${COMPARISON_VERSION}:${pair.before.analysisId}:${pair.after.analysisId}`,
        beforeRunId: pair.before.runId,
        afterRunId: pair.after.runId,
        beforeAnalysisId: pair.before.analysisId,
        afterAnalysisId: pair.after.analysisId,
        verifierVersion: COMPARISON_VERSION,
        model: null,
        status: "reviewed",
        changes,
        createdAt: new Date(),
      });
      processed++;
    } catch (error) {
      pending++;
      failures.push({
        pageId: pair.after.pageId,
        runId: pair.after.runId,
        message: error instanceof Error ? error.message : "Comparison failed",
      });
    }
  }
  return { processed, pending, failures };
}
