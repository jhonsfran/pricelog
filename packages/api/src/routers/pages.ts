import { page, pageOwnerState, pagePublicSummary } from "@my-better-t-app/db/schema/pages";
import { ORPCError } from "@orpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import type { Context } from "../context";
import { protectedProcedure } from "../index";

const pageIdInput = z.object({ pageId: z.string().min(1) });

export async function findOwnedPage(context: Context, pageId: string, ownerUserId: string) {
  const [result] = await context.db
    .select()
    .from(page)
    .where(and(eq(page.id, pageId), eq(page.ownerUserId, ownerUserId)))
    .limit(1);
  return result ?? null;
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
      const [existing] = await context.db
        .select()
        .from(page)
        .where(eq(page.normalizedDomain, normalized.normalizedDomain))
        .limit(1);
      if (existing) {
        if (existing.ownerUserId === context.session.user.id) return existing;
        throw new ORPCError("CONFLICT", { message: "This domain already has an owner" });
      }

      const pageId = crypto.randomUUID();
      const record = {
        id: pageId,
        ownerUserId: context.session.user.id,
        normalizedDomain: normalized.normalizedDomain,
        canonicalUrl: normalized.canonicalUrl,
        slug: normalized.normalizedDomain,
        state: "pending" as const,
      };
      try {
        await context.db.insert(page).values(record);
        await context.db.insert(pageOwnerState).values({ pageId });
      } catch (error) {
        const [winner] = await context.db
          .select()
          .from(page)
          .where(eq(page.normalizedDomain, normalized.normalizedDomain))
          .limit(1);
        if (winner?.ownerUserId === context.session.user.id) return winner;
        if (winner)
          throw new ORPCError("CONFLICT", { message: "This domain already has an owner" });
        throw error;
      }
      await context.pageMonitor.initializeAndStart({
        pageId,
        ...normalized,
        requestedByUserId: context.session.user.id,
      });
      return record;
    }),

  getOwned: protectedProcedure.input(pageIdInput).handler(async ({ context, input }) => {
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
    const runs = await context.pageMonitor.listRuns(owned.normalizedDomain);
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
