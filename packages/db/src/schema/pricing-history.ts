import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import type {
  AnalysisEnvelope,
  ArtifactManifest,
  CaptureMetadata,
  HistoryRun,
  JevAnswer,
  PersistedRubric,
} from "../history-types";
import { page } from "./pages";

export const historyRun = sqliteTable(
  "history_run",
  {
    pageId: text("page_id")
      .notNull()
      .references(() => page.id),
    runId: text("run_id").notNull(),
    createdAt: integer("created_at").notNull(),
    status: text("status", { enum: ["succeeded", "failed"] }).notNull(),
    payload: text("payload_json", { mode: "json" }).$type<HistoryRun>().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.pageId, t.runId] }),
    index("history_run_order_idx").on(t.pageId, t.createdAt, t.runId),
    check("history_run_terminal", sql`${t.status} in ('succeeded', 'failed')`),
  ],
);

export const historyCapture = sqliteTable(
  "history_capture",
  {
    pageId: text("page_id").notNull(),
    runId: text("run_id").notNull(),
    capturedAt: integer("captured_at").notNull(),
    contentSha256: text("content_sha256").notNull(),
    manifest: text("manifest_json", { mode: "json" }).$type<ArtifactManifest>().notNull(),
    metadata: text("metadata_json", { mode: "json" }).$type<CaptureMetadata | null>(),
    selectedAnalysisId: text("selected_analysis_id"),
  },
  (t) => [
    primaryKey({ columns: [t.pageId, t.runId] }),
    foreignKey({
      columns: [t.pageId, t.runId],
      foreignColumns: [historyRun.pageId, historyRun.runId],
    }),
    index("history_capture_order_idx").on(t.pageId, t.capturedAt, t.runId),
    index("history_capture_week_idx").on(t.capturedAt, t.pageId, t.runId),
  ],
);

export const historyRubric = sqliteTable(
  "history_rubric",
  {
    pageId: text("page_id")
      .notNull()
      .references(() => page.id),
    id: text("id").notNull(),
    document: text("document_json", { mode: "json" }).$type<PersistedRubric>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.pageId, t.id] })],
);

export const historyAnalysis = sqliteTable(
  "history_analysis",
  {
    pageId: text("page_id").notNull(),
    id: text("id").notNull(),
    runId: text("run_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    rubricId: text("rubric_id").notNull(),
    model: text("model").notNull(),
    createdAt: integer("created_at").notNull(),
    envelope: text("envelope_json", { mode: "json" }).$type<AnalysisEnvelope>().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.pageId, t.id] }),
    foreignKey({
      columns: [t.pageId, t.runId],
      foreignColumns: [historyCapture.pageId, historyCapture.runId],
    }),
    foreignKey({
      columns: [t.pageId, t.rubricId],
      foreignColumns: [historyRubric.pageId, historyRubric.id],
    }),
    uniqueIndex("history_analysis_idempotency_idx").on(t.pageId, t.runId, t.idempotencyKey),
    index("history_analysis_capture_idx").on(t.pageId, t.runId, t.createdAt, t.id),
  ],
);

export const historyAnswers = sqliteTable(
  "history_answers",
  {
    pageId: text("page_id").notNull(),
    runId: text("run_id").notNull(),
    rubricId: text("rubric_id").notNull(),
    values: text("values_json", { mode: "json" }).$type<JevAnswer[]>().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.pageId, t.runId, t.rubricId] }),
    foreignKey({
      columns: [t.pageId, t.runId],
      foreignColumns: [historyCapture.pageId, historyCapture.runId],
    }),
    foreignKey({
      columns: [t.pageId, t.rubricId],
      foreignColumns: [historyRubric.pageId, historyRubric.id],
    }),
  ],
);

export const historyComparison = sqliteTable(
  "history_comparison",
  {
    pageId: text("page_id").notNull(),
    id: text("id").notNull(),
    beforeRunId: text("before_run_id").notNull(),
    afterRunId: text("after_run_id").notNull(),
    beforeAnalysisId: text("before_analysis_id").notNull(),
    afterAnalysisId: text("after_analysis_id").notNull(),
    verifierVersion: text("verifier_version").notNull(),
    payload: text("payload_json").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.pageId, t.id] }),
    foreignKey({
      columns: [t.pageId, t.beforeAnalysisId],
      foreignColumns: [historyAnalysis.pageId, historyAnalysis.id],
    }),
    foreignKey({
      columns: [t.pageId, t.afterAnalysisId],
      foreignColumns: [historyAnalysis.pageId, historyAnalysis.id],
    }),
    uniqueIndex("history_comparison_pair_idx").on(
      t.pageId,
      t.beforeAnalysisId,
      t.afterAnalysisId,
      t.verifierVersion,
    ),
    check("history_comparison_distinct_capture", sql`${t.beforeRunId} != ${t.afterRunId}`),
  ],
);

export const historyImport = sqliteTable("history_import", {
  pageId: text("page_id")
    .primaryKey()
    .references(() => page.id),
  sourceIdentity: text("source_identity").notNull(),
  checkpoint: text("checkpoint"),
  expectedCount: integer("expected_count").notNull(),
  importedCount: integer("imported_count").notNull(),
  ready: integer("ready", { mode: "boolean" }).notNull().default(false),
});
