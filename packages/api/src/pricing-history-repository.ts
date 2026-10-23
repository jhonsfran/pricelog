import { ORPCError } from "@orpc/server";
import type { Database } from "@pricelog/db";
import { artifactReference } from "@pricelog/db/history-types";
import type {
  AnalysisEnvelope,
  HistoryRun,
  PersistedRubric,
  TerminalArchive,
} from "@pricelog/db/history-types";
import {
  historyAnalysis,
  historyAnswers,
  historyCapture,
  historyComparison,
  historyImport,
  historyRubric,
  historyRun,
} from "@pricelog/db/schema/pricing-history";
import { page } from "@pricelog/db/schema/pages";
import { and, desc, eq, gte, lt, ne, or, sql } from "drizzle-orm";
import { planCountSql } from "@pricelog/db/pricing-snapshot-count";
import { pageProjectionWrites, ownerProjectionWrite } from "./history-projections";
import { descendingCursorCondition, type DescendingTimestampCursor } from "./pagination";
import {
  COMPARISON_VERSION,
  completedWeeks,
  type Comparison,
  type Observation,
  type WeeklyPageHistory,
} from "./pricing-history";
import type { PublicVersion, PublicVersionSummary } from "./page-versions";

export type StoredPublicVersion = Omit<PublicVersion, "previous" | "changes"> & {
  contentKey: string;
  previous: {
    runId: string;
    capturedAt: number;
    contentKey: string;
    model: string;
    snapshot: PublicVersion["snapshot"];
  } | null;
};

export class HistoryNotReadyError extends ORPCError<"SERVICE_UNAVAILABLE", undefined> {
  constructor(readonly pageId: string) {
    super("SERVICE_UNAVAILABLE", {
      message: `Pricing history import is not ready for page ${pageId}`,
    });
  }
}

export function createPricingHistoryRepository(db: Database) {
  const publicRows = () =>
    db
      .select({ capture: historyCapture, analysis: historyAnalysis })
      .from(historyCapture)
      .innerJoin(
        historyRun,
        and(
          eq(historyRun.pageId, historyCapture.pageId),
          eq(historyRun.runId, historyCapture.runId),
        ),
      )
      .innerJoin(
        historyAnalysis,
        and(
          eq(historyAnalysis.pageId, historyCapture.pageId),
          eq(historyAnalysis.id, historyCapture.selectedAnalysisId),
        ),
      );

  function rubricWrite(pageId: string, rubric: PersistedRubric) {
    return db
      .insert(historyRubric)
      .values({ pageId, id: rubric.id, document: rubric })
      .onConflictDoUpdate({
        target: [historyRubric.pageId, historyRubric.id],
        set: { document: rubric },
      });
  }

  function analysisWrite(pageId: string, envelope: AnalysisEnvelope) {
    if (!envelope.id || !envelope.idempotencyKey)
      throw new Error("Analysis identity and idempotency key are required");
    const row = {
      pageId,
      id: envelope.id,
      runId: envelope.runId,
      idempotencyKey: envelope.idempotencyKey,
      rubricId: envelope.rubricId,
      model: envelope.model,
      createdAt: envelope.createdAt,
      envelope,
    };
    return db
      .insert(historyAnalysis)
      .values(row)
      .onConflictDoUpdate({ target: [historyAnalysis.pageId, historyAnalysis.id], set: row });
  }

  async function requireReady(pageId: string) {
    const [state] = await db
      .select()
      .from(historyImport)
      .where(eq(historyImport.pageId, pageId))
      .limit(1);
    if (!state?.ready) throw new HistoryNotReadyError(pageId);
  }

  async function archive(input: TerminalArchive) {
    if (input.run.status !== "succeeded" && input.run.status !== "failed")
      throw new Error("Only terminal runs can be archived");
    if (input.analysis && (!input.capture || input.analysis.runId !== input.run.id))
      throw new Error("Analysis does not belong to the archived capture");
    if (
      input.source === "scan" &&
      input.run.status === "succeeded" &&
      (!input.capture || !input.analysis || !input.metadata)
    )
      throw new Error("Successful archive requires capture, analysis and metadata");
    const run = {
      pageId: input.pageId,
      runId: input.run.id,
      createdAt: input.run.createdAt,
      status: input.run.status,
      payload: input.run,
    };
    const writes = [
      db
        .insert(historyRun)
        .values(run)
        .onConflictDoUpdate({ target: [historyRun.pageId, historyRun.runId], set: run }),
    ];
    const capture = input.capture;
    const captureRow = capture
      ? {
          pageId: input.pageId,
          runId: input.run.id,
          capturedAt: capture.capturedAt,
          contentSha256: capture.contentSha256,
          manifest: capture,
          metadata: input.metadata,
        }
      : null;
    const analysis = input.analysis;
    const metadata = input.metadata;
    const [registry] = await db
      .select({ normalizedDomain: page.normalizedDomain })
      .from(page)
      .where(eq(page.id, input.pageId))
      .limit(1);
    if (!registry) throw new Error("Unknown page");
    const extra = [
      ...input.rubrics.map((rubric) => rubricWrite(input.pageId, rubric)),
      ...(captureRow
        ? [
            db
              .insert(historyCapture)
              .values(captureRow)
              .onConflictDoUpdate({
                target: [historyCapture.pageId, historyCapture.runId],
                set: captureRow,
              }),
          ]
        : []),
      ...input.answers.map((answer) => {
        const row = {
          pageId: input.pageId,
          runId: input.run.id,
          rubricId: answer.rubricId,
          values: answer.values,
        };
        return db
          .insert(historyAnswers)
          .values(row)
          .onConflictDoUpdate({
            target: [historyAnswers.pageId, historyAnswers.runId, historyAnswers.rubricId],
            set: row,
          });
      }),
      ...(analysis ? [analysisWrite(input.pageId, analysis)] : []),
      ...(analysis && input.run.status === "succeeded"
        ? [
            db
              .update(historyCapture)
              .set({ selectedAnalysisId: analysis.id })
              .where(
                and(
                  eq(historyCapture.pageId, input.pageId),
                  eq(historyCapture.runId, input.run.id),
                  sql`${historyCapture.selectedAnalysisId} is null`,
                ),
              ),
          ]
        : []),
      ...(analysis && capture && metadata && input.run.status === "succeeded"
        ? pageProjectionWrites(db, {
            ...analysis.evaluation,
            ...metadata,
            pageId: input.pageId,
            runId: input.run.id,
            analysisId: analysis.id,
            runCreatedAt: input.run.createdAt,
            normalizedDomain: registry.normalizedDomain,
            capturedAt: capture.capturedAt,
            rubricId: analysis.rubricId,
            model: analysis.model,
            nextScanAt: input.nextScanAt ?? 0,
          }).slice(0, input.source === "legacy" ? 2 : 3)
        : input.source === "legacy"
          ? []
          : [
              ownerProjectionWrite(db, {
                pageId: input.pageId,
                runId: input.run.id,
                runCreatedAt: input.run.createdAt,
                status: input.run.status,
                ...(input.nextScanAt === null ? {} : { nextScanAt: input.nextScanAt }),
              }),
            ]),
    ];
    await db.batch([writes[0]!, ...extra]);
  }

  async function getRun(pageId: string, runId: string): Promise<HistoryRun | null> {
    const [row] = await db
      .select({ payload: historyRun.payload })
      .from(historyRun)
      .where(and(eq(historyRun.pageId, pageId), eq(historyRun.runId, runId)))
      .limit(1);
    return row?.payload ?? null;
  }

  async function listRuns(pageId: string, limit = 50, cursor?: DescendingTimestampCursor) {
    const safeLimit = Math.max(1, Math.min(limit, 100));
    const rows = await db
      .select()
      .from(historyRun)
      .where(
        and(
          eq(historyRun.pageId, pageId),
          cursor
            ? descendingCursorCondition(historyRun.createdAt, historyRun.runId, cursor)
            : undefined,
        ),
      )
      .orderBy(desc(historyRun.createdAt), desc(historyRun.runId))
      .limit(safeLimit + 1);
    const items = rows.slice(0, safeLimit).map((row) => row.payload);
    const last = items.at(-1);
    return {
      items,
      nextCursor:
        rows.length > safeLimit && last ? { id: last.id, createdAt: last.createdAt } : null,
    };
  }

  async function published(pageId: string, runId: string) {
    const [row] = await publicRows()
      .where(
        and(
          eq(historyCapture.pageId, pageId),
          eq(historyCapture.runId, runId),
          eq(historyRun.status, "succeeded"),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async function getArtifact(
    pageId: string,
    runId: string,
    kind: "html" | "screenshot" | "content",
    isPublic = false,
  ) {
    const row = isPublic
      ? (await published(pageId, runId))?.capture
      : (
          await db
            .select()
            .from(historyCapture)
            .where(and(eq(historyCapture.pageId, pageId), eq(historyCapture.runId, runId)))
            .limit(1)
        )[0];
    if (!row) return null;
    return artifactReference(row.manifest, kind);
  }

  async function listPublicVersions(pageId: string, limit = 100): Promise<PublicVersionSummary[]> {
    const rows = await db
      .select({
        runId: historyCapture.runId,
        capturedAt: historyCapture.capturedAt,
        hash: historyCapture.contentSha256,
        plans: planCountSql(
          sql`json_extract(${historyAnalysis.envelope}, '$.evaluation.snapshot')`,
        ),
      })
      .from(historyCapture)
      .innerJoin(
        historyRun,
        and(
          eq(historyRun.pageId, historyCapture.pageId),
          eq(historyRun.runId, historyCapture.runId),
        ),
      )
      .innerJoin(
        historyAnalysis,
        and(
          eq(historyAnalysis.pageId, historyCapture.pageId),
          eq(historyAnalysis.id, historyCapture.selectedAnalysisId),
        ),
      )
      .where(and(eq(historyCapture.pageId, pageId), eq(historyRun.status, "succeeded")))
      .orderBy(desc(historyCapture.capturedAt), desc(historyCapture.runId))
      .limit(Math.min(100, Math.max(1, limit)) + 1);
    return rows.slice(0, limit).map((row, i) => ({
      runId: row.runId,
      capturedAt: row.capturedAt,
      plans: row.plans ?? 0,
      textChanged: rows[i + 1] ? rows[i + 1]!.hash !== row.hash : null,
    }));
  }

  async function getPublicVersion(
    pageId: string,
    runId: string,
  ): Promise<StoredPublicVersion | null> {
    const row = await published(pageId, runId);
    if (!row) return null;
    const { capture, analysis } = row;
    const [before] = await publicRows()
      .where(
        and(
          eq(historyCapture.pageId, pageId),
          eq(historyRun.status, "succeeded"),
          or(
            lt(historyCapture.capturedAt, capture.capturedAt),
            and(eq(historyCapture.capturedAt, capture.capturedAt), lt(historyCapture.runId, runId)),
          ),
        ),
      )
      .orderBy(desc(historyCapture.capturedAt), desc(historyCapture.runId))
      .limit(1);
    const evaluation = analysis.envelope.evaluation;
    return {
      runId,
      capturedAt: capture.capturedAt,
      title: capture.manifest.title,
      finalUrl: capture.manifest.finalUrl,
      rubricId: analysis.rubricId,
      model: analysis.model,
      choices: evaluation.choices,
      signals: evaluation.signals,
      tags: evaluation.tags,
      snapshot: evaluation.snapshot ?? null,
      numericPrices: evaluation.numericPrices
        ? { ...evaluation.numericPrices, audit: undefined }
        : null,
      contentKey: capture.manifest.contentKey,
      previous: before
        ? {
            runId: before.capture.runId,
            capturedAt: before.capture.capturedAt,
            contentKey: before.capture.manifest.contentKey,
            model: before.analysis.model,
            snapshot: before.analysis.envelope.evaluation.snapshot ?? null,
          }
        : null,
    };
  }

  async function getAnalysis(pageId: string, analysisId: string) {
    const [row] = await db
      .select()
      .from(historyAnalysis)
      .where(and(eq(historyAnalysis.pageId, pageId), eq(historyAnalysis.id, analysisId)))
      .limit(1);
    return row?.envelope ?? null;
  }

  async function appendAnalysis(
    pageId: string,
    envelope: AnalysisEnvelope,
    rubric: PersistedRubric,
  ) {
    if (envelope.rubricId !== rubric.id)
      throw new Error("Analysis rubric does not match its document");
    const run = await getRun(pageId, envelope.runId);
    const [capture] = await db
      .select({ runId: historyCapture.runId })
      .from(historyCapture)
      .where(and(eq(historyCapture.pageId, pageId), eq(historyCapture.runId, envelope.runId)))
      .limit(1);
    if (run?.status !== "succeeded" || !capture)
      throw new Error("Analysis requires a succeeded capture");
    await db.batch([rubricWrite(pageId, rubric), analysisWrite(pageId, envelope)]);
  }

  async function selectAnalysis(
    pageId: string,
    runId: string,
    analysisId: string,
    expectedAnalysisId: string | null,
  ) {
    const analysis = await getAnalysis(pageId, analysisId);
    const [capture] = await db
      .select()
      .from(historyCapture)
      .where(and(eq(historyCapture.pageId, pageId), eq(historyCapture.runId, runId)))
      .limit(1);
    const run = await getRun(pageId, runId);
    const [registry] = await db.select().from(page).where(eq(page.id, pageId)).limit(1);
    if (
      !analysis ||
      analysis.runId !== runId ||
      !capture ||
      run?.status !== "succeeded" ||
      !registry
    )
      throw new Error("Analysis does not belong to a succeeded capture");
    const metadata = capture.metadata ?? {
      displayName: registry.displayName ?? registry.normalizedDomain,
      description: registry.description,
    };
    const projection = pageProjectionWrites(
      db,
      {
        ...analysis.evaluation,
        ...metadata,
        pageId,
        runId,
        analysisId,
        rubricId: analysis.rubricId,
        model: analysis.model,
        runCreatedAt: 0,
        capturedAt: capture.capturedAt,
        normalizedDomain: registry.normalizedDomain,
        nextScanAt: 0,
      },
      capture.metadata !== null,
    );
    const [selection] = await db.batch([
      db
        .update(historyCapture)
        .set({ selectedAnalysisId: analysisId })
        .where(
          and(
            eq(historyCapture.pageId, pageId),
            eq(historyCapture.runId, runId),
            or(
              expectedAnalysisId === null
                ? sql`${historyCapture.selectedAnalysisId} is null`
                : eq(historyCapture.selectedAnalysisId, expectedAnalysisId),
              eq(historyCapture.selectedAnalysisId, analysisId),
            ),
          ),
        )
        .returning({ id: historyCapture.selectedAnalysisId }),
      projection[0],
      projection[1],
    ]);
    if (!selection.length)
      throw new Error("Selected analysis changed; retry with the current analysis ID");
  }

  async function findReusableEvaluation(
    pageId: string,
    runId: string,
    hash: string,
    rubricId: string,
    pipeline: string,
  ) {
    const [row] = await publicRows()
      .where(
        and(
          eq(historyCapture.pageId, pageId),
          eq(historyRun.status, "succeeded"),
          ne(historyCapture.runId, runId),
        ),
      )
      .orderBy(desc(historyRun.createdAt), desc(historyRun.runId))
      .limit(1);
    const envelope = row?.analysis.envelope;
    const snapshot = envelope?.evaluation.snapshot;
    if (
      !row ||
      !envelope ||
      row.capture.contentSha256 !== hash ||
      envelope.rubricId !== rubricId ||
      envelope.evaluation.pipeline !== pipeline ||
      snapshot?.status !== "collected"
    )
      return null;
    return {
      runId: row.capture.runId,
      rubricId,
      model: envelope.model,
      evaluation: { ...envelope.evaluation, snapshot, review: envelope.evaluation.review ?? [] },
      answers: envelope.answers,
    };
  }

  async function persistComparison(
    pageId: string,
    comparison: Comparison & { beforeAnalysisId: string; afterAnalysisId: string },
  ) {
    for (const runId of [comparison.beforeRunId, comparison.afterRunId]) {
      if (!(await published(pageId, runId))) throw new Error(`Run ${runId} is not published`);
    }
    const row = {
      pageId,
      id: `${comparison.verifierVersion}:${comparison.beforeAnalysisId}:${comparison.afterAnalysisId}`,
      beforeRunId: comparison.beforeRunId,
      afterRunId: comparison.afterRunId,
      beforeAnalysisId: comparison.beforeAnalysisId,
      afterAnalysisId: comparison.afterAnalysisId,
      verifierVersion: comparison.verifierVersion,
      payload: JSON.stringify({
        ...comparison,
        id: `${comparison.verifierVersion}:${comparison.beforeAnalysisId}:${comparison.afterAnalysisId}`,
      }),
    };
    await db
      .insert(historyComparison)
      .values(row)
      .onConflictDoUpdate({ target: [historyComparison.pageId, historyComparison.id], set: row });
  }

  async function requireAllReady() {
    const [missing] = await db
      .select({ pageId: page.id })
      .from(page)
      .leftJoin(historyImport, eq(historyImport.pageId, page.id))
      .where(
        and(
          eq(page.state, "active"),
          sql`(${historyImport.ready} is null or ${historyImport.ready} = 0)`,
        ),
      )
      .limit(1);
    if (missing) throw new HistoryNotReadyError(missing.pageId);
  }

  async function weeklyHistory(
    pageId: string | null,
    now = new Date(),
  ): Promise<{ observations: Observation[]; comparisons: Comparison[] }> {
    const periods = completedWeeks(now);
    const observations: Observation[] = [];
    for (const [start, end] of [
      [periods.previousPeriodStart, periods.periodStart],
      [periods.periodStart, periods.periodEnd],
    ]) {
      const rows = await db
        .select({
          capture: historyCapture,
          analysis: historyAnalysis,
          slug: page.slug,
          displayName: page.displayName,
          domain: page.normalizedDomain,
        })
        .from(historyCapture)
        .innerJoin(
          historyRun,
          and(
            eq(historyRun.pageId, historyCapture.pageId),
            eq(historyRun.runId, historyCapture.runId),
          ),
        )
        .innerJoin(
          historyAnalysis,
          and(
            eq(historyAnalysis.pageId, historyCapture.pageId),
            eq(historyAnalysis.id, historyCapture.selectedAnalysisId),
          ),
        )
        .innerJoin(page, eq(page.id, historyCapture.pageId))
        .where(
          and(
            pageId ? eq(historyCapture.pageId, pageId) : undefined,
            eq(page.state, "active"),
            eq(historyRun.status, "succeeded"),
            gte(historyCapture.capturedAt, start!.getTime()),
            lt(historyCapture.capturedAt, end!.getTime()),
            sql`not exists (select 1 from history_capture newer join history_run nr on nr.page_id = newer.page_id and nr.run_id = newer.run_id where newer.page_id = ${historyCapture.pageId} and nr.status = 'succeeded' and newer.selected_analysis_id is not null and newer.captured_at >= ${start!.getTime()} and newer.captured_at < ${end!.getTime()} and (newer.captured_at > ${historyCapture.capturedAt} or (newer.captured_at = ${historyCapture.capturedAt} and newer.run_id > ${historyCapture.runId})))`,
          ),
        );
      for (const row of rows)
        observations.push({
          pageId: row.capture.pageId,
          runId: row.capture.runId,
          analysisId: row.analysis.id,
          rubricId: row.analysis.rubricId,
          model: row.analysis.model,
          capturedAt: new Date(row.capture.capturedAt),
          contentKey: row.capture.manifest.contentKey,
          contentSha256: row.capture.contentSha256,
          choices: row.analysis.envelope.evaluation.choices,
          signals: row.analysis.envelope.evaluation.signals,
          snapshot: row.analysis.envelope.evaluation.snapshot ?? null,
          pipeline: row.analysis.envelope.evaluation.pipeline,
          slug: row.slug,
          name: row.displayName ?? row.domain,
        });
    }
    const rows = await db
      .select({ payload: historyComparison.payload })
      .from(historyComparison)
      .where(
        and(
          pageId ? eq(historyComparison.pageId, pageId) : undefined,
          eq(historyComparison.verifierVersion, COMPARISON_VERSION),
          sql`exists (select 1 from history_capture b join history_capture a on a.page_id = b.page_id where b.page_id = ${historyComparison.pageId} and b.run_id = ${historyComparison.beforeRunId} and a.run_id = ${historyComparison.afterRunId} and b.selected_analysis_id = ${historyComparison.beforeAnalysisId} and a.selected_analysis_id = ${historyComparison.afterAnalysisId}
      and b.captured_at >= ${periods.previousPeriodStart.getTime()} and b.captured_at < ${periods.periodStart.getTime()}
      and a.captured_at >= ${periods.periodStart.getTime()} and a.captured_at < ${periods.periodEnd.getTime()}
      and not exists (select 1 from history_capture bn join history_run br on br.page_id=bn.page_id and br.run_id=bn.run_id where bn.page_id=b.page_id and br.status='succeeded' and bn.selected_analysis_id is not null and bn.captured_at >= ${periods.previousPeriodStart.getTime()} and bn.captured_at < ${periods.periodStart.getTime()} and (bn.captured_at>b.captured_at or (bn.captured_at=b.captured_at and bn.run_id>b.run_id)))
      and not exists (select 1 from history_capture an join history_run ar on ar.page_id=an.page_id and ar.run_id=an.run_id where an.page_id=a.page_id and ar.status='succeeded' and an.selected_analysis_id is not null and an.captured_at >= ${periods.periodStart.getTime()} and an.captured_at < ${periods.periodEnd.getTime()} and (an.captured_at>a.captured_at or (an.captured_at=a.captured_at and an.run_id>a.run_id)))
      )`,
        ),
      );
    const comparisons: Comparison[] = rows.map((row) => {
      const value = JSON.parse(row.payload);
      return { ...value, createdAt: new Date(value.createdAt) };
    });
    return { observations, comparisons };
  }

  async function writeImport(
    pageId: string,
    state: {
      sourceIdentity: string;
      checkpoint: string | null;
      expectedCount: number;
      importedCount: number;
      ready: boolean;
    },
  ) {
    const [existing] = await db
      .select()
      .from(historyImport)
      .where(eq(historyImport.pageId, pageId))
      .limit(1);
    if (existing && existing.sourceIdentity !== state.sourceIdentity)
      throw new Error("History import source identity changed");
    await db
      .insert(historyImport)
      .values({ pageId, ...state })
      .onConflictDoUpdate({
        target: historyImport.pageId,
        set: state,
        setWhere: sql`${historyImport.sourceIdentity} = ${state.sourceIdentity} and ${historyImport.importedCount} <= ${state.importedCount}`,
      });
  }

  async function importRubric(pageId: string, rubric: PersistedRubric) {
    await rubricWrite(pageId, rubric);
  }

  return {
    archive,
    requireReady,
    requireAllReady,
    writeImport,
    importRubric,
    getRun,
    listRuns,
    getArtifact,
    listPublicVersions,
    getPublicVersion,
    getAnalysis,
    appendAnalysis,
    selectAnalysis,
    findReusableEvaluation,
    persistComparison,
    async getPublicPage(pageId: string) {
      const versions = await listPublicVersions(pageId);
      return {
        versions,
        version: versions[0] ? await getPublicVersion(pageId, versions[0].runId) : null,
      };
    },
    weeklyHistory,
    async getWeeklyHistory(pageId: string, now: number): Promise<WeeklyPageHistory> {
      return weeklyHistory(pageId, new Date(now));
    },
  };
}
