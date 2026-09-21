import { describe, expect, it, vi } from "vitest";
import type { Database } from "@my-better-t-app/db";
import type { Observation } from "@my-better-t-app/api/pricing-history";
import { activePageBatches } from "@my-better-t-app/api/pricing-history-store";
import { verifyChanges } from "./change-verification";
import { runWeeklyComparisons } from "./weekly-comparisons";

vi.mock("@my-better-t-app/api/pricing-history-store", () => ({
  activePageBatches: vi.fn(),
}));
vi.mock("./change-verification", () => ({ verifyChanges: vi.fn() }));

function observations(): Observation[] {
  return ["broken", "healthy"].flatMap((pageId) =>
    ["before", "after"].map((week) => ({
      pageId,
      runId: `${pageId}-${week}`,
      contentKey: `${pageId}-${week}`,
      contentSha256: week,
      rubricId: "pricing-intelligence-v4",
      model: "jev-1.13.0",
      name: pageId,
      slug: pageId,
      capturedAt: new Date(week === "before" ? "2026-09-10" : "2026-09-17"),
      choices: [],
      signals: [],
    })),
  );
}

describe("weekly comparison retries", () => {
  it.each(["missing source", "invalid answer"])(
    "continues after %s and leaves the failed pair retryable",
    async (failure) => {
      vi.mocked(activePageBatches).mockImplementation(async function* () {
        yield ["broken", "healthy"].map((id) => ({
          id,
          normalizedDomain: id,
          slug: id,
          displayName: id,
        }));
      });
      vi.mocked(verifyChanges).mockImplementation(async (pair) => {
        if (failure === "invalid answer" && pair.before.pageId === "broken")
          throw new Error("invalid choice");
        return { status: "reviewed", changes: [], model: "jev-1.13.0" };
      });
      const persistComparison = vi.fn().mockResolvedValue(undefined);
      const monitor = {
        getWeeklyHistory: async (_domain: string, id: string) => ({
          observations: observations().filter((row) => row.pageId === id),
          comparisons: [],
        }),
        persistComparison,
      };
      const db = {} as Database;
      const artifacts = {
        get: async (key: string) =>
          failure === "missing source" && key.startsWith("broken")
            ? null
            : { text: async () => "Source" },
      } as unknown as R2Bucket;
      const result = await runWeeklyComparisons(
        db,
        monitor,
        artifacts,
        vi.fn(),
        new Date("2026-09-21"),
      );
      expect(result).toMatchObject({
        processed: 1,
        pending: 1,
        failures: [{ runId: "broken-after" }],
      });
      expect(persistComparison).toHaveBeenCalledOnce();
      expect(persistComparison.mock.calls[0]?.[2]).toMatchObject({
        beforeRunId: "healthy-before",
        afterRunId: "healthy-after",
      });
    },
  );
});
