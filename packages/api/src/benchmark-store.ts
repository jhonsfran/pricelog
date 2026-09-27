import type { Database } from "@pricelog/db";
import { EXPECTED_JEV_MODEL, MAX_CAPTURE_AGE_MS } from "@pricelog/db/measurement-policy";
import { PRICING_INTELLIGENCE_RUBRIC_ID } from "@pricelog/db/pricing-intelligence";
import { benchmarkSnapshot, page, pagePublicSummary } from "@pricelog/db/schema/pages";
import { and, asc, count, eq, gt, gte, isNull, lt, lte, ne, or, sql } from "drizzle-orm";

import { buildBenchmarkSnapshots, type BenchmarkPage, type BenchmarkSnapshot } from "./benchmark";

/** D1 page size for the complete scheduled corpus read. */
const CORPUS_BATCH_SIZE = 500;
const MAX_BENCHMARK_PAGES = 20_000;

export type BenchmarkCorpusRow = BenchmarkPage & {
  id: string;
  slug: string;
  displayName: string | null;
  normalizedDomain: string;
  scannedAt: Date;
  runId: string;
};

export type BenchmarkReading = {
  snapshots: BenchmarkSnapshot[];
  computedAt: Date;
  /** Current comparisons are computed on request so captures expire without a write. */
  live: boolean;
  corpus: BenchmarkCorpusRow[];
};

export function benchmarkCorpusCondition(now = new Date(), afterId?: string) {
  return and(
    eq(page.state, "active"),
    eq(pagePublicSummary.rubricId, PRICING_INTELLIGENCE_RUBRIC_ID),
    eq(pagePublicSummary.model, EXPECTED_JEV_MODEL),
    gte(pagePublicSummary.scannedAt, new Date(now.getTime() - MAX_CAPTURE_AGE_MS)),
    lte(pagePublicSummary.scannedAt, now),
    afterId ? gt(page.id, afterId) : undefined,
  );
}

async function readCorpusPage(
  db: Database,
  limit: number,
  now: Date,
  afterId?: string,
): Promise<BenchmarkCorpusRow[]> {
  return db
    .select({
      id: page.id,
      slug: page.slug,
      displayName: page.displayName,
      normalizedDomain: page.normalizedDomain,
      scannedAt: pagePublicSummary.scannedAt,
      runId: pagePublicSummary.runId,
      choices: pagePublicSummary.choices,
      signals: pagePublicSummary.signals,
      numericPrices: pagePublicSummary.numericPrices,
    })
    .from(page)
    .innerJoin(pagePublicSummary, eq(pagePublicSummary.pageId, page.id))
    .where(benchmarkCorpusCondition(now, afterId))
    .orderBy(asc(page.id))
    .limit(limit);
}

export async function collectBenchmarkCorpus<Row extends BenchmarkPage & { id: string }>(
  readPage: (afterId?: string) => Promise<Row[]>,
  batchSize = CORPUS_BATCH_SIZE,
  maxRows = MAX_BENCHMARK_PAGES,
): Promise<Row[]> {
  if (batchSize < 1) throw new Error("Benchmark corpus batch size must be positive");

  const corpus: Row[] = [];
  let afterId: string | undefined;
  for (;;) {
    const rows = await readPage(afterId);
    if (corpus.length + rows.length > maxRows)
      throw new Error("Benchmark corpus exceeds the current read limit");
    corpus.push(...rows);
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
  now = new Date(),
  batchSize = CORPUS_BATCH_SIZE,
): Promise<BenchmarkCorpusRow[]> {
  return collectBenchmarkCorpus(
    (afterId) => readCorpusPage(db, batchSize, now, afterId),
    batchSize,
  );
}

export function computeBenchmarks(pages: BenchmarkPage[]): BenchmarkSnapshot[] {
  return buildBenchmarkSnapshots(pages);
}

/** Historical aggregates remain append-only. Current results always use the current corpus. */
export async function loadBenchmarks(db: Database, now = new Date()): Promise<BenchmarkReading> {
  const corpus = await readCompleteBenchmarkCorpus(db, now);
  return { snapshots: computeBenchmarks(corpus), computedAt: now, live: true, corpus };
}

export type BenchmarkCoverage = {
  total: number;
  eligible: number;
  /** Captures outside the current window, including future timestamps. */
  stale: number;
  incompatible: number;
  pending: number;
};

/** Each registered page belongs to exactly one status, in the order below. */
export async function readBenchmarkCoverage(
  db: Database,
  now = new Date(),
): Promise<BenchmarkCoverage> {
  const status = sql<Exclude<keyof BenchmarkCoverage, "total">>`case
    when ${or(ne(page.state, "active"), isNull(pagePublicSummary.pageId))} then 'pending'
    when ${or(ne(pagePublicSummary.rubricId, PRICING_INTELLIGENCE_RUBRIC_ID), ne(pagePublicSummary.model, EXPECTED_JEV_MODEL))} then 'incompatible'
    when ${or(lt(pagePublicSummary.scannedAt, new Date(now.getTime() - MAX_CAPTURE_AGE_MS)), gt(pagePublicSummary.scannedAt, now))} then 'stale'
    else 'eligible'
  end`;
  const rows = await db
    .select({ status, count: count() })
    .from(page)
    .leftJoin(pagePublicSummary, eq(pagePublicSummary.pageId, page.id))
    .groupBy(status);
  const coverage: BenchmarkCoverage = {
    total: 0,
    eligible: 0,
    stale: 0,
    incompatible: 0,
    pending: 0,
  };
  for (const row of rows) {
    coverage[row.status] = row.count;
    coverage.total += row.count;
  }
  return coverage;
}

/** Appends one row per cohort after reading the complete compatible corpus. */
export async function storeBenchmarks(db: Database, computedAt = new Date()): Promise<number> {
  const corpus = await readCompleteBenchmarkCorpus(db, computedAt);
  const snapshots = computeBenchmarks(corpus);
  if (snapshots.length === 0) return 0;
  await db
    .insert(benchmarkSnapshot)
    .values(
      snapshots.map((snapshot) => ({
        id: `${computedAt.getTime()}:${PRICING_INTELLIGENCE_RUBRIC_ID}:${snapshot.cohort}`,
        rubricId: PRICING_INTELLIGENCE_RUBRIC_ID,
        cohort: snapshot.cohort,
        computedAt,
        pageCount: snapshot.pageCount,
        choiceShares: snapshot.choiceShares,
        signalCounts: snapshot.signalCounts,
        signalShares: snapshot.signalShares,
        numericPrices: snapshot.numericPrices,
      })),
    )
    .onConflictDoNothing({
      target: [benchmarkSnapshot.rubricId, benchmarkSnapshot.cohort, benchmarkSnapshot.computedAt],
    });
  return snapshots.length;
}
