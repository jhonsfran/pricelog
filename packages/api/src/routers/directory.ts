import { page, pagePublicSummary } from "@my-better-t-app/db/schema/pages";
import { and, desc, eq, like, or } from "drizzle-orm";
import { z } from "zod";

import { publicProcedure } from "../index";
import { descendingCursorCondition } from "../pagination";
import { descendingTimestampCursorSchema } from "../pagination-schema";

export const directoryRouter = {
  list: publicProcedure
    .input(
      z
        .object({
          search: z.string().trim().max(100).optional(),
          cursor: descendingTimestampCursorSchema.optional(),
          limit: z.number().int().min(1).max(50).default(25),
        })
        .optional(),
    )
    .handler(async ({ context, input }) => {
      const search = input?.search;
      const conditions = [eq(page.state, "active")];
      if (input?.cursor) {
        conditions.push(descendingCursorCondition(page.createdAt, page.id, input.cursor));
      }
      if (search) {
        const pattern = `%${search}%`;
        conditions.push(
          or(
            like(page.displayName, pattern),
            like(page.normalizedDomain, pattern),
            like(pagePublicSummary.tags, pattern),
          )!,
        );
      }
      const limit = input?.limit ?? 25;
      const rows = await context.db
        .select({
          id: page.id,
          slug: page.slug,
          normalizedDomain: page.normalizedDomain,
          canonicalUrl: page.canonicalUrl,
          displayName: page.displayName,
          description: page.description,
          createdAt: page.createdAt,
          overallScore: pagePublicSummary.overallScore,
          scores: pagePublicSummary.scores,
          tags: pagePublicSummary.tags,
          scannedAt: pagePublicSummary.scannedAt,
        })
        .from(page)
        .innerJoin(pagePublicSummary, eq(pagePublicSummary.pageId, page.id))
        .where(and(...conditions))
        .orderBy(desc(page.createdAt), desc(page.id))
        .limit(limit + 1);
      const hasMore = rows.length > limit;
      const items = rows.slice(0, limit);
      return {
        items,
        nextCursor: hasMore
          ? (() => {
              const last = items.at(-1);
              return last ? { createdAt: last.createdAt.getTime(), id: last.id } : null;
            })()
          : null,
      };
    }),

  getBySlug: publicProcedure
    .input(z.object({ slug: z.string().min(1).max(255) }))
    .handler(async ({ context, input }) => {
      const [result] = await context.db
        .select({
          id: page.id,
          slug: page.slug,
          normalizedDomain: page.normalizedDomain,
          canonicalUrl: page.canonicalUrl,
          displayName: page.displayName,
          description: page.description,
          overallScore: pagePublicSummary.overallScore,
          scores: pagePublicSummary.scores,
          choices: pagePublicSummary.choices,
          signals: pagePublicSummary.signals,
          tags: pagePublicSummary.tags,
          rubricId: pagePublicSummary.rubricId,
          model: pagePublicSummary.model,
          browserEngine: pagePublicSummary.browserEngine,
          scannedAt: pagePublicSummary.scannedAt,
        })
        .from(page)
        .innerJoin(pagePublicSummary, eq(pagePublicSummary.pageId, page.id))
        .where(and(eq(page.slug, input.slug), eq(page.state, "active")))
        .limit(1);
      return result ?? null;
    }),
};
