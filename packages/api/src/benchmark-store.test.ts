import { SQLiteDialect } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import { PRICING_INTELLIGENCE_RUBRIC_ID } from "@my-better-t-app/db/pricing-intelligence";
import { EXPECTED_JEV_MODEL, MAX_CAPTURE_AGE_MS } from "@my-better-t-app/db/measurement-policy";

import { type BenchmarkPage } from "./benchmark";
import { benchmarkCorpusCondition, collectBenchmarkCorpus } from "./benchmark-store";

function row(id: string): BenchmarkPage & { id: string } {
  return { id, choices: [], signals: [] };
}

describe("benchmark corpus", () => {
  it("filters active summaries by rubric and advances by page id", () => {
    const now = new Date("2026-09-22T12:00:00.000Z");
    const condition = benchmarkCorpusCondition(now, "page-10");
    const query = new SQLiteDialect().sqlToQuery(condition!);

    expect(query.sql).toContain('"page"."state" = ?');
    expect(query.sql).toContain('"page_public_summary"."rubric_id" = ?');
    expect(query.sql).toContain('"page"."id" > ?');
    expect(query.params).toEqual([
      "active",
      PRICING_INTELLIGENCE_RUBRIC_ID,
      EXPECTED_JEV_MODEL,
      now.getTime() - MAX_CAPTURE_AGE_MS,
      now.getTime(),
      "page-10",
    ]);
  });

  it("collects every page through the final partial batch", async () => {
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
