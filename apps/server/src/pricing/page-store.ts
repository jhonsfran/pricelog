import { createDb } from "@pricelog/db";
import {
  createPricingHistoryRepository,
  HistoryNotReadyError,
} from "@pricelog/api/pricing-history-repository";
import {
  HISTORY_IMPORT_KEY,
  IMPORT_RECORD_LIMIT,
  PUBLICATION_PREFIX,
  TERMINAL_ARCHIVE_PREFIX,
  WORKSPACE_RUN_PREFIX,
  archiveFromWorkspace,
  exportLegacyBatch,
  legacySourceCount,
  type ImportProgress,
} from "./legacy-history";
import type { TerminalArchive } from "@pricelog/db/history-types";
import type { ScanPipelineStage } from "@pricelog/db/scan-stage";
import { type PagePublication } from "./publication";
import { type Comparison, type WeeklyPageHistory } from "@pricelog/api/pricing-history";
import type { PublicEvaluation } from "./evaluation";
import type { PublishedSnapshot, SnapshotReview } from "@pricelog/db/pricing-snapshot";
import { DurableObject } from "cloudflare:workers";
import type { DescendingTimestampCursor } from "@pricelog/api/pagination";
import { descendingCursorCondition } from "@pricelog/api/pagination";
import type { PublicVersionSummary } from "@pricelog/api/page-versions";
import { and, desc, eq } from "drizzle-orm";
import { drizzle, type DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";

import migrations from "./drizzle/migrations.js";
import {
  answer,
  versionEvaluation,
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
  StoredPublicVersion,
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

    await this.ensureHistoryReady();
    const existing = await this.listRuns(1);
    return existing.items[0] ?? this.startRun("initial", input.requestedByUserId);
  }

  triggerManual(requestedByUserId: string): Promise<PageRunDto> {
    return this.startRun("manual", requestedByUserId);
  }

  async listRuns(limit = 50, cursor?: DescendingTimestampCursor): Promise<RunPage> {
    const safeLimit = Math.max(1, Math.min(limit, 100));
    const local = this.db
      .select()
      .from(scanRun)
      .where(cursor ? descendingCursorCondition(scanRun.createdAt, scanRun.id, cursor) : undefined)
      .orderBy(desc(scanRun.createdAt), desc(scanRun.id))
      .limit(safeLimit + 1)
      .all()
      .map(toRunDto);
    const ready = this.ctx.storage.kv.get<ImportProgress>(HISTORY_IMPORT_KEY)?.ready;
    if (!ready) {
      const items = local.slice(0, safeLimit);
      const last = items.at(-1);
      return {
        items,
        nextCursor:
          local.length > safeLimit && last ? { createdAt: last.createdAt, id: last.id } : null,
      };
    }
    const archived = await this.history().listRuns(this.config().pageId, safeLimit + 1, cursor);
    const unique = new Map(archived.items.map((row) => [row.id, row]));
    for (const row of local) unique.set(row.id, row);
    const rows = [...unique.values()].sort(
      (a, b) => b.createdAt - a.createdAt || (a.id === b.id ? 0 : a.id < b.id ? 1 : -1),
    );
    const items = rows.slice(0, safeLimit);
    const last = items.at(-1);
    return {
      items,
      nextCursor:
        last && (rows.length > safeLimit || archived.nextCursor !== null)
          ? { createdAt: last.createdAt, id: last.id }
          : null,
    };
  }

  async getRun(runId: string): Promise<PageRunDto | null> {
    const row = this.db.select().from(scanRun).where(eq(scanRun.id, runId)).get();
    if (row) return toRunDto(row);
    await this.ensureHistoryReady();
    return this.history().getRun(this.config().pageId, runId);
  }

  async getArtifact(runId: string, kind: ArtifactKind): Promise<ArtifactReference | null> {
    const version = this.db.select().from(pageVersion).where(eq(pageVersion.runId, runId)).get();
    if (version) return artifactReference(version, kind);
    await this.ensureHistoryReady();
    return this.history().getArtifact(this.config().pageId, runId, kind);
  }

  async markRunning(runId: string, stage: RunStage = "capture"): Promise<void> {
    await this.ensureHistoryReady();
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
    await this.ensureHistoryReady();
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
    await this.ensureHistoryReady();
    this.db.transaction((tx) => {
      const run = tx.select().from(scanRun).where(eq(scanRun.id, runId)).get();
      if (!run || (run.status !== "queued" && run.status !== "running")) return;
      tx.update(scanRun)
        .set({ events: [...run.events, { ...event, at: Date.now() }] })
        .where(eq(scanRun.id, runId))
        .run();
    });
  }

  async persistVersion(runId: string, manifest: ArtifactManifest): Promise<string> {
    await this.ensureHistoryReady();
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
    await this.ensureHistoryReady();
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
    await this.ensureHistoryReady();
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

  private history() {
    return createPricingHistoryRepository(createDb({ DB: this.env.DB }));
  }

  private config() {
    const config = this.db.select().from(pageConfig).where(eq(pageConfig.id, 1)).get();
    if (!config) throw new Error("PageStore is not initialized");
    return config;
  }

  private migration: Promise<ImportProgress> | undefined;

  migrateHistory(
    recordLimit = IMPORT_RECORD_LIMIT,
    identity?: Pick<InitializePageInput, "pageId" | "normalizedDomain" | "canonicalUrl">,
  ): Promise<ImportProgress> {
    if (identity) {
      this.db
        .insert(pageConfig)
        .values({ id: 1, ...identity })
        .onConflictDoNothing()
        .run();
      this.db.insert(schedulerState).values({ id: 1 }).onConflictDoNothing().run();
      const config = this.config();
      if (
        config.pageId !== identity.pageId ||
        config.normalizedDomain !== identity.normalizedDomain ||
        config.canonicalUrl !== identity.canonicalUrl
      )
        throw new Error("History import identity does not belong to this page");
    }
    if (!this.migration)
      this.migration = this.importHistory(recordLimit).finally(() => {
        this.migration = undefined;
      });
    return this.migration;
  }

  private async importHistory(recordLimit: number): Promise<ImportProgress> {
    const { pageId } = this.config();
    const existing = this.ctx.storage.kv.get<ImportProgress>(HISTORY_IMPORT_KEY);
    let progress: ImportProgress = existing ?? {
      sourceIdentity: crypto.randomUUID(),
      checkpoint: null,
      expectedCount: legacySourceCount(this.db),
      importedCount: 0,
      ready: false,
    };
    if (!existing) this.ctx.storage.kv.put(HISTORY_IMPORT_KEY, progress);
    if (progress.ready) return progress;
    const repository = this.history();
    const batch = exportLegacyBatch(
      this.db,
      pageId,
      progress,
      (runId) => this.ctx.storage.kv.get<PendingPublication>(`${PUBLICATION_PREFIX}${runId}`),
      recordLimit,
    );
    for (const record of batch.records) {
      if (record.kind === "rubric") await repository.importRubric(pageId, record.rubric);
      else if (record.kind === "run") await repository.archive(record.archive);
      else await repository.persistComparison(pageId, record.comparison);
      const next: ImportProgress = {
        ...progress,
        checkpoint: record.key,
        importedCount: progress.importedCount + 1,
      };
      await repository.writeImport(pageId, next);
      this.ctx.storage.kv.put(HISTORY_IMPORT_KEY, next);
      if (record.kind === "run")
        this.ctx.storage.kv.delete(`${PUBLICATION_PREFIX}${record.archive.run.id}`);
      progress = next;
    }
    if (progress.importedCount === progress.expectedCount) {
      if (legacySourceCount(this.db) !== progress.expectedCount)
        throw new Error("Legacy source changed during import");
      const remaining = exportLegacyBatch(this.db, pageId, progress, () => undefined, 1);
      if (remaining.records.length)
        throw new Error("Legacy source identities do not match the import checkpoint");
      progress = { ...progress, ready: true };
      await repository.writeImport(pageId, progress);
      this.ctx.storage.kv.put(HISTORY_IMPORT_KEY, progress);
    }
    return progress;
  }

  private async ensureHistoryReady() {
    const progress = await this.migrateHistory();
    if (!progress.ready) throw new HistoryNotReadyError(this.config().pageId);
  }

  async findReusableEvaluation(
    runId: string,
    contentSha256: string,
    rubricId: string,
    pipeline: string,
  ): Promise<ReusableEvaluation | null> {
    await this.ensureHistoryReady();
    return this.history().findReusableEvaluation(
      this.config().pageId,
      runId,
      contentSha256,
      rubricId,
      pipeline,
    );
  }

  async getPublicSource(pageId: string, runId: string): Promise<ArtifactReference | null> {
    await this.ensureHistoryReady();
    return this.config().pageId === pageId
      ? this.history().getArtifact(pageId, runId, "content", true)
      : null;
  }

  async getPublicScreenshot(pageId: string, runId: string): Promise<ArtifactReference | null> {
    await this.ensureHistoryReady();
    return this.config().pageId === pageId
      ? this.history().getArtifact(pageId, runId, "screenshot", true)
      : null;
  }

  async listPublicVersions(pageId: string, limit = 100): Promise<PublicVersionSummary[]> {
    await this.ensureHistoryReady();
    return this.config().pageId === pageId ? this.history().listPublicVersions(pageId, limit) : [];
  }

  async getPublicPage(pageId: string) {
    await this.ensureHistoryReady();
    return this.config().pageId === pageId
      ? this.history().getPublicPage(pageId)
      : { versions: [], version: null };
  }

  async getPublicVersion(pageId: string, runId: string): Promise<StoredPublicVersion | null> {
    await this.ensureHistoryReady();
    return this.config().pageId === pageId ? this.history().getPublicVersion(pageId, runId) : null;
  }

  async getWeeklyHistory(pageId: string, now: number): Promise<WeeklyPageHistory> {
    await this.ensureHistoryReady();
    if (this.config().pageId !== pageId) throw new Error("PageStore does not own this page");
    return this.history().getWeeklyHistory(pageId, now);
  }

  async persistComparison(pageId: string, comparison: Comparison): Promise<void> {
    await this.ensureHistoryReady();
    if (this.config().pageId !== pageId) throw new Error("PageStore does not own this page");
    if (!comparison.beforeAnalysisId || !comparison.afterAnalysisId)
      throw new Error("Comparison analysis identities are required");
    await this.history().persistComparison(pageId, {
      ...comparison,
      beforeAnalysisId: comparison.beforeAnalysisId,
      afterAnalysisId: comparison.afterAnalysisId,
    });
  }

  async preparePublication(runId: string, input: PendingPublication): Promise<void> {
    await this.ensureHistoryReady();
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
    await this.ensureHistoryReady();
    try {
      for (const [key, payload] of this.ctx.storage.kv.list<PendingPublication>({
        prefix: PUBLICATION_PREFIX,
        limit: 10,
      })) {
        const run = this.db.select().from(scanRun).where(eq(scanRun.id, payload.runId)).get();
        if (
          !run ||
          run.status !== "succeeded" ||
          this.ctx.storage.kv.get(`${TERMINAL_ARCHIVE_PREFIX}${run.id}`)
        )
          continue;
        await this.history().archive(
          archiveFromWorkspace(
            this.db,
            this.config().pageId,
            { ...run, status: run.status },
            payload,
            "legacy",
          ),
        );
        this.ctx.storage.kv.delete(key);
      }
      const pending = this.ctx.storage.kv.list<TerminalArchive>({
        prefix: TERMINAL_ARCHIVE_PREFIX,
        limit: 10,
      });
      for (const [key, payload] of pending) {
        await this.history().archive(payload);
        this.db.transaction((tx) => {
          this.ctx.storage.kv.delete(key);
          this.ctx.storage.kv.delete(`${PUBLICATION_PREFIX}${payload.run.id}`);
          if (this.ctx.storage.kv.get(`${WORKSPACE_RUN_PREFIX}${payload.run.id}`)) {
            tx.delete(answer).where(eq(answer.versionId, payload.run.id)).run();
            tx.delete(versionEvaluation).where(eq(versionEvaluation.runId, payload.run.id)).run();
            tx.delete(pageVersion).where(eq(pageVersion.runId, payload.run.id)).run();
            tx.delete(scanRun).where(eq(scanRun.id, payload.run.id)).run();
            this.ctx.storage.kv.delete(`${WORKSPACE_RUN_PREFIX}${payload.run.id}`);
          }
        });
      }
    } finally {
      await this.scheduleNextAlarm();
    }
  }

  private async scheduleNextAlarm(): Promise<void> {
    const importing = this.ctx.storage.kv.get<ImportProgress>(HISTORY_IMPORT_KEY)?.ready === false;
    const hasArchive = !this.ctx.storage.kv
      .list({ prefix: TERMINAL_ARCHIVE_PREFIX, limit: 1 })
      [Symbol.iterator]()
      .next().done;
    const hasPending = !this.ctx.storage.kv
      .list({ prefix: PUBLICATION_PREFIX, limit: 1 })
      [Symbol.iterator]()
      .next().done;
    const state = this.db.select().from(schedulerState).where(eq(schedulerState.id, 1)).get();
    if (hasPending || hasArchive || importing)
      await this.ctx.storage.setAlarm(Date.now() + PUBLICATION_RETRY_MS);
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
    await this.ensureHistoryReady();
    const active = await this.getActiveRun();
    if (active && !isStalled(active, Date.now())) return active;
    // A deploy or crash can end a workflow without a terminal step; its run would block the page
    // forever, so a run that stopped reporting progress gives way to the new one.
    if (active)
      await this.completeFailure(
        active.id,
        "scan_stalled",
        "The scan stopped reporting progress and was replaced by a new scan",
      );

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
      row.createdAt = Math.max(
        now,
        (latest?.createdAt ?? 0) + 1,
        (this.ctx.storage.kv.get<number>("last-run-created-at") ?? 0) + 1,
      );
      this.ctx.storage.kv.put("last-run-created-at", row.createdAt);
      this.ctx.storage.kv.put(`${WORKSPACE_RUN_PREFIX}${runId}`, true);
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
    await this.ensureHistoryReady();
    const local = this.db.select().from(scanRun).where(eq(scanRun.id, runId)).get();
    if (!local) {
      const archived = await this.history().getRun(this.config().pageId, runId);
      if (!archived) throw new Error(`Unknown scan run ${runId}`);
      resolveRunCompletion(archived.status, status);
      return nextAlarmAt(archived.completedAt ?? completedAt);
    }
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
      const terminal = tx.select().from(scanRun).where(eq(scanRun.id, runId)).get();
      if (!terminal || (terminal.status !== "succeeded" && terminal.status !== "failed"))
        throw new Error("Terminal run is missing");
      const archive = archiveFromWorkspace(
        this.db,
        this.config().pageId,
        { ...terminal, status: terminal.status },
        this.ctx.storage.kv.get<PendingPublication>(publicationKey),
        "scan",
      );
      this.ctx.storage.kv.put(`${TERMINAL_ARCHIVE_PREFIX}${runId}`, archive);
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

/** Every live step records an event well within this; a run silent for longer has died. */
export const STALLED_RUN_MS = 20 * 60_000;

export function isStalled(run: PageRunDto, now: number): boolean {
  const lastProgress = Math.max(
    run.createdAt,
    run.startedAt ?? 0,
    ...run.events.map((event) => event.at),
  );
  return now - lastProgress > STALLED_RUN_MS;
}

type ReusableEvaluation = {
  runId: string;
  rubricId: string;
  model: string;
  evaluation: PublicEvaluation & { snapshot: PublishedSnapshot; review: SnapshotReview[] };
  answers: JevAnswer[];
};

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
