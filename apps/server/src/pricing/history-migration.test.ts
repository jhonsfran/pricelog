import { describe, expect, it } from "vitest";
import { historyDatabase } from "@pricelog/api/pricing-history-test-fixtures";
import { migratePricingHistoryBatch } from "./history-migration";

describe("history import registry sweep", () => {
  it("includes pending pages and moves past failed sources with a bounded cursor", async () => {
    const fixture = historyDatabase();
    try {
      for (let i = 0; i < 8; i++)
        fixture.sqlite
          .prepare(
            "INSERT INTO page(id,owner_user_id,normalized_domain,canonical_url,slug) VALUES (?,'owner',?,?,?)",
          )
          .run(`a-${i}`, `a-${i}.com`, `https://a-${i}.com/pricing`, `a-${i}`);
      const visited: string[] = [];
      const getStore = (domain: string) => ({
        async migrateHistory(_limit: number, identity: { pageId: string }) {
          visited.push(domain);
          if (identity.pageId.startsWith("a-")) throw new Error("Source unavailable");
          const progress = {
            sourceIdentity: identity.pageId,
            checkpoint: null,
            expectedCount: 0,
            importedCount: 0,
            ready: true,
          };
          await fixture.repo.writeImport(identity.pageId, progress);
          return progress;
        },
      });
      const first = await migratePricingHistoryBatch(fixture.db, getStore);
      expect(first.results).toHaveLength(5);
      expect(first.nextCursor).toBe("a-4");
      const second = await migratePricingHistoryBatch(fixture.db, getStore, first.nextCursor!);
      expect(second.results.map((row) => row.pageId)).toEqual([
        "a-5",
        "a-6",
        "a-7",
        "other",
        "page",
      ]);
      expect(second.nextCursor).toBeNull();
      expect(second.remainingPages).toBe(8);
      expect(visited).toHaveLength(10);
    } finally {
      fixture.sqlite.close();
    }
  });
});
