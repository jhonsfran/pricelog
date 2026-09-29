import { describe, expect, it, vi } from "vitest";
import type { Database } from "@pricelog/db";
import { readWeeklyHistory } from "./pricing-history-store";

function registry() {
  const pages = Array.from({ length: 45 }, (_, index) => ({
    id: `page-${index}`,
    normalizedDomain: `page-${index}.com`,
    slug: `page-${index}`,
    displayName: null,
  }));
  let offset = 0;
  const query = {
    from: () => query,
    where: () => query,
    orderBy: () => query,
    limit: async (size: number) => {
      const rows = pages.slice(offset, offset + size);
      offset += size;
      return rows;
    },
  };
  return { db: { select: () => query } as unknown as Database, pages };
}

describe("weekly history registry reads", () => {
  it("visits the full registry with at most 20 concurrent page reads", async () => {
    const { db, pages } = registry();
    let active = 0;
    let maximum = 0;
    const getWeeklyHistory = vi.fn(async (_domain: string, pageId: string) => {
      active++;
      maximum = Math.max(maximum, active);
      await Promise.resolve();
      active--;
      return {
        observations: [
          {
            pageId,
            runId: pageId,
            rubricId: "v4",
            model: "jev-1.13.0",
            capturedAt: new Date("2026-09-17"),
            contentKey: pageId,
            contentSha256: pageId,
            choices: [],
            signals: [],
          },
        ],
        comparisons: [],
      };
    });
    const result = await readWeeklyHistory(db, { getWeeklyHistory }, new Date("2026-09-21"));
    expect(result.observations).toHaveLength(pages.length);
    expect(result.observations.at(-1)?.name).toBe("page-44.com");
    expect(getWeeklyHistory).toHaveBeenCalledTimes(pages.length);
    expect(maximum).toBe(20);
  });

  it("does not publish partial coverage when one DO cannot be read", async () => {
    const { db } = registry();
    await expect(
      readWeeklyHistory(db, {
        getWeeklyHistory: async () => {
          throw new Error("Unavailable");
        },
      }),
    ).rejects.toThrow("Unavailable");
  });
});
