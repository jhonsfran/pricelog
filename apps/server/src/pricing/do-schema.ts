import type { Comparison } from "@my-better-t-app/api/pricing-history";
import type { PublicEvaluation } from "./evaluation";
import { SCAN_RUN_STAGES } from "@my-better-t-app/db/scan-stage";
import type { RunEvent } from "./types";
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

const now = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

export const pageConfig = sqliteTable(
  "page_config",
  {
    id: integer("id").primaryKey(),
    pageId: text("page_id").notNull().unique(),
    normalizedDomain: text("normalized_domain").notNull(),
    canonicalUrl: text("canonical_url").notNull(),
    createdAt: integer("created_at").default(now).notNull(),
    updatedAt: integer("updated_at").default(now).notNull(),
  },
  (table) => [check("page_config_singleton_check", sql`${table.id} = 1`)],
);

export const schedulerState = sqliteTable(
  "scheduler_state",
  {
    id: integer("id").primaryKey(),
    activeRunId: text("active_run_id"),
    nextScanAt: integer("next_scan_at"),
    updatedAt: integer("updated_at").default(now).notNull(),
  },
  (table) => [check("scheduler_state_singleton_check", sql`${table.id} = 1`)],
);

export const scanRun = sqliteTable(
  "scan_run",
  {
    id: text("id").primaryKey(),
    trigger: text("trigger", { enum: ["initial", "scheduled", "manual"] }).notNull(),
    status: text("status", { enum: ["queued", "running", "succeeded", "failed"] }).notNull(),
    stage: text("stage", { enum: SCAN_RUN_STAGES }).notNull(),
    workflowInstanceId: text("workflow_instance_id").notNull().unique(),
    requestedByUserId: text("requested_by_user_id"),
    browserEngine: text("browser_engine", { enum: ["chromium"] }),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    events: text("events", { mode: "json" })
      .$type<RunEvent[]>()
      .notNull()
      .default(sql`'[]'`),
    createdAt: integer("created_at").default(now).notNull(),
    startedAt: integer("started_at"),
    completedAt: integer("completed_at"),
  },
  (table) => [
    index("scan_run_created_at_idx").on(table.createdAt, table.id),
    index("scan_run_status_created_at_idx").on(table.status, table.createdAt),
  ],
);

export const pageVersion = sqliteTable("page_version", {
  id: text("id").primaryKey(),
  runId: text("run_id")
    .notNull()
    .unique()
    .references(() => scanRun.id, { onDelete: "cascade" }),
  capturedAt: integer("captured_at").notNull(),
  httpStatus: integer("http_status").notNull(),
  finalUrl: text("final_url").notNull(),
  title: text("title"),
  browserEngine: text("browser_engine", { enum: ["chromium"] }).notNull(),
  htmlKey: text("html_key").notNull(),
  screenshotKey: text("screenshot_key").notNull(),
  contentKey: text("content_key").notNull(),
  htmlSha256: text("html_sha256").notNull(),
  screenshotSha256: text("screenshot_sha256").notNull(),
  contentSha256: text("content_sha256").notNull(),
  htmlBytes: integer("html_bytes").notNull(),
  screenshotBytes: integer("screenshot_bytes").notNull(),
  contentBytes: integer("content_bytes").notNull(),
});

export const questionSet = sqliteTable("question_set", {
  id: text("id").primaryKey(),
  model: text("model").notNull(),
  version: integer("version").notNull(),
  active: integer("active", { mode: "boolean" }).default(false).notNull(),
  createdAt: integer("created_at").default(now).notNull(),
});

export const question = sqliteTable(
  "question",
  {
    questionSetId: text("question_set_id")
      .notNull()
      .references(() => questionSet.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    type: text("type", { enum: ["choice", "noul"] }).notNull(),
    instructions: text("instructions").notNull(),
    criteria: text("criteria_json", { mode: "json" }).$type<Record<string, string>>().notNull(),
    position: integer("position").notNull(),
  },
  (table) => [primaryKey({ columns: [table.questionSetId, table.key] })],
);

export const answer = sqliteTable(
  "answer",
  {
    versionId: text("version_id")
      .notNull()
      .references(() => pageVersion.id, { onDelete: "cascade" }),
    questionSetId: text("question_set_id").notNull(),
    questionKey: text("question_key").notNull(),
    type: text("type", { enum: ["choice", "noul"] }).notNull(),
    choice: text("choice"),
    noul: real("noul"),
    confidence: real("confidence"),
    probabilities: text("probabilities_json", { mode: "json" }).$type<Record<string, number>>(),
    createdAt: integer("created_at").default(now).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.versionId, table.questionSetId, table.questionKey] }),
    check(
      "answer_value_check",
      sql`(${table.type} = 'choice' and ${table.choice} is not null and ${table.noul} is null) or (${table.type} = 'noul' and ${table.choice} is null and ${table.noul} is not null)`,
    ),
    check(
      "answer_confidence_check",
      sql`${table.confidence} is null or (${table.confidence} >= 0 and ${table.confidence} <= 1)`,
    ),
    check(
      "answer_noul_check",
      sql`${table.noul} is null or (${table.noul} >= 0 and ${table.noul} <= 1)`,
    ),
  ],
);

/** Evaluation and exact model version belong to their immutable captured version. */
export const versionEvaluation = sqliteTable("version_evaluation", {
  runId: text("run_id")
    .primaryKey()
    .references(() => pageVersion.runId, { onDelete: "cascade" }),
  rubricId: text("rubric_id").notNull(),
  model: text("model").notNull(),
  evaluation: text("evaluation_json", { mode: "json" }).$type<PublicEvaluation>().notNull(),
});

export const versionComparison = sqliteTable(
  "version_comparison",
  {
    id: text("id").primaryKey(),
    beforeRunId: text("before_run_id")
      .notNull()
      .references(() => versionEvaluation.runId),
    afterRunId: text("after_run_id")
      .notNull()
      .references(() => versionEvaluation.runId),
    verifierVersion: text("verifier_version").notNull(),
    model: text("model"),
    status: text("status", { enum: ["reviewed", "uncertain"] }).notNull(),
    changes: text("changes_json", { mode: "json" }).$type<Comparison["changes"]>().notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
  },
  (table) => [index("version_comparison_after_idx").on(table.afterRunId)],
);
