import type { Database } from "@pricelog/db";
import { page } from "@pricelog/db/schema/pages";
import { and, asc, eq, gt } from "drizzle-orm";
import type { PageMonitorService } from "./context";
import type { Comparison, Observation } from "./pricing-history";

export type HistoryPage = {
  id: string;
  normalizedDomain: string;
  slug: string;
  displayName: string | null;
};

/** Enumerate the full active registry with bounded queries and DO concurrency. */
export async function* activePageBatches(db: Database): AsyncGenerator<HistoryPage[]> {
  let cursor: string | undefined;
  for (;;) {
    const batch = await db
      .select({
        id: page.id,
        normalizedDomain: page.normalizedDomain,
        slug: page.slug,
        displayName: page.displayName,
      })
      .from(page)
      .where(and(eq(page.state, "active"), cursor ? gt(page.id, cursor) : undefined))
      .orderBy(asc(page.id))
      .limit(20);
    if (batch.length === 0) return;
    yield batch;
    cursor = batch.at(-1)!.id;
  }
}

export async function readWeeklyHistory(
  db: Database,
  monitor: Pick<PageMonitorService, "getWeeklyHistory">,
  now = new Date(),
): Promise<{ observations: Observation[]; comparisons: Comparison[] }> {
  const observations: Observation[] = [];
  const comparisons: Comparison[] = [];
  for await (const batch of activePageBatches(db)) {
    const histories = await Promise.all(
      batch.map(async (page) => {
        const history = await monitor.getWeeklyHistory(
          page.normalizedDomain,
          page.id,
          now.getTime(),
        );
        return { page, history };
      }),
    );
    for (const { page, history } of histories) {
      observations.push(
        ...history.observations.map((row) => ({
          ...row,
          slug: page.slug,
          name: page.displayName ?? page.normalizedDomain,
        })),
      );
      comparisons.push(...history.comparisons);
    }
  }
  return { observations, comparisons };
}
