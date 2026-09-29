import { describe, expect, it } from "vitest";
import { SQLiteDialect } from "drizzle-orm/sqlite-core";
import type { Database } from "@pricelog/db";
import { directoryPopulationCondition, readExamples } from "./directory";

describe("directory population", () => {
  it("shows published captures even when their benchmark rubric has changed", () => {
    const query = new SQLiteDialect().sqlToQuery(directoryPopulationCondition()!);
    expect(query.sql).toContain('"page"."state" = ?');
    expect(query.sql).not.toContain("rubric_id");
    expect(query.params).toEqual(["active"]);
  });

  it("keeps benchmark bar links in their exact measured population", () => {
    const query = new SQLiteDialect().sqlToQuery(
      directoryPopulationCondition({ signal: "charges_direct_usage" })!,
    );
    expect(query.sql).toContain('"page_public_summary"."rubric_id" = ?');
  });
});

describe("numeric source examples", () => {
  it("continues past uncollected products and another category to find eligible sources", async () => {
    const base = {
      choices: [{ key: "product_category", choice: "coding_assistants" }],
      signals: [],
      numericPrices: null,
    };
    const eligible = {
      ...base,
      id: "501",
      numericPrices: { status: "collected", offers: [{ amount: "20" }] },
    };
    const other = {
      ...eligible,
      id: "500",
      choices: [{ key: "product_category", choice: "voice_agents" }],
    };
    const batches = [
      Array.from({ length: 500 }, (_, index) => ({ ...base, id: String(index) })),
      [other, eligible],
    ];
    let reads = 0;
    const query = {
      from: () => query,
      innerJoin: () => query,
      where: () => query,
      orderBy: () => query,
      limit: async () => batches[reads++] ?? [],
    };
    const db = { select: () => query } as unknown as Database;
    expect(await readExamples(db, "category:coding_assistants", true)).toEqual([eligible]);
    expect(reads).toBe(2);
  });
});
