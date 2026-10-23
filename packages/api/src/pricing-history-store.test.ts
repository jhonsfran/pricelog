import { describe, expect, it } from "vitest";
import { readWeeklyHistory } from "./pricing-history-store";
import { archiveInput, historyDatabase } from "./pricing-history-test-fixtures";

describe("D1 weekly history queries", () => {
  it("selects the latest capture for each page and week before returning the corpus", async () => {
    const { sqlite, repo, db } = historyDatabase();
    try {
      await repo.archive(archiveInput("before", Date.parse("2026-09-10")));
      for (let i = 0; i < 125; i++)
        await repo.archive(
          archiveInput(`after-${String(i).padStart(3, "0")}`, Date.parse("2026-09-17") + i),
        );
      const other = archiveInput("other-before", Date.parse("2026-09-10"));
      other.pageId = "other";
      await repo.archive(other);
      const latest = archiveInput("other-after", Date.parse("2026-09-17"));
      latest.pageId = "other";
      await repo.archive(latest);
      for (const pageId of ["page", "other"])
        await repo.writeImport(pageId, {
          sourceIdentity: pageId,
          checkpoint: null,
          expectedCount: 0,
          importedCount: 0,
          ready: true,
        });
      const result = await readWeeklyHistory(db, new Date("2026-09-21"));
      expect(result.observations.map((row) => row.runId).sort()).toEqual([
        "after-124",
        "before",
        "other-after",
        "other-before",
      ]);
      expect(result.observations.every((row) => Boolean(row.analysisId))).toBe(true);
    } finally {
      sqlite.close();
    }
  });

  it("rejects incomplete corpus reads and never returns partial coverage", async () => {
    const { sqlite, repo, db } = historyDatabase();
    try {
      await repo.archive(archiveInput());
      await expect(readWeeklyHistory(db)).rejects.toThrow("not ready");
      await repo.writeImport("page", {
        sourceIdentity: "page",
        checkpoint: null,
        expectedCount: 0,
        importedCount: 0,
        ready: true,
      });
      expect((await readWeeklyHistory(db)).observations).toEqual([]);
    } finally {
      sqlite.close();
    }
  });
});
