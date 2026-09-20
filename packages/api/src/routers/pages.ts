import { page, pageOwnerState, pagePublicSummary } from "@my-better-t-app/db/schema/pages";
import { ORPCError } from "@orpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import type { Context } from "../context";
import { protectedProcedure } from "../index";
import { descendingTimestampCursorSchema } from "../pagination-schema";

const pageIdInput = z.object({ pageId: z.string().min(1) });

type ProvisioningRecord = {
  id: string;
  ownerUserId: string;
  normalizedDomain: string;
  canonicalUrl: string;
  slug: string;
  state: "pending" | "active";
};

type ProvisioningDependencies<TPage extends ProvisioningRecord> = {
  findByDomain: (normalizedDomain: string) => Promise<TPage | null>;
  createRecords: (record: ProvisioningRecord) => Promise<unknown>;
  ensureOwnerState: (pageId: string) => Promise<unknown>;
  initializeAndStart: (input: {
    pageId: string;
    normalizedDomain: string;
    canonicalUrl: string;
    requestedByUserId: string;
  }) => Promise<unknown>;
};

export async function provisionOwnedPage<TPage extends ProvisioningRecord>(
  input: { record: ProvisioningRecord; requestedByUserId: string },
  dependencies: ProvisioningDependencies<TPage>,
): Promise<TPage> {
  let owned = await dependencies.findByDomain(input.record.normalizedDomain);
  if (!owned) {
    try {
      await dependencies.createRecords(input.record);
    } catch (error) {
      owned = await dependencies.findByDomain(input.record.normalizedDomain);
      if (!owned) throw error;
    }
    owned ??= await dependencies.findByDomain(input.record.normalizedDomain);
    if (!owned) throw new Error("Page provisioning did not create a domain record");
  }
  if (owned.ownerUserId !== input.requestedByUserId) {
    throw new ORPCError("CONFLICT", { message: "This domain already has an owner" });
  }

  await dependencies.ensureOwnerState(owned.id);
  await dependencies.initializeAndStart({
    pageId: owned.id,
    normalizedDomain: owned.normalizedDomain,
    canonicalUrl: owned.canonicalUrl,
    requestedByUserId: input.requestedByUserId,
  });
  return owned;
}

export async function findOwnedPage(context: Context, pageId: string, ownerUserId: string) {
  const [result] = await context.db
    .select()
    .from(page)
    .where(ownedPageCondition(pageId, ownerUserId))
    .limit(1);
  return result ?? null;
}

export function ownedPageCondition(pageId: string, ownerUserId: string) {
  return and(eq(page.id, pageId), eq(page.ownerUserId, ownerUserId));
}

async function requireOwnedPage(context: Context, pageId: string, ownerUserId: string) {
  const result = await findOwnedPage(context, pageId, ownerUserId);
  if (!result) throw new ORPCError("NOT_FOUND");
  return result;
}

export const pagesRouter = {
  listOwned: protectedProcedure.handler(async ({ context }) => {
    return context.db
      .select({
        id: page.id,
        slug: page.slug,
        normalizedDomain: page.normalizedDomain,
        canonicalUrl: page.canonicalUrl,
        displayName: page.displayName,
        state: page.state,
        createdAt: page.createdAt,
        activeRunId: pageOwnerState.activeRunId,
        lastRunId: pageOwnerState.lastRunId,
        lastRunStatus: pageOwnerState.lastRunStatus,
        nextScanAt: pageOwnerState.nextScanAt,
        overallScore: pagePublicSummary.overallScore,
      })
      .from(page)
      .leftJoin(pageOwnerState, eq(pageOwnerState.pageId, page.id))
      .leftJoin(pagePublicSummary, eq(pagePublicSummary.pageId, page.id))
      .where(eq(page.ownerUserId, context.session.user.id))
      .orderBy(desc(page.createdAt));
  }),

  create: protectedProcedure
    .input(z.object({ url: z.string().trim().url().max(2048) }))
    .handler(async ({ context, input }) => {
      const normalized = await context.pageMonitor.normalizeUrl(input.url);
      const pageId = crypto.randomUUID();
      const record = {
        id: pageId,
        ownerUserId: context.session.user.id,
        normalizedDomain: normalized.normalizedDomain,
        canonicalUrl: normalized.canonicalUrl,
        slug: normalized.normalizedDomain,
        state: "pending" as const,
      };
      return provisionOwnedPage(
        { record, requestedByUserId: context.session.user.id },
        {
          async findByDomain(normalizedDomain) {
            const [result] = await context.db
              .select()
              .from(page)
              .where(eq(page.normalizedDomain, normalizedDomain))
              .limit(1);
            return result ?? null;
          },
          createRecords(candidate) {
            return context.db.batch([
              context.db.insert(page).values(candidate),
              context.db.insert(pageOwnerState).values({ pageId: candidate.id }),
            ]);
          },
          ensureOwnerState(ownedPageId) {
            return context.db
              .insert(pageOwnerState)
              .values({ pageId: ownedPageId })
              .onConflictDoNothing();
          },
          initializeAndStart: context.pageMonitor.initializeAndStart,
        },
      );
    }),

  getOwned: protectedProcedure
    .input(pageIdInput.extend({ cursor: descendingTimestampCursorSchema.optional() }))
    .handler(async ({ context, input }) => {
      const owned = await requireOwnedPage(context, input.pageId, context.session.user.id);
      const [state] = await context.db
        .select()
        .from(pageOwnerState)
        .where(eq(pageOwnerState.pageId, owned.id))
        .limit(1);
      const [summary] = await context.db
        .select()
        .from(pagePublicSummary)
        .where(eq(pagePublicSummary.pageId, owned.id))
        .limit(1);
      const runs = await context.pageMonitor.listRuns(
        owned.normalizedDomain,
        undefined,
        input.cursor,
      );
      return { page: owned, state: state ?? null, summary: summary ?? null, runs };
    }),

  triggerRun: protectedProcedure.input(pageIdInput).handler(async ({ context, input }) => {
    const owned = await requireOwnedPage(context, input.pageId, context.session.user.id);
    return context.pageMonitor.triggerManual(owned.normalizedDomain, context.session.user.id);
  }),

  getRun: protectedProcedure
    .input(pageIdInput.extend({ runId: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      const owned = await requireOwnedPage(context, input.pageId, context.session.user.id);
      const run = await context.pageMonitor.getRun(owned.normalizedDomain, input.runId);
      if (!run) throw new ORPCError("NOT_FOUND");
      return run;
    }),
};
