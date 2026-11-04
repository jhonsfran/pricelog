import type { Database } from "@pricelog/db";
import { page, pageOwnerState, pagePublicSummary } from "@pricelog/db/schema/pages";
import { and, eq, sql } from "drizzle-orm";

import type { PublicEvaluation } from "@pricelog/db/history-types";

export type PagePublication = PublicEvaluation & {
  pageId: string;
  runId: string;
  runCreatedAt: number;
  analysisId?: string;
  normalizedDomain: string;
  capturedAt: number;
  displayName: string;
  description: string | null;
  rubricId: string;
  model: string;
  nextScanAt: number;
};

type OwnerProjection = {
  pageId: string;
  runId: string;
  runCreatedAt: number;
  status: "running" | "succeeded" | "failed";
  nextScanAt?: number;
};

export function ownerProjectionWrite(db: Database, input: OwnerProjection) {
  const owner = {
    pageId: input.pageId,
    activeRunId: input.status === "running" ? input.runId : null,
    lastRunId: input.runId,
    lastRunCreatedAt: input.runCreatedAt,
    lastRunStatus: input.status,
    nextScanAt: input.nextScanAt === undefined ? null : new Date(input.nextScanAt),
  };
  return db
    .insert(pageOwnerState)
    .values(owner)
    .onConflictDoUpdate({
      target: pageOwnerState.pageId,
      set: { ...owner, updatedAt: new Date() },
      setWhere: sql`${pageOwnerState.lastRunCreatedAt} < ${input.runCreatedAt} or (${pageOwnerState.lastRunId} = ${input.runId} and (${input.status} != 'running' or ${pageOwnerState.lastRunStatus} in ('queued', 'running')))`,
    });
}

export async function publishOwnerProjection(db: Database, input: OwnerProjection): Promise<void> {
  await ownerProjectionWrite(db, input);
}

export function pageProjectionWrites(db: Database, input: PagePublication, updateMetadata = true) {
  const summary = {
    pageId: input.pageId,
    runId: input.runId,
    analysisId: input.analysisId ?? null,
    rubricId: input.rubricId,
    model: input.model,
    pricingFacts: null,
    snapshot: input.snapshot ?? null,
    review: input.review ?? null,
    numericPrices: input.numericPrices ? { ...input.numericPrices, audit: undefined } : null,
    choices: input.choices,
    signals: input.signals,
    tags: input.tags,
    browserEngine: "chromium" as const,
    scannedAt: new Date(input.capturedAt),
  };
  const selected = sql`(${input.analysisId === undefined ? 1 : 0} = 1 or exists (select 1 from history_capture c where c.page_id = ${input.pageId} and c.run_id = ${input.runId} and c.selected_analysis_id = ${input.analysisId ?? null}))`;
  const json = (value: unknown) => (value === null ? null : JSON.stringify(value));
  return [
    db
      .insert(pagePublicSummary)
      .select(
        sql`select ${summary.pageId}, ${summary.runId}, ${summary.analysisId}, ${summary.rubricId}, ${summary.model}, ${json(summary.numericPrices)}, null, ${json(summary.snapshot)}, ${json(summary.review)}, ${json(summary.choices)}, ${json(summary.signals)}, ${json(summary.tags)}, 'chromium', ${input.capturedAt}, ${Date.now()} where ${selected}`,
      )
      .onConflictDoUpdate({
        target: pagePublicSummary.pageId,
        set: { ...summary, updatedAt: new Date() },
        setWhere: sql`(${pagePublicSummary.scannedAt} < excluded.scanned_at or (${pagePublicSummary.scannedAt} = excluded.scanned_at and ${pagePublicSummary.runId} <= excluded.run_id)) and ${selected}`,
      }),
    db
      .update(page)
      .set({
        state: "active",
        ...(updateMetadata
          ? { displayName: input.displayName, description: input.description }
          : {}),
      })
      .where(
        and(
          eq(page.id, input.pageId),
          selected,
          sql`exists (select 1 from ${pagePublicSummary} where ${pagePublicSummary.pageId} = ${input.pageId} and ${pagePublicSummary.runId} = ${input.runId})`,
        ),
      ),
    ownerProjectionWrite(db, { ...input, status: "succeeded" }),
  ] as const;
}

export async function publishPageProjection(db: Database, input: PagePublication): Promise<void> {
  await db.batch([...pageProjectionWrites(db, input)]);
}
