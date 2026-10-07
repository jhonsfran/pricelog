import { describe, expect, it } from "vitest";
import { SQLiteDialect } from "drizzle-orm/sqlite-core";
import type { Database } from "@pricelog/db";
import { directoryCard, directoryPopulationCondition, readExamples } from "./directory";
import type { PublishedSnapshot } from "../pricing-snapshot";

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

describe("directory cards", () => {
  it("keeps the displayed prices and plan count without sending the full capture", () => {
    const snapshot: PublishedSnapshot = {
      version: "pricing-snapshot-v4",
      status: "collected",
      offers: [
        {
          name: "Pro",
          prices: [
            {
              kind: "flat",
              price_raw: "$20/month",
              price_numeric: 20,
              period: "month",
              billing: "monthly",
              state: "default",
            },
          ],
        },
      ],
      features: [
        {
          name: "A feature with a long description",
          availability: [{ offer: "Pro", status: "included" }],
        },
      ],
    };
    const item = {
      id: "page",
      slug: "example.com",
      normalizedDomain: "example.com",
      canonicalUrl: "https://example.com/pricing",
      displayName: "Example",
      description: "Example product",
      createdAt: new Date(),
      scannedAt: new Date(),
      choices: [
        {
          key: "product_category",
          choice: "coding_assistants",
          confidence: 1,
          probabilities: { coding_assistants: 1 },
        },
      ],
      tags: ["fixed-subscription"],
      numericPrices: null,
      snapshot,
    } satisfies Parameters<typeof directoryCard>[0];
    const card = directoryCard(item);
    expect(card).toMatchObject({
      category: "coding_assistants",
      plans: 1,
      entry: "$20/mo",
      ladder: [{ plan: "Pro", amount: 20, label: "$20/mo", tier: "paid" }],
    });
    expect(card).not.toHaveProperty("snapshot");
    expect(card).not.toHaveProperty("numericPrices");
    expect(card.scannedAt).toBe(item.scannedAt);
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
