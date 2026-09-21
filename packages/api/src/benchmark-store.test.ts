import { SQLiteDialect } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";

import type { BenchmarkPage } from "./benchmark";
import { benchmarkCorpusCondition, collectBenchmarkCorpus } from "./benchmark-store";

function row(id: string): BenchmarkPage & { id: string } {
  return { id, overallScore: 50, scores: [], choices: [], signals: [] };
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
