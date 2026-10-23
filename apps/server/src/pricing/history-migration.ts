import type { Database } from "@pricelog/db";
import { page } from "@pricelog/db/schema/pages";
import { historyImport } from "@pricelog/db/schema/pricing-history";
import { and, asc, eq, gt, sql } from "drizzle-orm";
import type { ImportProgress } from "./legacy-history";

type MigrationStore = {
  migrateHistory(
    limit: number,
    identity: { pageId: string; normalizedDomain: string; canonicalUrl: string },
  ): Promise<ImportProgress>;
};

export async function migratePricingHistoryBatch(
  db: Database,
  getStore: (domain: string) => MigrationStore,
  afterPageId?: string,
) {
  const pages = await db
    .select({
      id: page.id,
      normalizedDomain: page.normalizedDomain,
      canonicalUrl: page.canonicalUrl,
    })
    .from(page)
    .leftJoin(historyImport, eq(historyImport.pageId, page.id))
    .where(
      and(
        sql`(${historyImport.ready} is null or ${historyImport.ready} = 0)`,
        afterPageId ? gt(page.id, afterPageId) : undefined,
      ),
    )
    .orderBy(asc(page.id))
    .limit(6);
  const results: { pageId: string; progress?: ImportProgress; error?: string }[] = [];
  for (const row of pages.slice(0, 5)) {
    try {
      results.push({
        pageId: row.id,
        progress: await getStore(row.normalizedDomain).migrateHistory(10, {
          pageId: row.id,
          normalizedDomain: row.normalizedDomain,
          canonicalUrl: row.canonicalUrl,
        }),
      });
    } catch (error) {
      results.push({
        pageId: row.id,
        error: error instanceof Error ? error.message : "History import failed",
      });
    }
  }
  const [pending] = await db
    .select({ count: sql<number>`count(*)` })
    .from(page)
    .leftJoin(historyImport, eq(historyImport.pageId, page.id))
    .where(sql`${historyImport.ready} is null or ${historyImport.ready} = 0`);
  return {
    results,
    remainingPages: pending?.count ?? 0,
    nextCursor: pages.length > 5 ? pages[4]!.id : null,
  };
}
