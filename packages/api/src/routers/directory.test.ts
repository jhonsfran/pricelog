import { describe, expect, it } from "vitest";
import type { Database } from "@my-better-t-app/db";
import { readExamples } from "./directory";

describe("numeric source examples", () => {
  it("continues past uncollected products and another category to find eligible sources", async () => {
    const base = {
      choices: [{ key: "product_category", choice: "coding_assistants" }],
      signals: [],
      numericPrices: null,
    };
    const eligible = {
      ...base,
      id: "101",
      numericPrices: { status: "collected", offers: [{ amount: "20" }] },
    };
    const other = {
      ...eligible,
      id: "100",
      choices: [{ key: "product_category", choice: "voice_agents" }],
    };
    const batches = [
      Array.from({ length: 100 }, (_, index) => ({ ...base, id: String(index) })),
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
