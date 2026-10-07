import { DatabaseSync } from "node:sqlite";
import { sql } from "drizzle-orm";
import { SQLiteDialect } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import { planCountSql } from "./pricing-snapshot-count";
import { planOffers, type PublishedSnapshot } from "./pricing-snapshot";

describe("stored plan counts", () => {
  it("uses the same plan rule for summaries and stored version evaluations", () => {
    const snapshot: PublishedSnapshot = {
      version: "pricing-snapshot-v4",
      status: "collected",
      features: [
        {
          name: "Seats",
          availability: [
            { offer: "Unpriced", status: "included" },
            { offer: "Unpriced", status: "limited" },
          ],
        },
      ],
      offers: (["free", "per_seat", "custom", "add_on", "usage"] as const).map((kind, index) => ({
        name: String(index),
        prices: [
          {
            kind,
            price_raw: "$20",
            price_numeric: 20,
            period: "month",
            billing: "unknown",
            state: "default",
          },
        ],
      })),
    };
    const database = new DatabaseSync(":memory:");
    try {
      database.exec("create table captures (snapshot text, evaluation text)");
      database
        .prepare("insert into captures values (?, ?)")
        .run(JSON.stringify(snapshot), JSON.stringify({ snapshot }));
      const dialect = new SQLiteDialect();
      for (const value of [sql.raw("snapshot"), sql`json_extract(evaluation, '$.snapshot')`]) {
        const query = dialect.sqlToQuery(sql`select ${planCountSql(value)} as plans from captures`);
        expect(database.prepare(query.sql).get()?.plans).toBe(planOffers(snapshot).length);
      }
    } finally {
      database.close();
    }
  });
});
