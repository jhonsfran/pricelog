import { DurableObject } from "cloudflare:workers";
import { and, desc, eq, lt } from "drizzle-orm";
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
import { PRICING_QUALITY_V1 } from "./rubric";
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
import { artifactReference, nextAlarmAt } from "./page-store-logic";

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
  nextCursor: number | null;
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

    return this.startRun("initial", input.requestedByUserId);
  }

  triggerManual(requestedByUserId: string): Promise<PageRunDto> {
    return this.startRun("manual", requestedByUserId);
  }

  async listRuns(limit = 50, cursor?: number): Promise<RunPage> {
    const safeLimit = Math.max(1, Math.min(limit, 100));
    const rows = await this.db
      .select()
      .from(scanRun)
      .where(cursor === undefined ? undefined : lt(scanRun.createdAt, cursor))
      .orderBy(desc(scanRun.createdAt), desc(scanRun.id))
      .limit(safeLimit + 1);
    const hasMore = rows.length > safeLimit;
    const items = rows.slice(0, safeLimit).map(toRunDto);
    return {
      items,
      nextCursor: hasMore ? (items.at(-1)?.createdAt ?? null) : null,
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
    return { id: set.id, model: set.model, version: set.version, questions };
  }

  async persistAnswers(runId: string, rubricId: string, values: JevAnswer[]): Promise<void> {
    const [version] = await this.db
      .select({ id: pageVersion.id })
      .from(pageVersion)
      .where(eq(pageVersion.runId, runId))
      .limit(1);
    if (!version) throw new Error(`No page version for run ${runId}`);

    for (const value of values) {
      await this.db
        .insert(answer)
        .values({
          versionId: version.id,
          questionSetId: rubricId,
          questionKey: value.key,
          score: value.score,
          confidence: value.confidence,
          legend: value.legend,
          probabilities: value.probabilities,
        })
        .onConflictDoUpdate({
          target: [answer.versionId, answer.questionSetId, answer.questionKey],
          set: {
            score: value.score,
            confidence: value.confidence,
            legend: value.legend,
            probabilities: value.probabilities,
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
    await this.db
      .insert(questionSet)
      .values({
        id: PRICING_QUALITY_V1.id,
        model: PRICING_QUALITY_V1.model,
        version: PRICING_QUALITY_V1.version,
        active: true,
      })
      .onConflictDoNothing();

    let position = 0;
    for (const [key, value] of Object.entries(PRICING_QUALITY_V1.questions)) {
      await this.db
        .insert(question)
        .values({
          questionSetId: PRICING_QUALITY_V1.id,
          key,
          type: value.type,
          instructions: value.instructions,
          criteria: [...value.criteria],
          minimum: 0,
          maximum: 4,
          position: position++,
        })
        .onConflictDoNothing();
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
    const nextScanAt = nextAlarmAt(status === "succeeded" ? "success" : "failure", completedAt);
    this.db.transaction((tx) => {
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
    });
    await this.ctx.storage.setAlarm(nextScanAt);
    return nextScanAt;
  }
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
