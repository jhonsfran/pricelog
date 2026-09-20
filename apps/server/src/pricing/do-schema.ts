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
    stage: text("stage", {
      enum: ["queued", "capture", "persist", "evaluate", "publish", "complete"],
    }).notNull(),
    workflowInstanceId: text("workflow_instance_id").notNull().unique(),
    requestedByUserId: text("requested_by_user_id"),
    browserEngine: text("browser_engine", { enum: ["chromium"] }),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
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
    type: text("type", { enum: ["score"] }).notNull(),
    instructions: text("instructions").notNull(),
    criteria: text("criteria_json", { mode: "json" }).$type<string[]>().notNull(),
    minimum: integer("minimum").default(0).notNull(),
    maximum: integer("maximum").default(4).notNull(),
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
    score: real("score").notNull(),
    confidence: real("confidence").notNull(),
    legend: text("legend_json", { mode: "json" }).$type<Record<string, string>>().notNull(),
    probabilities: text("probabilities_json", { mode: "json" })
      .$type<Record<string, number>>()
      .notNull(),
    createdAt: integer("created_at").default(now).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.versionId, table.questionSetId, table.questionKey] }),
    check("answer_score_check", sql`${table.score} >= 0 and ${table.score} <= 4`),
    check("answer_confidence_check", sql`${table.confidence} >= 0 and ${table.confidence} <= 1`),
  ],
);
