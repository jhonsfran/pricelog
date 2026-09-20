import { sql } from "drizzle-orm";
import { check, index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { user } from "./auth";
import type { PricingChoiceKey, PricingScoreKey, PricingSignalKey } from "../pricing-intelligence";

export type PageScore = {
  key: PricingScoreKey;
  score: number;
  confidence: number;
};

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
    overallScore: real("overall_score").notNull(),
    scores: text("scores_json", { mode: "json" }).$type<PageScore[]>().notNull(),
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
  (table) => [
    index("page_public_summary_score_idx").on(table.overallScore, table.pageId),
    index("page_public_summary_scanned_at_idx").on(table.scannedAt, table.pageId),
    check(
      "page_public_summary_score_check",
      sql`${table.overallScore} >= 0 and ${table.overallScore} <= 100`,
    ),
  ],
);

export const pageOwnerState = sqliteTable("page_owner_state", {
  pageId: text("page_id")
    .primaryKey()
    .references(() => page.id, { onDelete: "cascade" }),
  activeRunId: text("active_run_id"),
  lastRunId: text("last_run_id"),
  lastRunStatus: text("last_run_status", {
    enum: ["queued", "running", "succeeded", "failed"],
  }),
  nextScanAt: integer("next_scan_at", { mode: "timestamp_ms" }),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => new Date())
    .notNull(),
});
