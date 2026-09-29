import { describe, expect, it, vi } from "vitest";
import type { Database } from "@pricelog/db";
import type { Observation } from "@pricelog/api/pricing-history";
import { activePageBatches } from "@pricelog/api/pricing-history-store";
import type { PublishedSnapshot } from "@pricelog/db/pricing-snapshot";
import { runWeeklyComparisons } from "./weekly-comparisons";

vi.mock("@pricelog/api/pricing-history-store", () => ({
  activePageBatches: vi.fn(),
}));

const snapshot = (amount: number): PublishedSnapshot => ({
  version: "pricing-snapshot-v4",
  status: "collected",
  offers: [
    {
      name: "Starter",
      prices: [
        {
          kind: "flat",
          price_raw: `$${amount}/month`,
          price_numeric: amount,
          period: "month",
          billing: "monthly",
          state: "default",
        },
      ],
    },
  ],
  features: [],
});

function observations(): Observation[] {
  return ["broken", "healthy"].flatMap((pageId) =>
    ["before", "after"].map((week) => ({
      pageId,
      runId: `${pageId}-${week}`,
      contentKey: `${pageId}-${week}`,
      contentSha256: week,
      rubricId: week === "before" ? "pricing-intelligence-v10" : "pricing-intelligence-v11",
      model: "jev-1.13.0",
      name: pageId,
      slug: pageId,
      capturedAt: new Date(week === "before" ? "2026-09-10" : "2026-09-17"),
      choices: [],
      signals: [],
      snapshot: snapshot(week === "before" ? 80 : 90),
    })),
  );
}

describe("weekly comparisons", () => {
  it("diffs paired snapshots without a model and keeps a failed page retryable", async () => {
    vi.mocked(activePageBatches).mockImplementation(async function* () {
      yield ["broken", "healthy"].map((id) => ({
        id,
        normalizedDomain: id,
        slug: id,
        displayName: id,
      }));
    });
    const persistComparison = vi.fn(
      async (_domain: string, pageId: string, _comparison: unknown) => {
        if (pageId === "broken") throw new Error("Run broken-after is not published");
      },
    );
    const monitor = {
      getWeeklyHistory: async (_domain: string, id: string) => ({
        observations: observations().filter((row) => row.pageId === id),
        comparisons: [],
      }),
      persistComparison,
    };
    const pages: Record<string, string> = {
      "healthy-before": "## Starter\n$80/month",
      "healthy-after": "## Starter\n$90/month",
      "broken-before": "## Starter\n$80/month",
      "broken-after": "## Starter\n$90/month",
    };
    const result = await runWeeklyComparisons(
      {} as Database,
      monitor,
      async (key) => pages[key] ?? null,
      new Date("2026-09-21"),
    );
    expect(result).toMatchObject({
      processed: 1,
      pending: 1,
      failures: [{ runId: "broken-after", message: "Run broken-after is not published" }],
    });
    expect(persistComparison.mock.calls[1]?.[2]).toMatchObject({
      id: "snapshot-diff-v1:healthy-before:healthy-after",
      verifierVersion: "snapshot-diff-v1",
      model: null,
      status: "reviewed",
      changes: [
        {
          key: "price:Starter:flat:monthly:month",
          label: "Starter monthly price",
          kind: "commercial",
          beforeLabel: "$80/month",
          afterLabel: "$90/month",
          beforeEvidence: "$80/month",
          afterEvidence: "$90/month",
        },
      ],
    });
  });
});
