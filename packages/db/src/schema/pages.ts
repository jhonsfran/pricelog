import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { user } from "./auth";
import type { NumericPrices } from "../numeric-prices";
import type { PricingFacts } from "../pricing-facts";
import type { PublishedSnapshot, SnapshotReview } from "../pricing-snapshot";
import { type PricingChoiceKey, type PricingSignalKey } from "../pricing-intelligence";

export type PageChoice = {
  key: PricingChoiceKey;
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
};

export type PageSignal = {
  key: PricingSignalKey;
  probability: number;
};

export const page = sqliteTable(
  "page",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => user.id),
    normalizedDomain: text("normalized_domain").notNull().unique(),
    canonicalUrl: text("canonical_url").notNull(),
    slug: text("slug").notNull().unique(),
    displayName: text("display_name"),
    description: text("description"),
    state: text("state", { enum: ["pending", "active"] })
      .default("pending")
      .notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("page_owner_created_at_idx").on(table.ownerUserId, table.createdAt),
    index("page_state_created_at_idx").on(table.state, table.createdAt),
    check("page_state_check", sql`${table.state} in ('pending', 'active')`),
  ],
);

export const pagePublicSummary = sqliteTable(
  "page_public_summary",
  {
    pageId: text("page_id")
      .primaryKey()
      .references(() => page.id, { onDelete: "cascade" }),
    runId: text("run_id").notNull().unique(),
    rubricId: text("rubric_id").notNull(),
    model: text("model").notNull(),
    numericPrices: text("numeric_prices_json", { mode: "json" }).$type<NumericPrices>(),
    pricingFacts: text("pricing_facts_json", { mode: "json" }).$type<PricingFacts>(),
    snapshot: text("snapshot_json", { mode: "json" }).$type<PublishedSnapshot>(),
    review: text("review_json", { mode: "json" }).$type<SnapshotReview[]>(),
    choices: text("choices_json", { mode: "json" })
      .$type<PageChoice[]>()
      .default(sql`'[]'`)
      .notNull(),
    signals: text("signals_json", { mode: "json" })
      .$type<PageSignal[]>()
      .default(sql`'[]'`)
      .notNull(),
    tags: text("tags_json", { mode: "json" })
      .$type<string[]>()
      .default(sql`'[]'`)
      .notNull(),
    browserEngine: text("browser_engine", { enum: ["chromium"] }).notNull(),
    scannedAt: integer("scanned_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("page_public_summary_scanned_at_idx").on(table.scannedAt, table.pageId)],
);

export const pageOwnerState = sqliteTable("page_owner_state", {
  pageId: text("page_id")
    .primaryKey()
    .references(() => page.id, { onDelete: "cascade" }),
  activeRunId: text("active_run_id"),
  lastRunId: text("last_run_id"),
  lastRunCreatedAt: integer("last_run_created_at").default(0).notNull(),
  lastRunStatus: text("last_run_status", {
    enum: ["queued", "running", "succeeded", "failed"],
  }),
  nextScanAt: integer("next_scan_at", { mode: "timestamp_ms" }),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => new Date())
    .notNull(),
});

/** `answered` is the honest denominator: pages with a confident answer, not cohort size. */
export type BenchmarkChoiceShare = {
  answered: number;
  options: Record<string, number>;
};

export type BenchmarkSignalShare = {
  stated: number;
  notEstablished: number;
  uncertain: number;
};

export type NumericPriceGroup = {
  currency: "USD" | "EUR" | "GBP";
  billing: "monthly" | "annual";
  chargeUnit: "flat" | "seat";
  count: number;
  median: number | null;
  minimum: number | null;
  maximum: number | null;
};

export type NumericPriceBenchmark = {
  version: "numeric-prices-v1";
  collected: number;
  withOffers: number;
  unavailable: number;
  notCollected: number;
  groups: NumericPriceGroup[];
};

/**
 * One row per cohort per computation. Snapshots are append-only: they are what
 * turns the index into a time series, and that history cannot be backfilled.
 */
export const benchmarkSnapshot = sqliteTable(
  "benchmark_snapshot",
  {
    id: text("id").primaryKey(),
    rubricId: text("rubric_id").notNull(),
    cohort: text("cohort").notNull(),
    computedAt: integer("computed_at", { mode: "timestamp_ms" }).notNull(),
    pageCount: integer("page_count").notNull(),
    numericPrices: text("numeric_prices_json", { mode: "json" }).$type<NumericPriceBenchmark>(),
    choiceShares: text("choice_shares_json", { mode: "json" })
      .$type<Record<string, BenchmarkChoiceShare>>()
      .notNull(),
    signalCounts: text("signal_counts_json", { mode: "json" })
      .$type<Record<string, number>>()
      .notNull(),
    signalShares: text("signal_shares_json", { mode: "json" })
      .$type<Record<string, BenchmarkSignalShare>>()
      .default(sql`'{}'`)
      .notNull(),
  },
  (table) => [
    uniqueIndex("benchmark_snapshot_rubric_cohort_computed_at_idx").on(
      table.rubricId,
      table.cohort,
      table.computedAt,
    ),
    index("benchmark_snapshot_computed_at_idx").on(table.computedAt),
    check("benchmark_snapshot_page_count_check", sql`${table.pageCount} >= 0`),
  ],
);
