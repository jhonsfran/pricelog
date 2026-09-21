import { describe, expect, it } from "vitest";
import {
  ALL_COHORT,
  AI_NATIVE_COHORT,
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
    expect(category.signalShares.charges_outcome).toEqual({
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
  it("keeps category membership and overlapping discovery tags separate", () => {
    expect(
      cohortsForPage(
        makePage({
          signals: [
            { key: "is_ai_native", probability: 0.9 },
            { key: "market_developer_tools", probability: 0.8 },
          ],
        }),
      ),
    ).toEqual([
      ALL_COHORT,
      "category:coding_assistants",
      AI_APPLICATIONS_COHORT,
      AI_NATIVE_COHORT,
      "market:developer_tools",
    ]);
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
    "excludes %s from applications even when AI-native is established",
    (choice) => {
      const cohorts = cohortsForPage(
        makePage({
          choices: [{ key: "product_category", choice }],
          signals: [{ key: "is_ai_native", probability: 0.99 }],
        }),
      );
      expect(cohorts).not.toContain(AI_APPLICATIONS_COHORT);
      expect(cohorts).toContain(AI_NATIVE_COHORT);
      expect(cohorts).toContain(ALL_COHORT);
    },
  );
  it("keeps model API and unclassified pages out of application denominators", () => {
    const pages = ["app_builders", "voice_agents", "model_apis", "other"].map((choice) =>
      makePage({ choices: [{ key: "product_category", choice }] }),
    );
    pages.push(makePage({ choices: [], signals: [{ key: "is_ai_native", probability: 1 }] }));
    const snapshots = buildBenchmarkSnapshots(pages);
    expect(snapshots.find((row) => row.cohort === ALL_COHORT)?.pageCount).toBe(5);
    expect(snapshots.find((row) => row.cohort === AI_APPLICATIONS_COHORT)?.pageCount).toBe(2);
    expect(snapshots.find((row) => row.cohort === "category:model_apis")?.pageCount).toBe(1);
    expect(
      snapshots.find((row) => row.cohort === AI_APPLICATIONS_COHORT)?.choiceShares.product_category,
    ).toEqual({ answered: 2, options: { app_builders: 1, voice_agents: 1 } });
  });
  it("retains nondisclosure and applicability counts without creating missing answers", () => {
    const pages = ["charged", "not_disclosed", "not_applicable"].map((choice) =>
      makePage({ choices: [{ key: "failed_run_policy", choice }] }),
    );
    pages.push(makePage({ choices: [] }));
    const all = buildBenchmarkSnapshots(pages).find((row) => row.cohort === ALL_COHORT)!;
    expect(all.choiceShares.failed_run_policy).toEqual({
      answered: 3,
      options: { charged: 1, not_disclosed: 1, not_applicable: 1 },
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
  it("labels categories and discovery cohorts", () => {
    expect(cohortLabel(AI_APPLICATIONS_COHORT)).toBe("AI applications");
    expect(cohortLabel("category:coding_assistants")).toBe("Coding assistants");
    expect(cohortLabel("market:developer_tools")).toBe("Developer tools");
  });
});
