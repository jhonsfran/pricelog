import type { Database } from "@my-better-t-app/db";
import type { PageMonitorService } from "@my-better-t-app/api/context";
import { COMPARISON_VERSION, pairWeeklyObservations } from "@my-better-t-app/api/pricing-history";
import { activePageBatches } from "@my-better-t-app/api/pricing-history-store";
import { verifyChanges, type Decide } from "./change-verification";

export async function runWeeklyComparisons(
  db: Database,
  monitor: Pick<PageMonitorService, "getWeeklyHistory" | "persistComparison">,
  artifacts: R2Bucket,
  decide: Decide,
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
            const [before, after] = await Promise.all([
              artifacts.get(pair.before.contentKey),
              artifacts.get(pair.after.contentKey),
            ]);
            if (!before || !after) throw new Error(`Missing source for weekly comparison ${runId}`);
            const [beforeText, afterText] = await Promise.all([before.text(), after.text()]);
            const result = await verifyChanges(pair, beforeText, afterText, decide);
            await monitor.persistComparison(page.normalizedDomain, page.id, {
              id: `${COMPARISON_VERSION}:${pair.before.runId}:${pair.after.runId}`,
              beforeRunId: pair.before.runId,
              afterRunId: pair.after.runId,
              verifierVersion: COMPARISON_VERSION,
              ...result,
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
