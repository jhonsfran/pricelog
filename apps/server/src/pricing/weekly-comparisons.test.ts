import { describe, expect, it } from "vitest";
import { archiveInput, historyDatabase } from "@pricelog/api/pricing-history-test-fixtures";
import type { PublishedSnapshot } from "@pricelog/db/pricing-snapshot";
import { runWeeklyComparisons } from "./weekly-comparisons";

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

async function corpus(fixture: ReturnType<typeof historyDatabase>) {
  for (const pageId of ["page", "other"]) {
    for (const [week, date, amount] of [
      ["before", "2026-09-10", 80],
      ["after", "2026-09-17", 90],
    ] as const) {
      const input = archiveInput(`${pageId}-${week}`, Date.parse(date));
      input.pageId = pageId;
      input.analysis!.evaluation.snapshot = snapshot(amount);
      await fixture.repo.archive(input);
    }
    await fixture.repo.writeImport(pageId, {
      sourceIdentity: pageId,
      checkpoint: null,
      expectedCount: 0,
      importedCount: 0,
      ready: true,
    });
  }
}

describe("weekly comparisons", () => {
  it("diffs real D1 pairs without a model and keeps missing source retryable", async () => {
    const fixture = historyDatabase();
    try {
      await corpus(fixture);
      const result = await runWeeklyComparisons(
        fixture.db,
        async (key) =>
          key === "page-before.md"
            ? null
            : key.endsWith("before.md")
              ? "## Starter\n$80/month"
              : "## Starter\n$90/month",
        new Date("2026-09-21"),
      );
      expect(result).toMatchObject({
        processed: 1,
        pending: 1,
        failures: [
          {
            pageId: "page",
            runId: "page-after",
            message: "Missing captured page for weekly comparison page-after",
          },
        ],
      });
      const history = await fixture.repo.getWeeklyHistory("other", Date.parse("2026-09-21"));
      expect(history.comparisons[0]).toMatchObject({
        beforeAnalysisId: "initial:page:other-before",
        afterAnalysisId: "initial:page:other-after",
        status: "reviewed",
        model: null,
        changes: [{ kind: "commercial", beforeLabel: "$80/month", afterLabel: "$90/month" }],
      });
    } finally {
      fixture.sqlite.close();
    }
  });

  it("stores a comparison made during a selection race but serves only the current analysis pair", async () => {
    const fixture = historyDatabase();
    try {
      await corpus(fixture);
      const input = archiveInput("page-after", Date.parse("2026-09-17"));
      const correction = {
        ...input.analysis!,
        id: "corrected-after",
        idempotencyKey: "correction",
        evaluation: { ...input.analysis!.evaluation, snapshot: snapshot(95) },
      };
      await fixture.repo.appendAnalysis("page", correction, input.rubrics[0]!);
      let changed = false;
      await runWeeklyComparisons(
        fixture.db,
        async (key) => {
          if (!changed) {
            changed = true;
            await fixture.repo.selectAnalysis(
              "page",
              "page-after",
              correction.id,
              input.analysis!.id,
            );
          }
          return key.endsWith("before.md") ? "## Starter\n$80/month" : "## Starter\n$90/month";
        },
        new Date("2026-09-21"),
      );
      expect(
        fixture.sqlite
          .prepare("SELECT count(*) AS count FROM history_comparison WHERE page_id='page'")
          .get()?.count,
      ).toBe(1);
      const history = await fixture.repo.getWeeklyHistory("page", Date.parse("2026-09-21"));
      expect(history.observations[1]?.analysisId).toBe("corrected-after");
      expect(history.comparisons).toEqual([]);
    } finally {
      fixture.sqlite.close();
    }
  });
});
