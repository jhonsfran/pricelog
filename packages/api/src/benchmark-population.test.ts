import { createClient } from "@libsql/client";
import type { Database } from "@pricelog/db";
import { EXPECTED_JEV_MODEL, MAX_CAPTURE_AGE_MS } from "@pricelog/db/measurement-policy";
import { PRICING_INTELLIGENCE_RUBRIC_ID } from "@pricelog/db/pricing-intelligence";
import { call } from "@orpc/server";
import { drizzle } from "drizzle-orm/libsql";
import { afterEach, describe, expect, it, vi } from "vitest";

import { loadBenchmarks, readBenchmarkCoverage, storeBenchmarks } from "./benchmark-store";
import type { Context } from "./context";
import { directoryRouter, readExamples } from "./routers/directory";

const now = new Date("2026-09-22T12:00:00.000Z");
const cutoff = new Date(now.getTime() - MAX_CAPTURE_AGE_MS);
type Fixture = {
  id: string;
  capturedAt?: Date;
  model?: string;
  rubricId?: string;
  state?: "active" | "pending";
  missingSummary?: boolean;
  probability?: number;
};

async function seed(rows: Fixture[]) {
  const client = createClient({ url: "file::memory:" });
  await client.executeMultiple(`
    create table page (
      id text primary key, owner_user_id text, normalized_domain text, canonical_url text,
      slug text, display_name text, description text, state text, created_at integer, updated_at integer
    );
    create table page_public_summary (
      page_id text primary key, run_id text, rubric_id text, model text, numeric_prices_json text,
      snapshot_json text, review_json text,
      choices_json text, signals_json text, tags_json text, browser_engine text,
      scanned_at integer, updated_at integer
    );
    create table benchmark_snapshot (
      id text primary key, rubric_id text, cohort text, computed_at integer, page_count integer,
      numeric_prices_json text, choice_shares_json text, signal_counts_json text, signal_shares_json text,
      unique (rubric_id, cohort, computed_at)
    );
  `);
  for (const item of rows) {
    await client.execute({
      sql: "insert into page (id, slug, normalized_domain, canonical_url, state, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?)",
      args: [
        item.id,
        item.id,
        `${item.id}.com`,
        `https://${item.id}.com/pricing`,
        item.state ?? "active",
        now.getTime(),
        now.getTime(),
      ],
    });
    if (item.missingSummary) continue;
    await client.execute({
      sql: "insert into page_public_summary (page_id, run_id, rubric_id, model, choices_json, signals_json, tags_json, scanned_at, updated_at) values (?, ?, ?, ?, ?, ?, '[]', ?, ?)",
      args: [
        item.id,
        item.id,
        item.rubricId ?? PRICING_INTELLIGENCE_RUBRIC_ID,
        item.model ?? EXPECTED_JEV_MODEL,
        JSON.stringify([{ key: "product_category", choice: "coding_assistants" }]),
        JSON.stringify([
          { key: "charges_fixed_subscription", probability: item.probability ?? 0.99 },
        ]),
        (item.capturedAt ?? now).getTime(),
        now.getTime(),
      ],
    });
  }
  return { client, db: drizzle({ client }) as unknown as Database };
}

afterEach(() => vi.useRealTimers());

describe("current benchmark measurements", () => {
  it("uses one comparable population for charts and examples while the catalog retains published pages", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
    const { db, client } = await seed([
      { id: "current" },
      { id: "cutoff", capturedAt: cutoff },
      { id: "stale", capturedAt: new Date(cutoff.getTime() - 1) },
      { id: "future", capturedAt: new Date(now.getTime() + 1) },
      { id: "model-mismatch", model: "jev-1.12.0", capturedAt: new Date(cutoff.getTime() - 1) },
      { id: "rubric-mismatch", rubricId: "old-rubric", capturedAt: new Date(now.getTime() + 1) },
      { id: "pending", state: "pending", model: "wrong-model" },
      { id: "not-scanned", missingSummary: true },
      { id: "uncertain", probability: 0.5 },
    ]);
    try {
      const context = { db, session: null, pageMonitor: {} } as Context;
      const benchmark = await call(directoryRouter.benchmarks, { cohort: "all" }, { context });
      expect(benchmark.selected?.pageCount).toBe(3);
      expect(benchmark.selected?.signalCounts.charges_fixed_subscription).toBe(2);
      expect(benchmark.coverage).toEqual({
        total: 9,
        eligible: 3,
        stale: 2,
        incompatible: 2,
        pending: 2,
      });
      expect(benchmark.examples.map((example) => example.id)).toEqual([
        "current",
        "cutoff",
        "uncertain",
      ]);
      expect((await readExamples(db, "all")).map((example) => example.id)).toEqual([
        "current",
        "cutoff",
        "uncertain",
      ]);
      const list = await call(
        directoryRouter.list,
        { cohort: "all", signal: "charges_fixed_subscription" },
        { context },
      );
      expect(list.total).toBe(benchmark.selected?.signalCounts.charges_fixed_subscription);
      expect(list.items.map((item) => item.id).sort()).toEqual(["current", "cutoff"]);
      const all = await call(directoryRouter.list, {}, { context });
      expect(all.total).toBe(7);
    } finally {
      client.close();
    }
  });

  it("expires captures without a write or the next scheduled snapshot", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
    const { db, client } = await seed([{ id: "cutoff", capturedAt: cutoff }]);
    try {
      expect(await storeBenchmarks(db)).toBeGreaterThan(0);
      expect((await loadBenchmarks(db)).snapshots[0]?.pageCount).toBe(1);
      vi.setSystemTime(new Date(now.getTime() + 1));
      expect((await loadBenchmarks(db)).snapshots).toEqual([]);
      expect(await readBenchmarkCoverage(db)).toEqual({
        total: 1,
        eligible: 0,
        stale: 1,
        incompatible: 0,
        pending: 0,
      });
      expect(
        (await client.execute("select count(*) as count from benchmark_snapshot")).rows[0]?.count,
      ).toBeGreaterThan(0);
    } finally {
      client.close();
    }
  });

  it("reports pending pages even when no page has an observation", async () => {
    const { db, client } = await seed([{ id: "pending", state: "pending", missingSummary: true }]);
    try {
      expect(await readBenchmarkCoverage(db)).toEqual({
        total: 1,
        eligible: 0,
        stale: 0,
        incompatible: 0,
        pending: 1,
      });
    } finally {
      client.close();
    }
  });
});
