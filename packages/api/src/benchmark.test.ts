import { describe, expect, it } from "vitest";

import {
  AI_NATIVE_COHORT,
  ALL_COHORT,
  buildBenchmarkSnapshots,
  cohortLabel,
  cohortsForPage,
  COHORT_MINIMUM,
  OVERALL_SCORE_KEY,
  peerCohortForPage,
  percentileRank,
  publishableCohorts,
  selectCohort,
  summarizeDistribution,
  type BenchmarkPage,
} from "./benchmark";

function makePage(overrides: Partial<BenchmarkPage> = {}): BenchmarkPage {
  return {
    overallScore: 50,
    scores: [{ key: "cost_predictability", score: 50 }],
    choices: [{ key: "primary_market", choice: "developer_tools" }],
    signals: [
      { key: "is_ai_native", probability: 0.95 },
      { key: "market_developer_tools", probability: 0.9 },
    ],
    ...overrides,
  } as BenchmarkPage;
}

describe("cohorts", () => {
  it("places a page in every cohort it materially belongs to", () => {
    const cohorts = cohortsForPage(
      makePage({
        signals: [
          { key: "is_ai_native", probability: 0.95 },
          { key: "market_developer_tools", probability: 0.9 },
          { key: "market_data_analytics", probability: 0.85 },
        ],
      } as Partial<BenchmarkPage>),
    );
    expect(cohorts).toEqual([
      ALL_COHORT,
      AI_NATIVE_COHORT,
      "market:developer_tools",
      "market:data_analytics",
    ]);
  });

  it("ignores signals below the tag threshold rather than guessing", () => {
    const cohorts = cohortsForPage(
      makePage({
        signals: [
          { key: "is_ai_native", probability: 0.4 },
          { key: "market_finance", probability: 0.79 },
        ],
      } as Partial<BenchmarkPage>),
    );
    expect(cohorts).toEqual([ALL_COHORT]);
  });

  it("labels a market cohort from the shared signal catalog", () => {
    expect(cohortLabel("market:developer_tools")).toBe("Developer tools");
    expect(cohortLabel(ALL_COHORT)).toBe("All indexed pages");
    expect(cohortLabel(AI_NATIVE_COHORT)).toBe("AI-native products");
  });
});

describe("peer cohort", () => {
  it("prefers the page's own primary market", () => {
    const publishable = new Set([ALL_COHORT, AI_NATIVE_COHORT, "market:developer_tools"]);
    expect(peerCohortForPage(makePage(), publishable)).toBe("market:developer_tools");
  });

  it("falls back when the primary market cohort is too small to publish", () => {
    const publishable = new Set([ALL_COHORT, AI_NATIVE_COHORT]);
    expect(peerCohortForPage(makePage(), publishable)).toBe(AI_NATIVE_COHORT);
  });

  it("never compares a page against a cohort it does not belong to", () => {
    const page = makePage({
      choices: [{ key: "primary_market", choice: "finance" }],
      signals: [{ key: "market_finance", probability: 0.2 }],
    } as Partial<BenchmarkPage>);
    const publishable = new Set([ALL_COHORT, "market:finance"]);
    expect(peerCohortForPage(page, publishable)).toBe(ALL_COHORT);
  });

  it("returns null when nothing is publishable", () => {
    expect(peerCohortForPage(makePage(), new Set())).toBeNull();
  });
});

describe("distributions", () => {
  it("summarizes quartiles and a histogram", () => {
    const distribution = summarizeDistribution([10, 20, 30, 40, 50]);
    expect(distribution.count).toBe(5);
    expect(distribution.min).toBe(10);
    expect(distribution.max).toBe(50);
    expect(distribution.median).toBe(30);
    expect(distribution.p25).toBe(20);
    expect(distribution.p75).toBe(40);
    expect(distribution.histogram).toHaveLength(20);
    expect(distribution.histogram.reduce((sum: number, count: number) => sum + count, 0)).toBe(5);
  });

  it("handles a single value without dividing by zero", () => {
    const distribution = summarizeDistribution([72]);
    expect(distribution).toMatchObject({ count: 1, min: 72, max: 72, median: 72, p75: 72 });
  });

  it("returns an empty distribution rather than throwing", () => {
    expect(summarizeDistribution([])).toMatchObject({ count: 0, median: 0 });
  });

  it("clamps out-of-range values into the histogram", () => {
    const distribution = summarizeDistribution([-5, 105]);
    expect(distribution.histogram[0]).toBe(1);
    expect(distribution.histogram[19]).toBe(1);
  });
});

describe("percentile rank", () => {
  it("places a value against its cohort", () => {
    const distribution = summarizeDistribution([10, 20, 30, 40, 50, 60, 70, 80, 90, 95]);
    expect(percentileRank(distribution, 95)!).toBeGreaterThan(percentileRank(distribution, 20)!);
    expect(percentileRank(distribution, 10)!).toBeLessThan(50);
  });

  it("puts a tied cluster mid-band instead of at an edge", () => {
    const distribution = summarizeDistribution([50, 50, 50, 50]);
    expect(percentileRank(distribution, 50)).toBe(50);
  });

  it("returns null for an empty cohort", () => {
    expect(percentileRank(summarizeDistribution([]), 50)).toBeNull();
  });
});

describe("snapshots", () => {
  const pages = [
    makePage({ overallScore: 80, scores: [{ key: "cost_predictability", score: 80 }] }),
    makePage({ overallScore: 40, scores: [{ key: "cost_predictability", score: 40 }] }),
    makePage({
      overallScore: 60,
      scores: [{ key: "cost_predictability", score: 60 }],
      choices: [
        { key: "primary_market", choice: "finance" },
        { key: "value_metric", choice: "seat" },
      ],
      signals: [{ key: "market_finance", probability: 0.9 }],
    } as Partial<BenchmarkPage>),
  ];

  it("builds one snapshot per cohort, largest first", () => {
    const snapshots = buildBenchmarkSnapshots(pages);
    expect(snapshots[0]).toMatchObject({ cohort: ALL_COHORT, pageCount: 3 });
    expect(snapshots.map((snapshot) => snapshot.cohort)).toContain("market:finance");
  });

  it("charts the composite score alongside every dimension", () => {
    const [all] = buildBenchmarkSnapshots(pages);
    expect(all!.scoreDistributions[OVERALL_SCORE_KEY]).toMatchObject({ count: 3, median: 60 });
    expect(all!.scoreDistributions.cost_predictability).toMatchObject({ count: 3, median: 60 });
  });

  it("omits a dimension no page in the cohort answered", () => {
    const [all] = buildBenchmarkSnapshots(pages);
    expect(all!.scoreDistributions.expansion_readiness).toBeUndefined();
  });

  it("counts choice answers against the pages that actually answered", () => {
    const [all] = buildBenchmarkSnapshots(pages);
    expect(all!.choiceShares.primary_market).toEqual({
      answered: 3,
      options: { developer_tools: 2, finance: 1 },
    });
    expect(all!.choiceShares.value_metric).toEqual({ answered: 1, options: { seat: 1 } });
  });

  it("counts only signals the page actually states", () => {
    const [all] = buildBenchmarkSnapshots(pages);
    expect(all!.signalCounts.is_ai_native).toBe(2);
    expect(all!.signalCounts.market_finance).toBe(1);
    expect(all!.signalCounts.has_spend_cap).toBe(0);
  });

  it("suppresses cohorts too small to publish", () => {
    const publishable = publishableCohorts(buildBenchmarkSnapshots(pages));
    expect(publishable.size).toBe(0);
    const many = Array.from({ length: COHORT_MINIMUM }, () => makePage());
    expect(publishableCohorts(buildBenchmarkSnapshots(many)).has(ALL_COHORT)).toBe(true);
  });
});

describe("cohort selection", () => {
  const snapshots = buildBenchmarkSnapshots(
    Array.from({ length: COHORT_MINIMUM }, () => makePage()),
  );
  const publishable = publishableCohorts(snapshots);

  it("returns the requested cohort when it is publishable", () => {
    expect(selectCohort(snapshots, publishable, ALL_COHORT)?.cohort).toBe(ALL_COHORT);
  });

  it("returns null rather than answering with a cohort the reader did not ask for", () => {
    expect(selectCohort(snapshots, new Set([ALL_COHORT]), "market:finance")).toBeNull();
    expect(selectCohort(snapshots, publishable, "market:finance")).toBeNull();
  });
});
