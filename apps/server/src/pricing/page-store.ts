import { DurableObject } from "cloudflare:workers";
import type { DescendingTimestampCursor } from "@my-better-t-app/api/pagination";
import { descendingCursorCondition } from "@my-better-t-app/api/pagination";
import { and, desc, eq } from "drizzle-orm";
import { drizzle, type DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";

import migrations from "./drizzle/migrations.js";
import {
  answer,
  pageConfig,
  pageVersion,
  question,
  questionSet,
  scanRun,
  schedulerState,
} from "./do-schema";
import { PRICING_INTELLIGENCE_V3 } from "./rubric";
import type {
  ArtifactKind,
  ArtifactManifest,
  ArtifactReference,
  JevAnswer,
  PageRunDto,
  PersistedRubric,
  RunStage,
  RunTrigger,
  ScanWorkflowParams,
} from "./types";
import { artifactReference, nextAlarmAt, resolveRunCompletion } from "./page-store-logic";

export interface PageStoreEnv {
  SCAN_WORKFLOW: Workflow<ScanWorkflowParams>;
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
    await this.db
      .update(scanRun)
      .set({ status: "running", stage, startedAt: Date.now(), browserEngine: "chromium" })
      .where(and(eq(scanRun.id, runId), eq(scanRun.status, "queued")));
  }

  async setStage(runId: string, stage: RunStage): Promise<void> {
    await this.db.update(scanRun).set({ stage }).where(eq(scanRun.id, runId));
  }

  async persistVersion(runId: string, manifest: ArtifactManifest): Promise<string> {
    const versionId = runId;
    await this.db
      .insert(pageVersion)
      .values({ id: versionId, runId, browserEngine: "chromium", ...manifest })
      .onConflictDoUpdate({
        target: pageVersion.runId,
        set: { browserEngine: "chromium", ...manifest },
      });
    return versionId;
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
    const [version] = await this.db
      .select({ id: pageVersion.id })
      .from(pageVersion)
      .where(eq(pageVersion.runId, runId))
      .limit(1);
    if (!version) throw new Error(`No page version for run ${runId}`);

    for (const value of values) {
      const stored = toStoredAnswer(value);
      await this.db
        .insert(answer)
        .values({
          versionId: version.id,
          questionSetId: rubricId,
          questionKey: value.key,
          ...stored,
        })
        .onConflictDoUpdate({
          target: [answer.versionId, answer.questionSetId, answer.questionKey],
          set: {
            ...stored,
          },
        });
    }
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
    await this.startRun("scheduled", null);
  }

  private async seedRubric(): Promise<void> {
    await this.db.update(questionSet).set({ active: false });
    await this.db
      .insert(questionSet)
      .values({
        id: PRICING_INTELLIGENCE_V3.id,
        model: PRICING_INTELLIGENCE_V3.model,
        version: PRICING_INTELLIGENCE_V3.version,
        active: true,
      })
      .onConflictDoUpdate({
        target: questionSet.id,
        set: {
          model: PRICING_INTELLIGENCE_V3.model,
          version: PRICING_INTELLIGENCE_V3.version,
          active: true,
        },
      });

    let position = 0;
    for (const [key, value] of Object.entries(PRICING_INTELLIGENCE_V3.questions)) {
      const row = {
        type: value.type,
        instructions: value.instructions,
        criteria: value.type === "score" ? [...value.criteria] : { ...value.criteria },
        minimum: value.type === "score" ? 0 : null,
        maximum: value.type === "score" ? value.criteria.length - 1 : null,
        position: position++,
      };
      // Upsert rather than ignore: the shared catalog is the source of truth for
      // question text, and a store seeded before an edit must not keep asking the
      // old question while the site publishes the new one as its methodology.
      await this.db
        .insert(question)
        .values({ questionSetId: PRICING_INTELLIGENCE_V3.id, key, ...row })
        .onConflictDoUpdate({ target: [question.questionSetId, question.key], set: row });
    }
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
    };

    let competingRunId: string | null = null;
    this.db.transaction((tx) => {
      const state = tx.select().from(schedulerState).where(eq(schedulerState.id, 1)).get();
      if (state?.activeRunId) {
        competingRunId = state.activeRunId;
        return;
      }
      tx.insert(scanRun).values(row).run();
      tx.update(schedulerState)
        .set({ activeRunId: runId, nextScanAt: null, updatedAt: now })
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
    let shouldSetAlarm = false;
    this.db.transaction((tx) => {
      const run = tx.select().from(scanRun).where(eq(scanRun.id, runId)).get();
      if (!run) throw new Error(`Unknown scan run ${runId}`);
      const action = resolveRunCompletion(run.status, status);
      if (action === "reuse") {
        effectiveCompletedAt = run.completedAt ?? completedAt;
        const nextScanAt = nextAlarmAt(
          status === "succeeded" ? "success" : "failure",
          effectiveCompletedAt,
        );
        const state = tx.select().from(schedulerState).where(eq(schedulerState.id, 1)).get();
        shouldSetAlarm = state?.activeRunId === null && state.nextScanAt === nextScanAt;
        return;
      }

      const nextScanAt = nextAlarmAt(
        status === "succeeded" ? "success" : "failure",
        effectiveCompletedAt,
      );
      tx.update(scanRun)
        .set({
          status,
          stage: "complete",
          completedAt,
          errorCode,
          errorMessage,
        })
        .where(eq(scanRun.id, runId))
        .run();
      tx.update(schedulerState)
        .set({ activeRunId: null, nextScanAt, updatedAt: completedAt })
        .where(and(eq(schedulerState.id, 1), eq(schedulerState.activeRunId, runId)))
        .run();
      shouldSetAlarm = true;
    });
    const nextScanAt = nextAlarmAt(
      status === "succeeded" ? "success" : "failure",
      effectiveCompletedAt,
    );
    if (shouldSetAlarm) await this.ctx.storage.setAlarm(nextScanAt);
    return nextScanAt;
  }
}

type StoredAnswer = Omit<
  typeof answer.$inferInsert,
  "versionId" | "questionSetId" | "questionKey" | "createdAt"
>;

function toStoredAnswer(value: JevAnswer): StoredAnswer {
  if (value.type === "score") {
    return {
      type: value.type,
      score: value.score,
      choice: null,
      noul: null,
      confidence: value.confidence,
      legend: value.legend,
      probabilities: value.probabilities,
    };
  }
  if (value.type === "choice") {
    return {
      type: value.type,
      score: null,
      choice: value.choice,
      noul: null,
      confidence: value.confidence,
      legend: null,
      probabilities: value.probabilities,
    };
  }
  return {
    type: value.type,
    score: null,
    choice: null,
    noul: value.noul,
    confidence: null,
    legend: null,
    probabilities: null,
  };
}

function toPersistedQuestion(
  row: typeof question.$inferSelect,
): PersistedRubric["questions"][number] {
  if (row.type === "score") {
    if (!Array.isArray(row.criteria) || row.minimum === null || row.maximum === null) {
      throw new Error(`Invalid persisted score question ${row.key}`);
    }
    return {
      ...row,
      type: row.type,
      criteria: row.criteria,
      minimum: row.minimum,
      maximum: row.maximum,
    };
  }
  if (Array.isArray(row.criteria) || row.minimum !== null || row.maximum !== null) {
    throw new Error(`Invalid persisted ${row.type} question ${row.key}`);
  }
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
  };
}
