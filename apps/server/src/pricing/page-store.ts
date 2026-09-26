import { createDb } from "@my-better-t-app/db";
import type { ScanPipelineStage } from "@my-better-t-app/db/scan-stage";
import { publishPageProjection, type PagePublication } from "./publication";
import {
  COMPARISON_VERSION,
  completedWeeks,
  type Comparison,
  type StoredObservation,
  type WeeklyPageHistory,
} from "@my-better-t-app/api/pricing-history";
import type { PublicEvaluation } from "./evaluation";
import type { PublishedSnapshot, SnapshotReview } from "@my-better-t-app/db/pricing-snapshot";
import { DurableObject } from "cloudflare:workers";
import type { DescendingTimestampCursor } from "@my-better-t-app/api/pagination";
import { descendingCursorCondition } from "@my-better-t-app/api/pagination";
import { and, desc, eq, gte, lt, ne } from "drizzle-orm";
import { drizzle, type DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";

import migrations from "./drizzle/migrations.js";
import {
  answer,
  versionEvaluation,
  versionComparison,
  pageConfig,
  pageVersion,
  question,
  questionSet,
  scanRun,
  schedulerState,
} from "./do-schema";
import { PRICING_INTELLIGENCE_RUBRIC, assertCurrentRubricFingerprint } from "./rubric";
import type {
  ArtifactKind,
  ArtifactManifest,
  ArtifactReference,
  JevAnswer,
  PageRunDto,
  PersistedRubric,
  RunStage,
  RunEvent,
  RunTrigger,
  ScanWorkflowParams,
} from "./types";
import { artifactReference, nextAlarmAt, resolveRunCompletion } from "./page-store-logic";

export interface PageStoreEnv {
  SCAN_WORKFLOW: Workflow<ScanWorkflowParams>;
  DB: D1Database;
}

export type InitializePageInput = {
  pageId: string;
  normalizedDomain: string;
  canonicalUrl: string;
  requestedByUserId: string;
};

export type RunPage = {
  items: PageRunDto[];
  nextCursor: DescendingTimestampCursor | null;
};

type StoreDb = DrizzleSqliteDODatabase;
type PendingPublication = Omit<PagePublication, "nextScanAt" | "runCreatedAt">;
const PUBLICATION_PREFIX = "publication:";
const PUBLICATION_RETRY_MS = 60_000;

export class PageStore extends DurableObject<PageStoreEnv> {
  private readonly db: StoreDb;

  constructor(ctx: DurableObjectState, env: PageStoreEnv) {
    super(ctx, env);
    this.db = drizzle(ctx.storage);
    ctx.blockConcurrencyWhile(async () => {
      migrate(this.db, migrations);
      await this.seedRubric();
    });
  }

  async initializeAndStart(input: InitializePageInput): Promise<PageRunDto> {
    const now = Date.now();
    await this.db
      .insert(pageConfig)
      .values({
        id: 1,
        pageId: input.pageId,
        normalizedDomain: input.normalizedDomain,
        canonicalUrl: input.canonicalUrl,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing();
    await this.db
      .insert(schedulerState)
      .values({ id: 1, activeRunId: null, nextScanAt: null, updatedAt: now })
      .onConflictDoNothing();

    const [config] = await this.db.select().from(pageConfig).where(eq(pageConfig.id, 1)).limit(1);
    if (
      !config ||
      config.pageId !== input.pageId ||
      config.normalizedDomain !== input.normalizedDomain ||
      config.canonicalUrl !== input.canonicalUrl
    ) {
      throw new Error("PageStore is already initialized for a different page");
    }

    const [existingRun] = await this.db
      .select()
      .from(scanRun)
      .orderBy(desc(scanRun.createdAt), desc(scanRun.id))
      .limit(1);
    return existingRun ? toRunDto(existingRun) : this.startRun("initial", input.requestedByUserId);
  }

  triggerManual(requestedByUserId: string): Promise<PageRunDto> {
    return this.startRun("manual", requestedByUserId);
  }

  async listRuns(limit = 50, cursor?: DescendingTimestampCursor): Promise<RunPage> {
    const safeLimit = Math.max(1, Math.min(limit, 100));
    const rows = await this.db
      .select()
      .from(scanRun)
      .where(
        cursor === undefined
          ? undefined
          : descendingCursorCondition(scanRun.createdAt, scanRun.id, cursor),
      )
      .orderBy(desc(scanRun.createdAt), desc(scanRun.id))
      .limit(safeLimit + 1);
    const hasMore = rows.length > safeLimit;
    const items = rows.slice(0, safeLimit).map(toRunDto);
    return {
      items,
      nextCursor: hasMore
        ? (() => {
            const last = items.at(-1);
            return last ? { createdAt: last.createdAt, id: last.id } : null;
          })()
        : null,
    };
  }

  async getRun(runId: string): Promise<PageRunDto | null> {
    const [row] = await this.db.select().from(scanRun).where(eq(scanRun.id, runId)).limit(1);
    return row ? toRunDto(row) : null;
  }

  async getArtifact(runId: string, kind: ArtifactKind): Promise<ArtifactReference | null> {
    const [version] = await this.db
      .select()
      .from(pageVersion)
      .where(eq(pageVersion.runId, runId))
      .limit(1);
    return version ? artifactReference(version, kind) : null;
  }

  async markRunning(runId: string, stage: RunStage = "capture"): Promise<void> {
    const now = Date.now();
    this.db.transaction((tx) => {
      const run = tx.select().from(scanRun).where(eq(scanRun.id, runId)).get();
      if (run?.status !== "queued") return;
      tx.update(scanRun)
        .set({
          status: "running",
          stage,
          startedAt: now,
          browserEngine: "chromium",
          events: [...run.events, { stage, at: now, kind: "entered" }],
        })
        .where(eq(scanRun.id, runId))
        .run();
    });
  }

  async setStage(runId: string, stage: ScanPipelineStage): Promise<void> {
    this.db.transaction((tx) => {
      const run = tx.select().from(scanRun).where(eq(scanRun.id, runId)).get();
      if (!run || !["queued", "running"].includes(run.status) || run.stage === stage) return;
      tx.update(scanRun)
        .set({ stage, events: [...run.events, { stage, at: Date.now(), kind: "entered" }] })
        .where(eq(scanRun.id, runId))
        .run();
    });
  }

  async recordEvent(runId: string, event: Omit<RunEvent, "at">): Promise<void> {
    this.db.transaction((tx) => {
      const run = tx.select().from(scanRun).where(eq(scanRun.id, runId)).get();
      if (!run || run.status === "failed") return;
      tx.update(scanRun)
        .set({ events: [...run.events, { ...event, at: Date.now() }] })
        .where(eq(scanRun.id, runId))
        .run();
    });
  }

  async persistVersion(runId: string, manifest: ArtifactManifest): Promise<string> {
    this.db.transaction((tx) => {
      const run = tx.select().from(scanRun).where(eq(scanRun.id, runId)).get();
      if (!run || run.status === "failed")
        throw new Error(`Cannot persist version for run ${runId}`);
      if (run.status === "succeeded") return;
      tx.insert(pageVersion)
        .values({ id: runId, runId, browserEngine: "chromium", ...manifest })
        .onConflictDoUpdate({
          target: pageVersion.runId,
          set: { browserEngine: "chromium", ...manifest },
        })
        .run();
    });
    return runId;
  }

  async getActiveRubric(): Promise<PersistedRubric> {
    const [set] = await this.db
      .select()
      .from(questionSet)
      .where(eq(questionSet.active, true))
      .limit(1);
    if (!set) throw new Error("No active pricing rubric");
    const questions = await this.db
      .select()
      .from(question)
      .where(eq(question.questionSetId, set.id))
      .orderBy(question.position);
    return {
      id: set.id,
      model: set.model,
      version: set.version,
      questions: questions.map(toPersistedQuestion),
    };
  }

  async persistAnswers(runId: string, rubricId: string, values: JevAnswer[]): Promise<void> {
    this.db.transaction((tx) => {
      const run = tx.select().from(scanRun).where(eq(scanRun.id, runId)).get();
      if (!run || run.status === "failed")
        throw new Error(`Cannot persist answers for run ${runId}`);
      if (run.status === "succeeded") return;
      const version = tx
        .select({ id: pageVersion.id })
        .from(pageVersion)
        .where(eq(pageVersion.runId, runId))
        .get();
      if (!version) throw new Error(`No page version for run ${runId}`);
      for (const value of values) {
        const stored = toStoredAnswer(value);
        tx.insert(answer)
          .values({
            versionId: version.id,
            questionSetId: rubricId,
            questionKey: value.key,
            ...stored,
          })
          .onConflictDoUpdate({
            target: [answer.versionId, answer.questionSetId, answer.questionKey],
            set: stored,
          })
          .run();
      }
    });
  }

  async persistEvaluation(
    runId: string,
    input: PublicEvaluation & { rubricId: string; model: string },
  ): Promise<void> {
    this.db.transaction((tx) => {
      const run = tx.select().from(scanRun).where(eq(scanRun.id, runId)).get();
      if (!run || run.status === "failed") throw new Error(`Cannot evaluate run ${runId}`);
      if (run.status === "succeeded") return;
      const { rubricId, model, ...evaluation } = input;
      tx.insert(versionEvaluation)
        .values({ runId, rubricId, model, evaluation })
        .onConflictDoUpdate({
          target: versionEvaluation.runId,
          set: { rubricId, model, evaluation },
        })
        .run();
    });
  }

  /** The latest succeeded evaluation, when this capture has the same content and rubric. */
  async findReusableEvaluation(
    runId: string,
    contentSha256: string,
    rubricId: string,
  ): Promise<ReusableEvaluation | null> {
    const previous = this.db
      .select({ version: pageVersion, stored: versionEvaluation })
      .from(scanRun)
      .innerJoin(pageVersion, eq(pageVersion.runId, scanRun.id))
      .innerJoin(versionEvaluation, eq(versionEvaluation.runId, scanRun.id))
      .where(and(eq(scanRun.status, "succeeded"), ne(scanRun.id, runId)))
      .orderBy(desc(scanRun.createdAt))
      .limit(1)
      .get();
    const snapshot = previous?.stored.evaluation.snapshot;
    if (
      !previous ||
      previous.version.contentSha256 !== contentSha256 ||
      previous.stored.rubricId !== rubricId ||
      snapshot?.status !== "collected"
    )
      return null;
    const rows = this.db
      .select()
      .from(answer)
      .where(and(eq(answer.versionId, previous.version.id), eq(answer.questionSetId, rubricId)))
      .all();
    return {
      runId: previous.version.runId,
      rubricId,
      model: previous.stored.model,
      evaluation: {
        ...previous.stored.evaluation,
        snapshot,
        review: previous.stored.evaluation.review ?? [],
      },
      answers: rows.map(fromStoredAnswer),
    };
  }

  async getPublicSource(pageId: string, runId: string): Promise<ArtifactReference | null> {
    const config = this.db.select().from(pageConfig).where(eq(pageConfig.id, 1)).get();
    if (config?.pageId !== pageId) return null;
    const row = this.db
      .select({ version: pageVersion })
      .from(pageVersion)
      .innerJoin(scanRun, eq(scanRun.id, pageVersion.runId))
      .innerJoin(versionEvaluation, eq(versionEvaluation.runId, scanRun.id))
      .where(and(eq(scanRun.id, runId), eq(scanRun.status, "succeeded")))
      .get();
    return row ? artifactReference(row.version, "content") : null;
  }

  async getWeeklyHistory(pageId: string, now: number): Promise<WeeklyPageHistory> {
    const config = this.db.select().from(pageConfig).where(eq(pageConfig.id, 1)).get();
    if (config?.pageId !== pageId) throw new Error("PageStore does not own this page");
    const { previousPeriodStart, periodStart, periodEnd } = completedWeeks(new Date(now));
    const observations: StoredObservation[] = [];
    // Each period needs only its latest successful capture. Query both independently;
    // a page with many manual scans must not hide the preceding week's version.
    for (const [start, end] of [
      [previousPeriodStart, periodStart],
      [periodStart, periodEnd],
    ] as const) {
      const row = this.db
        .select({ version: pageVersion, evaluated: versionEvaluation })
        .from(pageVersion)
        .innerJoin(scanRun, eq(scanRun.id, pageVersion.runId))
        .innerJoin(versionEvaluation, eq(versionEvaluation.runId, scanRun.id))
        .where(
          and(
            eq(scanRun.status, "succeeded"),
            gte(pageVersion.capturedAt, start.getTime()),
            lt(pageVersion.capturedAt, end.getTime()),
          ),
        )
        .orderBy(desc(pageVersion.capturedAt), desc(pageVersion.runId))
        .limit(1)
        .get();
      if (row)
        observations.push({
          pageId,
          runId: row.version.runId,
          rubricId: row.evaluated.rubricId,
          model: row.evaluated.model,
          capturedAt: new Date(row.version.capturedAt),
          contentKey: row.version.contentKey,
          contentSha256: row.version.contentSha256,
          choices: row.evaluated.evaluation.choices,
          signals: row.evaluated.evaluation.signals,
          pricingFacts: row.evaluated.evaluation.pricingFacts,
        });
    }
    const before = observations[0];
    const after = observations[1];
    const comparisons =
      before && after
        ? this.db
            .select()
            .from(versionComparison)
            .where(
              and(
                eq(versionComparison.beforeRunId, before.runId),
                eq(versionComparison.afterRunId, after.runId),
                eq(versionComparison.verifierVersion, COMPARISON_VERSION),
              ),
            )
            .all()
        : [];
    return { observations, comparisons };
  }

  async persistComparison(pageId: string, comparison: Comparison): Promise<void> {
    this.db.transaction((tx) => {
      const config = tx.select().from(pageConfig).where(eq(pageConfig.id, 1)).get();
      if (config?.pageId !== pageId) throw new Error("PageStore does not own this page");
      for (const runId of [comparison.beforeRunId, comparison.afterRunId]) {
        const run = tx.select().from(scanRun).where(eq(scanRun.id, runId)).get();
        if (run?.status !== "succeeded") throw new Error(`Run ${runId} is not published`);
      }
      tx.insert(versionComparison)
        .values({
          ...comparison,
          id: `${comparison.verifierVersion}:${comparison.beforeRunId}:${comparison.afterRunId}`,
        })
        .onConflictDoNothing()
        .run();
    });
  }

  async preparePublication(runId: string, input: PendingPublication): Promise<void> {
    this.db.transaction((tx) => {
      const config = tx.select().from(pageConfig).where(eq(pageConfig.id, 1)).get();
      if (
        config?.pageId !== input.pageId ||
        config.normalizedDomain !== input.normalizedDomain ||
        input.runId !== runId
      )
        throw new Error("Publication does not belong to this page and run");
      const run = tx.select().from(scanRun).where(eq(scanRun.id, runId)).get();
      if (!run || run.status === "failed") throw new Error(`Cannot publish run ${runId}`);
      if (run.status === "succeeded") return;
      const version = tx.select().from(pageVersion).where(eq(pageVersion.runId, runId)).get();
      const evaluated = tx
        .select()
        .from(versionEvaluation)
        .where(eq(versionEvaluation.runId, runId))
        .get();
      if (
        !version ||
        !evaluated ||
        version.capturedAt !== input.capturedAt ||
        evaluated.rubricId !== input.rubricId ||
        evaluated.model !== input.model
      )
        throw new Error("Publication does not match the stored evaluation");
      const key = `${PUBLICATION_PREFIX}${runId}`;
      if (!this.ctx.storage.kv.get(key))
        this.ctx.storage.kv.put(key, {
          ...input,
          ...evaluated.evaluation,
        });
    });
    // Arm delivery before success releases the active run. A stopped workflow
    // cannot leave a successful version without an independent retry.
    await this.scheduleNextAlarm();
  }

  async publishPending(): Promise<void> {
    const pending = Array.from(
      this.ctx.storage.kv.list<PendingPublication>({ prefix: PUBLICATION_PREFIX }),
    );
    try {
      for (const [key, payload] of pending) {
        const run = this.db.select().from(scanRun).where(eq(scanRun.id, payload.runId)).get();
        if (run?.status !== "succeeded") continue;
        if (run.completedAt === null)
          throw new Error(`Successful run ${run.id} has no completion time`);
        await publishPageProjection(createDb({ DB: this.env.DB }), {
          ...payload,
          nextScanAt: nextAlarmAt(run.completedAt),
          runCreatedAt: run.createdAt,
        });
        this.ctx.storage.kv.delete(key);
      }
    } finally {
      await this.scheduleNextAlarm();
    }
  }

  private async scheduleNextAlarm(): Promise<void> {
    const hasPending = !this.ctx.storage.kv
      .list({ prefix: PUBLICATION_PREFIX, limit: 1 })
      [Symbol.iterator]()
      .next().done;
    const state = this.db.select().from(schedulerState).where(eq(schedulerState.id, 1)).get();
    if (hasPending) await this.ctx.storage.setAlarm(Date.now() + PUBLICATION_RETRY_MS);
    else if (state?.nextScanAt !== null && state?.nextScanAt !== undefined)
      await this.ctx.storage.setAlarm(state.nextScanAt);
    else await this.ctx.storage.deleteAlarm();
  }

  async completeSuccess(runId: string, completedAt = Date.now()): Promise<number> {
    return this.complete(runId, "succeeded", completedAt);
  }

  async completeFailure(
    runId: string,
    errorCode: string,
    errorMessage: string,
    completedAt = Date.now(),
  ): Promise<number> {
    return this.complete(runId, "failed", completedAt, errorCode, errorMessage);
  }

  async alarm(): Promise<void> {
    await this.publishPending();
    const state = this.db.select().from(schedulerState).where(eq(schedulerState.id, 1)).get();
    if (
      state?.nextScanAt !== null &&
      state?.nextScanAt !== undefined &&
      state.nextScanAt <= Date.now()
    ) {
      await this.startRun("scheduled", null);
      await this.scheduleNextAlarm();
    }
  }

  private async seedRubric(): Promise<void> {
    await assertCurrentRubricFingerprint();
    const rubric = PRICING_INTELLIGENCE_RUBRIC;
    const rows = Object.entries(rubric.questions).map(([key, value], position) => ({
      questionSetId: rubric.id,
      key,
      type: value.type,
      instructions: value.instructions,
      criteria: { ...value.criteria },
      position,
    }));
    this.db.transaction((tx) => {
      const existing = tx.select().from(questionSet).where(eq(questionSet.id, rubric.id)).get();
      if (existing) {
        const stored = tx
          .select()
          .from(question)
          .where(eq(question.questionSetId, rubric.id))
          .orderBy(question.position)
          .all();
        if (
          existing.version !== rubric.version ||
          existing.model !== rubric.model ||
          JSON.stringify(stored) !== JSON.stringify(rows)
        ) {
          throw new Error("Stored pricing rubric is immutable; use a new rubric identity");
        }
      } else {
        tx.insert(questionSet)
          .values({ id: rubric.id, model: rubric.model, version: rubric.version, active: false })
          .run();
        for (const row of rows) tx.insert(question).values(row).run();
      }
      tx.update(questionSet).set({ active: false }).run();
      tx.update(questionSet).set({ active: true }).where(eq(questionSet.id, rubric.id)).run();
    });
  }

  private async startRun(
    trigger: RunTrigger,
    requestedByUserId: string | null,
  ): Promise<PageRunDto> {
    const active = await this.getActiveRun();
    if (active) return active;

    const [config] = await this.db.select().from(pageConfig).where(eq(pageConfig.id, 1)).limit(1);
    if (!config) throw new Error("PageStore is not initialized");

    const now = Date.now();
    const runId = crypto.randomUUID();
    const row: typeof scanRun.$inferInsert = {
      id: runId,
      trigger,
      status: "queued",
      stage: "queued",
      workflowInstanceId: runId,
      requestedByUserId,
      createdAt: now,
      events: [{ stage: "queued", at: now, kind: "entered" }],
    };

    let competingRunId: string | null = null;
    this.db.transaction((tx) => {
      const state = tx.select().from(schedulerState).where(eq(schedulerState.id, 1)).get();
      if (state?.activeRunId) {
        competingRunId = state.activeRunId;
        return;
      }
      const latest = tx
        .select({ createdAt: scanRun.createdAt })
        .from(scanRun)
        .orderBy(desc(scanRun.createdAt))
        .limit(1)
        .get();
      row.createdAt = Math.max(now, (latest?.createdAt ?? 0) + 1);
      tx.insert(scanRun).values(row).run();
      tx.update(schedulerState)
        .set({ activeRunId: runId, nextScanAt: null, updatedAt: row.createdAt })
        .where(eq(schedulerState.id, 1))
        .run();
    });

    if (competingRunId) {
      const competingRun = await this.getRun(competingRunId);
      if (competingRun) return competingRun;
    }

    const afterCommit = await this.getActiveRun();
    if (!afterCommit || afterCommit.id !== runId) {
      if (afterCommit) return afterCommit;
      throw new Error("Failed to establish active scan run");
    }

    const params: ScanWorkflowParams = {
      pageId: config.pageId,
      normalizedDomain: config.normalizedDomain,
      canonicalUrl: config.canonicalUrl,
      runId,
      trigger,
    };
    try {
      await this.env.SCAN_WORKFLOW.create({ id: runId, params });
    } catch (error) {
      await this.completeFailure(
        runId,
        "workflow_start_failed",
        error instanceof Error ? error.message : "Workflow start failed",
      );
      return (await this.getRun(runId)) ?? toRunDto(row);
    }

    return toRunDto(row);
  }

  private async getActiveRun(): Promise<PageRunDto | null> {
    const [state] = await this.db
      .select()
      .from(schedulerState)
      .where(eq(schedulerState.id, 1))
      .limit(1);
    if (!state?.activeRunId) return null;
    const run = await this.getRun(state.activeRunId);
    return run && (run.status === "queued" || run.status === "running") ? run : null;
  }

  private async complete(
    runId: string,
    status: "succeeded" | "failed",
    completedAt: number,
    errorCode: string | null = null,
    errorMessage: string | null = null,
  ): Promise<number> {
    let effectiveCompletedAt = completedAt;
    this.db.transaction((tx) => {
      const run = tx.select().from(scanRun).where(eq(scanRun.id, runId)).get();
      if (!run) throw new Error(`Unknown scan run ${runId}`);
      const action = resolveRunCompletion(run.status, status);
      if (action === "reuse") {
        effectiveCompletedAt = run.completedAt ?? completedAt;
        return;
      }

      const publicationKey = `${PUBLICATION_PREFIX}${runId}`;
      if (status === "succeeded" && !this.ctx.storage.kv.get(publicationKey))
        throw new Error(`No prepared publication for run ${runId}`);
      if (status === "failed") this.ctx.storage.kv.delete(publicationKey);
      const nextScanAt = nextAlarmAt(effectiveCompletedAt);
      tx.update(scanRun)
        .set({
          status,
          stage: "complete",
          completedAt,
          errorCode,
          errorMessage,
          events: [
            ...run.events,
            {
              stage: run.stage,
              at: completedAt,
              kind: status === "failed" ? "failed" : "completed",
              ...(errorMessage ? { message: errorMessage.slice(0, 300) } : {}),
            },
          ],
        })
        .where(eq(scanRun.id, runId))
        .run();
      tx.update(schedulerState)
        .set({ activeRunId: null, nextScanAt, updatedAt: completedAt })
        .where(and(eq(schedulerState.id, 1), eq(schedulerState.activeRunId, runId)))
        .run();
    });
    const nextScanAt = nextAlarmAt(effectiveCompletedAt);
    await this.scheduleNextAlarm();
    return nextScanAt;
  }
}

type ReusableEvaluation = {
  runId: string;
  rubricId: string;
  model: string;
  evaluation: PublicEvaluation & { snapshot: PublishedSnapshot; review: SnapshotReview[] };
  answers: JevAnswer[];
};

function fromStoredAnswer(row: typeof answer.$inferSelect): JevAnswer {
  if (row.type === "choice")
    return {
      key: row.questionKey,
      type: "choice",
      choice: row.choice!,
      confidence: row.confidence!,
      probabilities: row.probabilities ?? {},
    };
  return { key: row.questionKey, type: "noul", noul: row.noul! };
}

type StoredAnswer = Omit<
  typeof answer.$inferInsert,
  "versionId" | "questionSetId" | "questionKey" | "createdAt"
>;

function toStoredAnswer(value: JevAnswer): StoredAnswer {
  if (value.type === "choice") {
    return {
      type: value.type,
      choice: value.choice,
      noul: null,
      confidence: value.confidence,
      probabilities: value.probabilities,
    };
  }
  return {
    type: value.type,
    choice: null,
    noul: value.noul,
    confidence: null,
    probabilities: null,
  };
}

function toPersistedQuestion(
  row: typeof question.$inferSelect,
): PersistedRubric["questions"][number] {
  if (row.type === "choice") {
    return { ...row, type: row.type, criteria: row.criteria, minimum: null, maximum: null };
  }
  if (typeof row.criteria.true !== "string" || typeof row.criteria.false !== "string") {
    throw new Error(`Invalid persisted noul question ${row.key}`);
  }
  return {
    ...row,
    type: row.type,
    criteria: { true: row.criteria.true, false: row.criteria.false },
    minimum: null,
    maximum: null,
  };
}

function toRunDto(row: typeof scanRun.$inferSelect | typeof scanRun.$inferInsert): PageRunDto {
  return {
    id: row.id,
    trigger: row.trigger,
    status: row.status,
    stage: row.stage,
    requestedByUserId: row.requestedByUserId ?? null,
    browserEngine: row.browserEngine ?? null,
    errorCode: row.errorCode ?? null,
    errorMessage: row.errorMessage ?? null,
    createdAt: row.createdAt ?? Date.now(),
    startedAt: row.startedAt ?? null,
    completedAt: row.completedAt ?? null,
    events: row.events ?? [],
  };
}
