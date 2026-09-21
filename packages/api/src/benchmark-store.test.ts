import { SQLiteDialect } from "drizzle-orm/sqlite-core";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "@my-better-t-app/db";

import { buildBenchmarkSnapshots, type BenchmarkPage } from "./benchmark";
import {
  benchmarkCorpusCondition,
  collectBenchmarkCorpus,
  loadBenchmarks,
} from "./benchmark-store";

function row(id: string): BenchmarkPage & { id: string } {
  return { id, choices: [], signals: [] };
}

describe("benchmark corpus", () => {
  it("filters active summaries by rubric and advances by page id", () => {
    const condition = benchmarkCorpusCondition("pricing-intelligence-v3", "page-10");
    const query = new SQLiteDialect().sqlToQuery(condition!);

    expect(query.sql).toContain('"page"."state" = ?');
    expect(query.sql).toContain('"page_public_summary"."rubric_id" = ?');
    expect(query.sql).toContain('"page"."id" > ?');
    expect(query.params).toEqual(["active", "pricing-intelligence-v3", "page-10"]);
  });

  it("collects every page instead of applying the live fallback limit", async () => {
    const pages = [row("a"), row("b"), row("c"), row("d"), row("e")];
    const cursors: Array<string | undefined> = [];

    const corpus = await collectBenchmarkCorpus(async (afterId) => {
      cursors.push(afterId);
      const start = afterId ? pages.findIndex((page) => page.id === afterId) + 1 : 0;
      return pages.slice(start, start + 2);
    }, 2);

    expect(corpus).toHaveLength(5);
    expect(cursors).toEqual([undefined, "b", "d"]);
  });

  it("rejects a reader that cannot advance its cursor", async () => {
    await expect(collectBenchmarkCorpus(async () => [row("a")], 1)).rejects.toThrow(
      "did not advance",
    );
  });
});

function databaseWithResults(results: unknown[][]) {
  let nextResult = 0;
  const select = vi.fn(() => {
    const rows = results[nextResult++];
    if (!rows) throw new Error("Unexpected database read");
    return Object.assign(Promise.resolve(rows), {
      from() {
        return this;
      },
      innerJoin() {
        return this;
      },
      where() {
        return this;
      },
      orderBy() {
        return this;
      },
      limit() {
        return this;
      },
    });
  });
  return { db: { select } as unknown as Database, select };
}

function categoryPage(id: string, category: string): BenchmarkPage & { id: string } {
  return { ...row(id), choices: [{ key: "product_category", choice: category }] };
}

describe("benchmark snapshot freshness", () => {
  const computedAt = new Date("2026-09-21T12:00:00.000Z");
  const initialPage = categoryPage("a", "coding_assistants");
  const stored = buildBenchmarkSnapshots([initialPage]);

  it("shows a newly populated category before the next scheduled snapshot", async () => {
    const addedPage = categoryPage("b", "model_apis");
    const { db } = databaseWithResults([
      [{ computedAt }],
      stored,
      [{ pageCount: 2, updatedAt: computedAt.getTime() + 1 }],
      [initialPage, addedPage],
    ]);

    const reading = await loadBenchmarks(db);

    expect(reading).toMatchObject({ live: true, computedAt: null });
    expect(reading.snapshots).toContainEqual(
      expect.objectContaining({ cohort: "all", pageCount: 2 }),
    );
    expect(reading.snapshots).toContainEqual(
      expect.objectContaining({ cohort: "category:model_apis", pageCount: 1 }),
    );
  });

  it("refreshes category membership when the page count is unchanged", async () => {
    const movedPage = categoryPage("a", "model_apis");
    const { db } = databaseWithResults([
      [{ computedAt }],
      stored,
      [{ pageCount: 1, updatedAt: computedAt.getTime() + 1 }],
      [movedPage],
    ]);

    const reading = await loadBenchmarks(db);

    expect(reading.live).toBe(true);
    expect(reading.snapshots).toContainEqual(
      expect.objectContaining({ cohort: "category:model_apis", pageCount: 1 }),
    );
    expect(
      reading.snapshots.some((snapshot) => snapshot.cohort === "category:coding_assistants"),
    ).toBe(false);
  });

  it("removes stale counts when the active corpus becomes empty", async () => {
    const { db } = databaseWithResults([
      [{ computedAt }],
      stored,
      [{ pageCount: 0, updatedAt: null }],
      [],
    ]);

    expect(await loadBenchmarks(db)).toEqual({ snapshots: [], computedAt: null, live: true });
  });

  it("reuses an unchanged stored snapshot without reading the full corpus", async () => {
    const { db, select } = databaseWithResults([
      [{ computedAt }],
      stored,
      [{ pageCount: 1, updatedAt: computedAt.getTime() - 1 }],
    ]);

    expect(await loadBenchmarks(db)).toEqual({ snapshots: stored, computedAt, live: false });
    expect(select).toHaveBeenCalledTimes(3);
  });
});
