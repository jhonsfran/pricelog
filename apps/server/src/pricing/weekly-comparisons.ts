import type { Database } from "@pricelog/db";
import type { PageMonitorService } from "@pricelog/api/context";
import { COMPARISON_VERSION, pairWeeklyObservations } from "@pricelog/api/pricing-history";
import { activePageBatches } from "@pricelog/api/pricing-history-store";
import { confirmChanges, diffSnapshots } from "./snapshot-changes";

export async function runWeeklyComparisons(
  db: Database,
  monitor: Pick<PageMonitorService, "getWeeklyHistory" | "persistComparison">,
  readContent: (key: string) => Promise<string | null>,
  now = new Date(),
) {
  let processed = 0;
  let pending = 0;
  const failures: { pageId: string; runId?: string; message: string }[] = [];
  for await (const batch of activePageBatches(db)) {
    await Promise.all(
      batch.map(async (page) => {
        let runId: string | undefined;
        try {
          const history = await monitor.getWeeklyHistory(
            page.normalizedDomain,
            page.id,
            now.getTime(),
          );
          const observations = history.observations.map((row) => ({
            ...row,
            slug: page.slug,
            name: page.displayName ?? page.normalizedDomain,
          }));
          const { pairs } = pairWeeklyObservations(observations, "all", now);
          for (const pair of pairs) {
            runId = pair.after.runId;
            if (
              history.comparisons.some(
                (prior) =>
                  prior.beforeRunId === pair.before.runId &&
                  prior.afterRunId === pair.after.runId &&
                  prior.verifierVersion === COMPARISON_VERSION,
              )
            )
              continue;
            const [beforeText, afterText] = await Promise.all([
              readContent(pair.before.contentKey),
              readContent(pair.after.contentKey),
            ]);
            if (beforeText === null || afterText === null)
              throw new Error(`Missing captured page for weekly comparison ${runId}`);
            // Pairing admits only collected snapshots of the current version.
            const changes = confirmChanges(
              diffSnapshots(pair.before.snapshot!, pair.after.snapshot!),
              beforeText,
              afterText,
            );
            await monitor.persistComparison(page.normalizedDomain, page.id, {
              id: `${COMPARISON_VERSION}:${pair.before.runId}:${pair.after.runId}`,
              beforeRunId: pair.before.runId,
              afterRunId: pair.after.runId,
              verifierVersion: COMPARISON_VERSION,
              model: null,
              status: "reviewed",
              changes,
              createdAt: new Date(),
            });
            processed++;
          }
        } catch (error) {
          pending++;
          failures.push({
            pageId: page.id,
            runId,
            message: error instanceof Error ? error.message : "Comparison failed",
          });
        }
      }),
    );
  }
  return { processed, pending, failures };
}
