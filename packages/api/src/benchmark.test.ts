import { describe, expect, it } from "vitest";
import { pricingSignalCoverage } from "./pricing-intelligence";
import {
  ALL_COHORT,
  AI_APPLICATIONS_COHORT,
  buildBenchmarkSnapshots,
  cohortsForPage,
  cohortLabel,
  type BenchmarkPage,
} from "./benchmark";
function makePage(overrides: Partial<BenchmarkPage> = {}): BenchmarkPage {
  return {
    choices: [{ key: "product_category", choice: "coding_assistants" }],
    signals: [],
    ...overrides,
  };
}
describe("pricing practice aggregation", () => {
  it("keeps 40 of 100 pages at 40% when the other observations become not established", () => {
    const before = Array.from({ length: 100 }, (_, index) =>
      makePage({
        signals: [{ key: "charges_direct_usage", probability: index < 40 ? 0.99 : 0.5 }],
      }),
    );
    const after = before.map((page, index) =>
      index < 40
        ? page
        : makePage({ signals: [{ key: "charges_direct_usage", probability: 0.1 }] }),
    );
    const coverage = [before, after].map((pages) => {
      const snapshot = buildBenchmarkSnapshots(pages).find((row) => row.cohort === ALL_COHORT)!;
      return pricingSignalCoverage(snapshot.pageCount, snapshot.signalShares.charges_direct_usage);
    });
    expect(coverage).toEqual([
      { stated: 40, notEstablished: 0, uncertain: 60, fraction: 0.4 },
      { stated: 40, notEstablished: 60, uncertain: 0, fraction: 0.4 },
    ]);
  });
  it("keeps overlapping charges and reconstructs every signal denominator", () => {
    const pages = [0.8, 0.2, 0.21, undefined].map((probability) =>
      makePage({
        signals: [
          { key: "charges_per_seat", probability: 0.99 },
          ...(probability === undefined
            ? []
            : [{ key: "charges_direct_usage" as const, probability }]),
        ],
      }),
    );
    const category = buildBenchmarkSnapshots(pages).find(
      (row) => row.cohort === "category:coding_assistants",
    )!;
    expect(category.signalShares.charges_direct_usage).toEqual({
      stated: 1,
      notEstablished: 1,
      uncertain: 2,
    });
    expect(category.signalShares.charges_per_seat).toEqual({
      stated: 4,
      notEstablished: 0,
      uncertain: 0,
    });
    expect(category.signalShares.charges_ai_addon).toEqual({
      stated: 0,
      notEstablished: 0,
      uncertain: 4,
    });
  });
  it.each(["unknown", "not_disclosed", "invented"])(
    "does not invent category membership for %s",
    (choice) => {
      expect(cohortsForPage(makePage({ choices: [{ key: "product_category", choice }] }))).toEqual([
        ALL_COHORT,
      ]);
    },
  );
  it("groups pages only by all pages and their product category", () => {
    expect(
      cohortsForPage(makePage({ signals: [{ key: "charges_per_seat", probability: 1 }] })),
    ).toEqual([ALL_COHORT, "category:coding_assistants", AI_APPLICATIONS_COHORT]);
  });
  it.each([
    "coding_assistants",
    "app_builders",
    "customer_support_agents",
    "voice_agents",
    "video_generation",
    "workflow_agent_builders",
    "sales_prospecting",
    "meeting_assistants",
  ])(
    "includes accepted %s pages in the application overview without an AI-native tag",
    (choice) => {
      const cohorts = cohortsForPage(makePage({ choices: [{ key: "product_category", choice }] }));
      expect(cohorts).toEqual([ALL_COHORT, `category:${choice}`, AI_APPLICATIONS_COHORT]);
      expect(cohorts.filter((cohort) => cohort.startsWith("category:"))).toHaveLength(1);
    },
  );
  it.each(["model_apis", "other", "not_disclosed", "unknown", "invented"])(
    "excludes %s from applications",
    (choice) => {
      const cohorts = cohortsForPage(makePage({ choices: [{ key: "product_category", choice }] }));
      expect(cohorts).not.toContain(AI_APPLICATIONS_COHORT);
      expect(cohorts).toContain(ALL_COHORT);
    },
  );
  it("keeps model API and unclassified pages out of application denominators", () => {
    const pages = ["app_builders", "voice_agents", "model_apis", "other"].map((choice) =>
      makePage({ choices: [{ key: "product_category", choice }] }),
    );
    pages.push(makePage({ choices: [], signals: [{ key: "has_free_plan", probability: 1 }] }));
    const snapshots = buildBenchmarkSnapshots(pages);
    expect(snapshots.find((row) => row.cohort === ALL_COHORT)?.pageCount).toBe(5);
    expect(snapshots.find((row) => row.cohort === AI_APPLICATIONS_COHORT)?.pageCount).toBe(2);
    expect(snapshots.find((row) => row.cohort === "category:model_apis")?.pageCount).toBe(1);
    expect(
      snapshots.find((row) => row.cohort === AI_APPLICATIONS_COHORT)?.choiceShares.product_category,
    ).toEqual({ answered: 2, options: { app_builders: 1, voice_agents: 1 } });
  });
  it("counts derived price disclosure answers without creating missing answers", () => {
    const pages = ["full", "partial", "none"].map((choice) =>
      makePage({ choices: [{ key: "price_disclosure", choice }] }),
    );
    pages.push(makePage({ choices: [] }));
    const all = buildBenchmarkSnapshots(pages).find((row) => row.cohort === ALL_COHORT)!;
    expect(all.choiceShares.price_disclosure).toEqual({
      answered: 3,
      options: { full: 1, partial: 1, none: 1 },
    });
    expect(all.pageCount).toBe(4);
    expect(all).not.toHaveProperty("scoreDistributions");
  });
  it("retains small category counts and returns no invented empty cohort", () => {
    expect(
      buildBenchmarkSnapshots([makePage()]).find(
        (row) => row.cohort === "category:coding_assistants",
      )?.pageCount,
    ).toBe(1);
    expect(buildBenchmarkSnapshots([])).toEqual([]);
  });
  it("labels categories", () => {
    expect(cohortLabel(AI_APPLICATIONS_COHORT)).toBe("AI applications");
    expect(cohortLabel("category:coding_assistants")).toBe("Coding assistants");
  });
});
