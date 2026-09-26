import type { Database } from "@my-better-t-app/db";
import { page, pageOwnerState, pagePublicSummary } from "@my-better-t-app/db/schema/pages";
import { and, eq, sql } from "drizzle-orm";

import type { PublicEvaluation } from "./evaluation";

export type PagePublication = PublicEvaluation & {
  pageId: string;
  runId: string;
  runCreatedAt: number;
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

function ownerProjectionWrite(db: Database, input: OwnerProjection) {
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

/** Deliver a DO's latest summary without overwriting a newer scan's state. */
export async function publishPageProjection(db: Database, input: PagePublication): Promise<void> {
  const summary = {
    pageId: input.pageId,
    runId: input.runId,
    rubricId: input.rubricId,
    model: input.model,
    // The old fact pipeline is retired; a new scan clears its facts from the summary.
    pricingFacts: null,
    snapshot: input.snapshot ?? null,
    review: input.review ?? null,
    // Decision history stays with the page version in its Durable Object.
    numericPrices: input.numericPrices ? { ...input.numericPrices, audit: undefined } : null,
    choices: input.choices,
    signals: input.signals,
    tags: input.tags,
    browserEngine: "chromium" as const,
    scannedAt: new Date(input.capturedAt),
  };
  await db.batch([
    db
      .insert(pagePublicSummary)
      .values(summary)
      .onConflictDoUpdate({
        target: pagePublicSummary.pageId,
        set: { ...summary, updatedAt: new Date() },
        setWhere: sql`${pagePublicSummary.scannedAt} < excluded.scanned_at`,
      }),
    db
      .update(page)
      .set({
        state: "active",
        displayName: input.displayName,
        description: input.description,
      })
      .where(
        and(
          eq(page.id, input.pageId),
          sql`exists (select 1 from ${pagePublicSummary} where ${pagePublicSummary.pageId} = ${input.pageId} and ${pagePublicSummary.runId} = ${input.runId})`,
        ),
      ),
    ownerProjectionWrite(db, { ...input, status: "succeeded" }),
  ]);
}
