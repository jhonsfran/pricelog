import type {
  AnalysisEnvelope,
  TerminalArchive,
  PersistedRubric,
} from "@pricelog/db/history-types";
import { initialAnalysisId } from "@pricelog/db/history-types";
import type { Comparison } from "@pricelog/api/pricing-history";
import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { asc, eq, sql } from "drizzle-orm";
import {
  answer,
  pageVersion,
  question,
  questionSet,
  scanRun,
  versionComparison,
  versionEvaluation,
} from "./do-schema";
import type { PageRunDto } from "./types";
import type { PagePublication } from "./publication";
import { nextAlarmAt } from "./page-store-logic";

export type LegacyRecord =
  | { key: string; kind: "rubric"; rubric: PersistedRubric }
  | { key: string; kind: "run"; archive: TerminalArchive }
  | {
      key: string;
      kind: "comparison";
      comparison: Comparison & { beforeAnalysisId: string; afterAnalysisId: string };
    };

export type ImportProgress = {
  sourceIdentity: string;
  checkpoint: string | null;
  expectedCount: number;
  importedCount: number;
  ready: boolean;
};
export const HISTORY_IMPORT_KEY = "history-import-v1";
export const TERMINAL_ARCHIVE_PREFIX = "terminal-archive:";
export const PUBLICATION_PREFIX = "publication:";
export const WORKSPACE_RUN_PREFIX = "workspace-run:";
export const IMPORT_RECORD_LIMIT = 10;
export const IMPORT_BYTE_LIMIT = 1024 * 1024;

export function legacySourceCount(db: DrizzleSqliteDODatabase) {
  const row = db.get<{ count: number }>(
    sql`select (select count(*) from question_set) + (select count(*) from scan_run where status in ('succeeded','failed')) + (select count(*) from version_comparison) as count`,
  );
  return row?.count ?? 0;
}

export function storedRubric(db: DrizzleSqliteDODatabase, rubricId: string): PersistedRubric {
  const set = db.select().from(questionSet).where(eq(questionSet.id, rubricId)).get();
  if (!set) throw new Error(`Missing legacy rubric ${rubricId}`);
  const questions = db
    .select()
    .from(question)
    .where(eq(question.questionSetId, set.id))
    .orderBy(asc(question.position), asc(question.key))
    .all();
  return {
    id: set.id,
    model: set.model,
    version: set.version,
    questions: questions.map((row) => {
      const base = {
        key: row.key,
        instructions: row.instructions,
        position: row.position,
        minimum: null,
        maximum: null,
      };
      if (row.type === "choice") return { ...base, type: "choice", criteria: row.criteria };
      if (typeof row.criteria.true !== "string" || typeof row.criteria.false !== "string")
        throw new Error(`Invalid legacy rubric question ${row.key}`);
      return {
        ...base,
        type: "noul",
        criteria: { true: row.criteria.true, false: row.criteria.false },
      };
    }),
  };
}

export function archiveFromWorkspace(
  db: DrizzleSqliteDODatabase,
  pageId: string,
  run: PageRunDto & { status: "succeeded" | "failed" },
  pending: Omit<PagePublication, "nextScanAt" | "runCreatedAt"> | undefined,
  source: "legacy" | "scan",
): TerminalArchive {
  const version = db.select().from(pageVersion).where(eq(pageVersion.runId, run.id)).get();
  const evaluated = db
    .select()
    .from(versionEvaluation)
    .where(eq(versionEvaluation.runId, run.id))
    .get();
  const values = version
    ? db
        .select()
        .from(answer)
        .where(eq(answer.versionId, version.id))
        .orderBy(asc(answer.questionSetId), asc(answer.questionKey))
        .all()
    : [];
  const answers = new Map<string, AnalysisEnvelope["answers"]>();
  for (const row of values) {
    const group = answers.get(row.questionSetId) ?? [];
    if (row.type === "choice") {
      if (row.choice === null || row.confidence === null)
        throw new Error("Invalid legacy choice answer");
      group.push({
        key: row.questionKey,
        type: "choice",
        choice: row.choice,
        confidence: row.confidence,
        probabilities: row.probabilities ?? {},
      });
    } else {
      if (row.noul === null) throw new Error("Invalid legacy noul answer");
      group.push({ key: row.questionKey, type: "noul", noul: row.noul });
    }
    answers.set(row.questionSetId, group);
  }
  const rubricIds = new Set([...answers.keys(), ...(evaluated ? [evaluated.rubricId] : [])]);
  return {
    source,
    pageId,
    run,
    capture: version
      ? {
          capturedAt: version.capturedAt,
          httpStatus: version.httpStatus,
          finalUrl: version.finalUrl,
          title: version.title,
          htmlKey: version.htmlKey,
          screenshotKey: version.screenshotKey,
          contentKey: version.contentKey,
          htmlSha256: version.htmlSha256,
          screenshotSha256: version.screenshotSha256,
          contentSha256: version.contentSha256,
          htmlBytes: version.htmlBytes,
          screenshotBytes: version.screenshotBytes,
          contentBytes: version.contentBytes,
        }
      : null,
    analysis: evaluated
      ? {
          id: initialAnalysisId(pageId, run.id),
          idempotencyKey: "initial",
          runId: run.id,
          rubricId: evaluated.rubricId,
          model: evaluated.model,
          createdAt: run.completedAt ?? run.createdAt,
          evaluation: evaluated.evaluation,
          answers: answers.get(evaluated.rubricId) ?? [],
        }
      : null,
    rubrics: [...rubricIds].map((rubricId) => storedRubric(db, rubricId)),
    answers: [...answers].map(([rubricId, values]) => ({ rubricId, values })),
    metadata: pending
      ? { displayName: pending.displayName, description: pending.description }
      : null,
    nextScanAt: run.completedAt === null ? null : nextAlarmAt(run.completedAt),
  };
}

export function exportLegacyBatch(
  db: DrizzleSqliteDODatabase,
  pageId: string,
  progress: ImportProgress,
  readPublication: (runId: string) => Parameters<typeof archiveFromWorkspace>[3],
  recordLimit = IMPORT_RECORD_LIMIT,
  byteLimit = IMPORT_BYTE_LIMIT,
) {
  const limit = Math.max(1, Math.min(recordLimit, IMPORT_RECORD_LIMIT));
  const maxBytes = Math.max(1, Math.min(byteLimit, IMPORT_BYTE_LIMIT));
  const keys = db.all<{
    key: string;
    kind: "rubric" | "run" | "comparison";
    id: string;
  }>(sql`select * from (
    select '0:' || id as key, 'rubric' as kind, id from question_set
    union all select '1:' || id, 'run', id from scan_run where status in ('succeeded','failed')
    union all select '2:' || id, 'comparison', id from version_comparison
  ) where key > ${progress.checkpoint ?? ""} order by key limit ${limit}`);
  const records: LegacyRecord[] = [];
  let bytes = 0;
  for (const key of keys) {
    let record: LegacyRecord;
    if (key.kind === "rubric")
      record = { ...key, kind: "rubric", rubric: storedRubric(db, key.id) };
    else if (key.kind === "run") {
      const run = db.select().from(scanRun).where(eq(scanRun.id, key.id)).get();
      if (!run || (run.status !== "succeeded" && run.status !== "failed"))
        throw new Error("Legacy source changed during import");
      record = {
        key: key.key,
        kind: "run",
        archive: archiveFromWorkspace(
          db,
          pageId,
          { ...run, status: run.status },
          readPublication(run.id),
          "legacy",
        ),
      };
    } else {
      const row = db.select().from(versionComparison).where(eq(versionComparison.id, key.id)).get();
      if (!row) throw new Error("Legacy comparison is missing");
      record = {
        key: key.key,
        kind: "comparison",
        comparison: {
          ...row,
          beforeAnalysisId: initialAnalysisId(pageId, row.beforeRunId),
          afterAnalysisId: initialAnalysisId(pageId, row.afterRunId),
        },
      };
    }
    const size = new TextEncoder().encode(JSON.stringify(record)).byteLength;
    if (size > maxBytes && records.length === 0)
      throw new Error(`Legacy record ${key.key} exceeds the import byte limit`);
    if (bytes + size > maxBytes) break;
    records.push(record);
    bytes += size;
  }
  return { records, bytes };
}
