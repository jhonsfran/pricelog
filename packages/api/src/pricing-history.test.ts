import { describe, expect, it } from "vitest";
import {
  buildWeeklyReport,
  COMPARISON_VERSION,
  completedWeeks,
  pairWeeklyObservations,
  type Observation,
  type Comparison,
} from "./pricing-history";

const now = new Date("2026-09-21T12:00:00Z");
const SNAPSHOT = {
  version: "pricing-snapshot-v3" as const,
  status: "collected" as const,
  flags: {},
  offers: [],
  features: [],
};
function observation(
  runId: string,
  capturedAt: string,
  overrides: Partial<Observation> = {},
): Observation {
  return {
    runId,
    pageId: "page-1",
    rubricId: "v4",
    model: "jev-1.13.0",
    capturedAt: new Date(capturedAt),
    contentKey: runId,
    contentSha256: runId,
    choices: [],
    signals: [],
    snapshot: SNAPSHOT,
    pipeline: "pricing-snapshot-v3-aaaaaaaaaaaa",
    name: "Example",
    slug: "example",
    ...overrides,
  };
}
const before = observation("before", "2026-09-10T12:00:00Z");
const after = observation("after", "2026-09-17T12:00:00Z");
const change = {
  key: "failed_run_policy",
  label: "Failed runs",
  kind: "commercial" as const,
  beforeLabel: "Charged",
  afterLabel: "Not charged",
  beforeEvidence: "Failed runs are charged.",
  afterEvidence: "Failed runs are not charged.",
};
const comparison: Comparison = {
  id: "pair",
  beforeRunId: "before",
  afterRunId: "after",
  verifierVersion: COMPARISON_VERSION,
  status: "reviewed",
  changes: [change],
  model: "jev-1.13.0",
  createdAt: now,
};

describe("weekly pricing history", () => {
  it("uses completed Monday-to-Monday UTC weeks, including at the exact boundary", () => {
    expect(completedWeeks(new Date("2026-09-21T00:00:00Z"))).toEqual({
      periodEnd: new Date("2026-09-21T00:00:00Z"),
      periodStart: new Date("2026-09-14T00:00:00Z"),
      previousPeriodStart: new Date("2026-09-07T00:00:00Z"),
    });
  });
  it("selects the last capture per page per week and excludes the current week", () => {
    const latest = observation("later", "2026-09-20T23:59:59Z");
    const result = pairWeeklyObservations(
      [before, after, latest, observation("current", "2026-09-21T00:00:00Z")],
      "all",
      now,
    );
    expect(result.pairs).toEqual([{ before, after: latest }]);
  });
  it("reports missing, new, and incompatible pages outside paired coverage", () => {
    const result = pairWeeklyObservations(
      [
        before,
        { ...after, model: "jev-1.14.0" },
        observation("new", "2026-09-18T00:00:00Z", { pageId: "new" }),
        observation("missing", "2026-09-10T00:00:00Z", { pageId: "missing" }),
      ],
      "all",
      now,
    );
    expect(result).toMatchObject({ pairs: [], newPages: 1, missingPages: 1, incompatiblePages: 1 });
  });
  it("pairs current snapshots across pipeline and rubric changes but not older snapshot versions", () => {
    const changedPipeline = {
      ...after,
      rubricId: "v5",
      pipeline: "pricing-snapshot-v3-bbbbbbbbbbbb",
    };
    expect(pairWeeklyObservations([before, changedPipeline], "all", now).pairs).toEqual([
      { before, after: changedPipeline },
    ]);
    const older = {
      ...before,
      snapshot: { ...SNAPSHOT, version: "pricing-snapshot-v2" as unknown as "pricing-snapshot-v3" },
    };
    expect(pairWeeklyObservations([older, after], "all", now)).toMatchObject({
      pairs: [],
      incompatiblePages: 1,
    });
    expect(
      pairWeeklyObservations([{ ...before, snapshot: null }, after], "all", now).pairs,
    ).toEqual([]);
  });
  it("does not pair a page captured in another currency", () => {
    const inPounds = { ...after, snapshot: { ...SNAPSHOT, currency_visible: "GBP" } };
    const inEuros = { ...before, snapshot: { ...SNAPSHOT, currency_visible: "EUR" } };
    expect(pairWeeklyObservations([inEuros, inPounds], "all", now)).toMatchObject({
      pairs: [],
      incompatiblePages: 1,
    });
  });

  it("does not treat a floating model alias as a verified version", () => {
    expect(
      pairWeeklyObservations(
        [
          { ...before, model: "typesafe/jev" },
          { ...after, model: "typesafe/jev" },
        ],
        "all",
        now,
      ).pairs,
    ).toEqual([]);
  });
  it("counts each commercially changed page once and preserves every evidence item", () => {
    const report = buildWeeklyReport(
      [before, after],
      [{ ...comparison, changes: [change, { ...change, key: "another" }] }],
      "all",
      now,
    );
    expect(report).toMatchObject({
      pairedPages: 1,
      verifiedPages: 1,
      reviewedPages: 1,
      uncertainPages: 0,
    });
    expect(report.items).toHaveLength(2);
    expect(report.items[0]?.beforeSourceUrl).toBe("/api/public/pages/page-1/runs/before/source");
  });
  it("does not count a disclosure update as a commercial change", () => {
    const report = buildWeeklyReport(
      [before, after],
      [{ ...comparison, changes: [{ ...change, kind: "disclosure" }] }],
      "all",
      now,
    );
    expect(report).toMatchObject({ verifiedPages: 0, changedPages: 1 });
  });
  it("keeps unreviewed pairs uncertain and ignores comparisons of replaced captures", () => {
    const report = buildWeeklyReport(
      [before, after],
      [{ ...comparison, afterRunId: "older" }],
      "all",
      now,
    );
    expect(report).toMatchObject({
      pairedPages: 1,
      reviewedPages: 0,
      uncertainPages: 1,
      items: [],
    });
  });
  it("does not turn category entry into a within-category change", () => {
    const old = {
      ...before,
      choices: [
        {
          key: "product_category" as const,
          choice: "model_apis",
          confidence: 1,
          probabilities: { model_apis: 1 },
        },
      ],
    };
    const current = {
      ...after,
      choices: [
        {
          key: "product_category" as const,
          choice: "coding_assistants",
          confidence: 1,
          probabilities: { coding_assistants: 1 },
        },
      ],
    };
    expect(pairWeeklyObservations([old, current], "category:coding_assistants", now)).toMatchObject(
      { pairs: [], newPages: 1 },
    );
  });
});
