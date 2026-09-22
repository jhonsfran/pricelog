import { page, pagePublicSummary } from "@my-better-t-app/db/schema/pages";
import { and, asc, count, desc, eq, gt, like, or } from "drizzle-orm";
import { z } from "zod";

import {
  AI_APPLICATIONS_COHORT,
  ALL_COHORT,
  cohortLabel,
  cohortsForPage,
  COHORT_MINIMUM,
} from "../benchmark";
import {
  isPricingChoiceKey,
  isPricingSignalKey,
  PRICING_INTELLIGENCE_RUBRIC_ID,
} from "../pricing-intelligence";
import { buildWeeklyReport, sourceUrl } from "../pricing-history";
import { readWeeklyHistory } from "../pricing-history-store";
import { loadBenchmarks } from "../benchmark-store";
import { publicProcedure } from "../index";
import { hasChoice, inCohort, statesSignal } from "../directory-filters";
import { descendingCursorCondition } from "../pagination";
import { descendingTimestampCursorSchema } from "../pagination-schema";

export const directoryRouter = {
  list: publicProcedure
    .input(
      z
        .object({
          search: z.string().trim().max(100).optional(),
          /** A charging signal the page states, e.g. `fixed_subscription`. */
          signal: z.string().trim().max(64).refine(isPricingSignalKey).optional(),
          /** A published classification, e.g. `credit_conversion` = `not_disclosed`. */
          choiceKey: z.string().trim().max(64).refine(isPricingChoiceKey).optional(),
          choiceValue: z.string().trim().max(64).optional(),
          /** The cohort a chart was measured over, so a bar links to its own population. */
          cohort: z.string().trim().max(64).optional(),
          cursor: descendingTimestampCursorSchema.optional(),
          limit: z.number().int().min(1).max(50).default(25),
        })
        .optional(),
    )
    .handler(async ({ context, input }) => {
      const search = input?.search;
      const conditions = [eq(page.state, "active")];
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
      if (input?.signal) conditions.push(statesSignal(input.signal));
      if (input?.choiceKey && input.choiceValue) {
        conditions.push(hasChoice(input.choiceKey, input.choiceValue));
      }
      if (input?.cohort) {
        const cohort = inCohort(input.cohort);
        if (cohort) conditions.push(cohort);
      }

      const limit = input?.limit ?? 25;
      const paged = input?.cursor
        ? [...conditions, descendingCursorCondition(page.createdAt, page.id, input.cursor)]
        : conditions;
      const [rows, [totalRow]] = await Promise.all([
        context.db
          .select({
            id: page.id,
            slug: page.slug,
            normalizedDomain: page.normalizedDomain,
            canonicalUrl: page.canonicalUrl,
            displayName: page.displayName,
            description: page.description,
            createdAt: page.createdAt,
            choices: pagePublicSummary.choices,
            tags: pagePublicSummary.tags,
            scannedAt: pagePublicSummary.scannedAt,
          })
          .from(page)
          .innerJoin(pagePublicSummary, eq(pagePublicSummary.pageId, page.id))
          .where(and(...paged))
          .orderBy(desc(page.createdAt), desc(page.id))
          .limit(limit + 1),
        // The count ignores the cursor, so "34 pages" means the filter's
        // total rather than however many have been scrolled into view.
        context.db
          .select({ value: count() })
          .from(page)
          .innerJoin(pagePublicSummary, eq(pagePublicSummary.pageId, page.id))
          .where(and(...conditions)),
      ]);
      const hasMore = rows.length > limit;
      const items = rows.slice(0, limit);
      return {
        items,
        total: totalRow?.value ?? 0,
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
          choices: pagePublicSummary.choices,
          signals: pagePublicSummary.signals,
          tags: pagePublicSummary.tags,
          rubricId: pagePublicSummary.rubricId,
          model: pagePublicSummary.model,
          numericPrices: pagePublicSummary.numericPrices,
          browserEngine: pagePublicSummary.browserEngine,
          runId: pagePublicSummary.runId,
          scannedAt: pagePublicSummary.scannedAt,
        })
        .from(page)
        .innerJoin(pagePublicSummary, eq(pagePublicSummary.pageId, page.id))
        .where(and(eq(page.slug, input.slug), eq(page.state, "active")))
        .limit(1);
      if (!result) return null;
      const source = await context.pageMonitor.getPublicSource(
        result.normalizedDomain,
        result.id,
        result.runId,
      );
      const record = { ...result, sourceUrl: source ? sourceUrl(result.id, result.runId) : null };
      return record;
    }),

  benchmarks: publicProcedure
    .input(
      z.object({ cohort: z.string().min(1).max(64).default(AI_APPLICATIONS_COHORT) }).optional(),
    )
    .handler(async ({ context, input }) => {
      const [{ snapshots, computedAt, live }, [directoryCount]] = await Promise.all([
        loadBenchmarks(context.db),
        context.db
          .select({ value: count() })
          .from(page)
          .innerJoin(pagePublicSummary, eq(pagePublicSummary.pageId, page.id))
          .where(eq(page.state, "active")),
      ]);
      const available = snapshots.map((snapshot) => ({
        cohort: snapshot.cohort,
        label: cohortLabel(snapshot.cohort),
        pageCount: snapshot.pageCount,
      }));

      const requested = input?.cohort ?? AI_APPLICATIONS_COHORT;
      const selected = snapshots.find((snapshot) => snapshot.cohort === requested) ?? null;
      const [examples, priceExamples] = await Promise.all([
        readExamples(context.db, requested),
        readExamples(context.db, requested, true),
      ]);

      return {
        computedAt,
        live,
        minimumCohortSize: COHORT_MINIMUM,
        indexedPages: snapshots.find((s) => s.cohort === ALL_COHORT)?.pageCount ?? 0,
        totalIndexedPages: directoryCount?.value ?? 0,
        available,
        examples,
        priceExamples,
        selected: selected ? { ...selected, label: cohortLabel(selected.cohort) } : null,
      };
    }),

  weeklyChanges: publicProcedure
    .input(
      z.object({ cohort: z.string().min(1).max(64).default(AI_APPLICATIONS_COHORT) }).optional(),
    )
    .handler(async ({ context, input }) => {
      const now = new Date();
      const { observations, comparisons } = await readWeeklyHistory(
        context.db,
        context.pageMonitor,
        now,
      );
      return buildWeeklyReport(
        observations,
        comparisons,
        input?.cohort ?? AI_APPLICATIONS_COHORT,
        now,
      );
    }),
};

export async function readExamples(
  db: import("@my-better-t-app/db").Database,
  cohort: string,
  numericOnly = false,
) {
  const examples = [];
  let cursor: string | undefined;
  for (;;) {
    const rows = await db
      .select({
        id: page.id,
        slug: page.slug,
        displayName: page.displayName,
        normalizedDomain: page.normalizedDomain,
        scannedAt: pagePublicSummary.scannedAt,
        choices: pagePublicSummary.choices,
        signals: pagePublicSummary.signals,
        numericPrices: pagePublicSummary.numericPrices,
        runId: pagePublicSummary.runId,
      })
      .from(page)
      .innerJoin(pagePublicSummary, eq(pagePublicSummary.pageId, page.id))
      .where(
        and(
          eq(page.state, "active"),
          eq(pagePublicSummary.rubricId, PRICING_INTELLIGENCE_RUBRIC_ID),
          cursor ? gt(page.id, cursor) : undefined,
        ),
      )
      .orderBy(asc(page.id))
      .limit(100);
    for (const row of rows) {
      if (
        numericOnly &&
        (row.numericPrices?.status !== "collected" || !row.numericPrices.offers.length)
      )
        continue;
      if (cohortsForPage(row).includes(cohort)) examples.push(row);
      if (examples.length === 12) return examples;
    }
    if (rows.length < 100) return examples;
    cursor = rows.at(-1)!.id;
  }
}
