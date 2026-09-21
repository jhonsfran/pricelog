import type { Database } from "@my-better-t-app/db";
import { PRICING_INTELLIGENCE_RUBRIC_ID } from "@my-better-t-app/db/pricing-intelligence";
import { benchmarkSnapshot, page, pagePublicSummary } from "@my-better-t-app/db/schema/pages";
import { and, asc, count, desc, eq, gt, sql } from "drizzle-orm";

import { buildBenchmarkSnapshots, type BenchmarkPage, type BenchmarkSnapshot } from "./benchmark";

/** Request-time work stays bounded until the first scheduled snapshot exists. */
const LIVE_FALLBACK_LIMIT = 2_000;

/** D1 page size for the complete scheduled corpus read. */
const CORPUS_BATCH_SIZE = 500;

type BenchmarkCorpusRow = BenchmarkPage & { id: string };

export type BenchmarkReading = {
  snapshots: BenchmarkSnapshot[];
  computedAt: Date | null;
  /** True when computed on request because stored aggregates are absent or stale. */
  live: boolean;
};

export function benchmarkCorpusCondition(rubricId: string, afterId?: string) {
  return and(
    eq(page.state, "active"),
    eq(pagePublicSummary.rubricId, rubricId),
    afterId ? gt(page.id, afterId) : undefined,
  );
}

async function readCorpusPage(
  db: Database,
  rubricId: string,
  limit: number,
  afterId?: string,
): Promise<BenchmarkCorpusRow[]> {
  return db
    .select({
      id: page.id,
      choices: pagePublicSummary.choices,
      signals: pagePublicSummary.signals,
    })
    .from(page)
    .innerJoin(pagePublicSummary, eq(pagePublicSummary.pageId, page.id))
    .where(benchmarkCorpusCondition(rubricId, afterId))
    .orderBy(asc(page.id))
    .limit(limit);
}

function withoutId({ id: _id, ...benchmarkPage }: BenchmarkCorpusRow): BenchmarkPage {
  return benchmarkPage;
}

export async function readLiveBenchmarkCorpus(
  db: Database,
  rubricId = PRICING_INTELLIGENCE_RUBRIC_ID,
  limit = LIVE_FALLBACK_LIMIT,
): Promise<BenchmarkPage[]> {
  return (await readCorpusPage(db, rubricId, limit)).map(withoutId);
}

export async function collectBenchmarkCorpus(
  readPage: (afterId?: string) => Promise<BenchmarkCorpusRow[]>,
  batchSize = CORPUS_BATCH_SIZE,
): Promise<BenchmarkPage[]> {
  if (batchSize < 1) throw new Error("Benchmark corpus batch size must be positive");

  const corpus: BenchmarkPage[] = [];
  let afterId: string | undefined;
  for (;;) {
    const rows = await readPage(afterId);
    corpus.push(...rows.map(withoutId));
    if (rows.length < batchSize) return corpus;

    const nextId = rows.at(-1)?.id;
    if (!nextId || nextId === afterId) {
      throw new Error("Benchmark corpus pagination did not advance");
    }
    afterId = nextId;
  }
}

export async function readCompleteBenchmarkCorpus(
  db: Database,
  rubricId = PRICING_INTELLIGENCE_RUBRIC_ID,
  batchSize = CORPUS_BATCH_SIZE,
): Promise<BenchmarkPage[]> {
  return collectBenchmarkCorpus(
    (afterId) => readCorpusPage(db, rubricId, batchSize, afterId),
    batchSize,
  );
}

export function computeBenchmarks(pages: BenchmarkPage[]): BenchmarkSnapshot[] {
  return buildBenchmarkSnapshots(pages);
}

/** Loads the newest complete computation for one rubric. */
export async function loadBenchmarks(
  db: Database,
  rubricId = PRICING_INTELLIGENCE_RUBRIC_ID,
): Promise<BenchmarkReading> {
  const [latest] = await db
    .select({ computedAt: benchmarkSnapshot.computedAt })
    .from(benchmarkSnapshot)
    .where(eq(benchmarkSnapshot.rubricId, rubricId))
    .orderBy(desc(benchmarkSnapshot.computedAt))
    .limit(1);

  if (latest) {
    const rows = await db
      .select()
      .from(benchmarkSnapshot)
      .where(
        and(
          eq(benchmarkSnapshot.rubricId, rubricId),
          eq(benchmarkSnapshot.computedAt, latest.computedAt),
        ),
      );
    const [current] = await db
      .select({
        pageCount: count(),
        updatedAt: sql<number | null>`max(max(${pagePublicSummary.updatedAt}, ${page.updatedAt}))`,
      })
      .from(page)
      .innerJoin(pagePublicSummary, eq(pagePublicSummary.pageId, page.id))
      .where(benchmarkCorpusCondition(rubricId));
    const storedCount = rows.find((row) => row.cohort === "all")?.pageCount ?? 0;
    // New scans, category moves, and inactive/deleted pages invalidate current aggregates.
    if (
      current &&
      current.pageCount === storedCount &&
      (current.updatedAt ?? 0) <= latest.computedAt.getTime()
    )
      return {
        snapshots: rows
          .map((row) => ({
            cohort: row.cohort,
            pageCount: row.pageCount,
            choiceShares: row.choiceShares,
            signalCounts: row.signalCounts,
            signalShares: row.signalShares,
          }))
          .sort((left, right) => right.pageCount - left.pageCount),
        computedAt: latest.computedAt,
        live: false,
      };
  }

  const corpus = await readCompleteBenchmarkCorpus(db, rubricId);
  return { snapshots: computeBenchmarks(corpus), computedAt: null, live: true };
}

/** Appends one row per cohort after reading the complete compatible corpus. */
export async function storeBenchmarks(
  db: Database,
  rubricId = PRICING_INTELLIGENCE_RUBRIC_ID,
  computedAt = new Date(),
): Promise<number> {
  const corpus = await readCompleteBenchmarkCorpus(db, rubricId);
  const snapshots = computeBenchmarks(corpus);
  if (snapshots.length === 0) return 0;
  await db
    .insert(benchmarkSnapshot)
    .values(
      snapshots.map((snapshot) => ({
        id: `${computedAt.getTime()}:${rubricId}:${snapshot.cohort}`,
        rubricId,
        cohort: snapshot.cohort,
        computedAt,
        pageCount: snapshot.pageCount,
        choiceShares: snapshot.choiceShares,
        signalCounts: snapshot.signalCounts,
        signalShares: snapshot.signalShares,
      })),
    )
    .onConflictDoNothing({
      target: [benchmarkSnapshot.rubricId, benchmarkSnapshot.cohort, benchmarkSnapshot.computedAt],
    });
  return snapshots.length;
}
