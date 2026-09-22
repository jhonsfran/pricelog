import { createClient } from "@libsql/client";
import { page, pagePublicSummary } from "@my-better-t-app/db/schema/pages";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { describe, expect, it } from "vitest";

import { hasChoice, inCohort, statesSignal } from "./directory-filters";

/**
 * These conditions are raw SQL over JSON columns, so the only test worth
 * writing runs them through a real SQLite engine. A unit test asserting the
 * generated string would pass while `json_each` returned nothing.
 */
async function seed() {
  const client = createClient({ url: "file::memory:" });
  await client.executeMultiple(`
    create table page (
      id text primary key, owner_user_id text, normalized_domain text, canonical_url text,
      slug text, display_name text, description text, state text, created_at integer, updated_at integer
    );
    create table page_public_summary (
      page_id text primary key, run_id text, rubric_id text, model text, numeric_prices_json text,
      choices_json text, signals_json text, tags_json text, browser_engine text,
      scanned_at integer, updated_at integer
    );
  `);
  const rows = [
    {
      id: "subscription-only",
      signals: [
        { key: "fixed_subscription", probability: 0.95 },
        { key: "credit_wallet", probability: 0.05 },
      ],
      choices: [
        { key: "product_category", choice: "coding_assistants" },
        { key: "credit_conversion", choice: "not_disclosed" },
      ],
    },
    {
      id: "both",
      signals: [
        { key: "fixed_subscription", probability: 0.99 },
        { key: "credit_wallet", probability: 0.88 },
      ],
      choices: [
        { key: "product_category", choice: "voice_agents" },
        { key: "credit_conversion", choice: "some_described_uses" },
      ],
    },
    {
      // Above zero but under the publication threshold: the chart does not
      // count this page, so the filter must not return it either.
      id: "uncertain",
      signals: [{ key: "fixed_subscription", probability: 0.6 }],
      choices: [{ key: "product_category", choice: "coding_assistants" }],
    },
  ];
  for (const row of rows) {
    await client.execute({
      sql: "insert into page (id, state, created_at) values (?, 'active', 1)",
      args: [row.id],
    });
    await client.execute({
      sql: "insert into page_public_summary (page_id, choices_json, signals_json) values (?, ?, ?)",
      args: [row.id, JSON.stringify(row.choices), JSON.stringify(row.signals)],
    });
  }
  return drizzle({ client });
}

async function ids(db: Awaited<ReturnType<typeof seed>>, condition: ReturnType<typeof hasChoice>) {
  const rows = await db
    .select({ id: page.id })
    .from(page)
    .innerJoin(pagePublicSummary, eq(pagePublicSummary.pageId, page.id))
    .where(and(eq(page.state, "active"), condition))
    .orderBy(page.id);
  return rows.map((row) => row.id);
}

describe("directory filters", () => {
  it("returns only pages that state the signal above the publication threshold", async () => {
    const db = await seed();
    expect(await ids(db, statesSignal("fixed_subscription"))).toEqual([
      "both",
      "subscription-only",
    ]);
    expect(await ids(db, statesSignal("credit_wallet"))).toEqual(["both"]);
  });

  it("matches a published classification on its accepted answer", async () => {
    const db = await seed();
    expect(await ids(db, hasChoice("credit_conversion", "not_disclosed"))).toEqual([
      "subscription-only",
    ]);
    expect(await ids(db, hasChoice("product_category", "coding_assistants"))).toEqual([
      "subscription-only",
      "uncertain",
    ]);
  });

  it("combines a cohort with a signal, which is what a cohort chart links to", async () => {
    const db = await seed();
    const rows = await db
      .select({ id: page.id })
      .from(page)
      .innerJoin(pagePublicSummary, eq(pagePublicSummary.pageId, page.id))
      .where(and(inCohort("category:coding_assistants")!, statesSignal("fixed_subscription")))
      .orderBy(page.id);
    expect(rows.map((row) => row.id)).toEqual(["subscription-only"]);
  });

  it("resolves the umbrella cohort to every category it covers", async () => {
    const db = await seed();
    // Both seeded categories are AI application categories, so the umbrella
    // must return both rather than picking one of them.
    expect(await ids(db, inCohort("ai_applications")!)).toEqual([
      "both",
      "subscription-only",
      "uncertain",
    ]);
  });

  it("adds no condition for a cohort it cannot express as categories", async () => {
    expect(inCohort("all")).toBeUndefined();
    expect(inCohort("market:developer_tools")).toBeUndefined();
    expect(inCohort("category:not_a_real_category")).toBeUndefined();
  });
});
