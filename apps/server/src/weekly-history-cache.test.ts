import type { Context } from "@pricelog/api/context";
import type { readWeeklyHistory } from "@pricelog/api/pricing-history-store";
import { directoryRouter } from "@pricelog/api/routers/directory";
import type { Database } from "@pricelog/db";
import { call } from "@orpc/server";
import { MemoryStore } from "@unkey/cache/stores";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createWeeklyHistoryCache, WeeklyHistoryCloudflareStore } from "./weekly-history-cache";

type WeeklyHistory = Awaited<ReturnType<typeof readWeeklyHistory>>;

function history(id: string): WeeklyHistory {
  return {
    observations: [],
    comparisons: [
      {
        id,
        beforeRunId: "before",
        afterRunId: "after",
        verifierVersion: "snapshot-diff-v1",
        model: null,
        status: "reviewed",
        changes: [],
        createdAt: new Date("2026-09-24T12:00:00Z"),
      },
    ],
  };
}

function cacheHarness() {
  const pending: Promise<unknown>[] = [];
  const store = new MemoryStore<string, WeeklyHistory>({ persistentMap: new Map() });
  const cache = () => createWeeklyHistoryCache((promise) => pending.push(promise), [store]);
  const drain = async () => {
    while (pending.length > 0) await Promise.all(pending.splice(0));
  };
  return { cache, drain };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("weekly history SWR", () => {
  it("coalesces concurrent cold reads in one Worker instance", async () => {
    const { cache, drain } = cacheHarness();
    const periodEnd = new Date("2026-09-28T00:00:00Z");
    let release!: (value: WeeklyHistory) => void;
    const origin = new Promise<WeeklyHistory>((resolve) => (release = resolve));
    const load = vi.fn(() => origin);

    const first = cache().getOrLoad(periodEnd, load);
    const second = cache().getOrLoad(periodEnd, load);
    release(history("shared"));

    expect((await first).comparisons[0]?.id).toBe("shared");
    expect((await second).comparisons[0]?.id).toBe("shared");
    expect(load).toHaveBeenCalledTimes(1);
    await drain();
  });

  it("shares one origin read across two cohort requests", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-29T12:00:00Z"));
    const { cache, drain } = cacheHarness();
    const page = {
      id: "one",
      normalizedDomain: "one.com",
      slug: "one",
      displayName: "One",
    };
    let offset = 0;
    const query = {
      from: () => query,
      where: () => query,
      orderBy: () => query,
      limit: async () => (offset++ === 0 ? [page] : []),
    };
    const getWeeklyHistory = vi.fn(async () => ({
      observations: [
        {
          pageId: page.id,
          runId: "run-one",
          rubricId: "rubric",
          model: "jev-1.13.0",
          capturedAt: new Date("2026-09-24T12:00:00Z"),
          contentKey: "content",
          contentSha256: "hash",
          choices: [{ key: "product_category", choice: "coding_assistants" }],
          signals: [],
        },
      ],
      comparisons: [],
    }));
    const context = {
      db: { select: () => query } as unknown as Database,
      pageMonitor: { getWeeklyHistory },
      session: null,
      weeklyHistoryCache: cache(),
    } as unknown as Context;

    const all = await call(directoryRouter.weeklyChanges, { cohort: "all" }, { context });
    await drain();
    context.weeklyHistoryCache = cache();
    const other = await call(
      directoryRouter.weeklyChanges,
      { cohort: "category:app_builders" },
      { context },
    );

    expect(all.newPages).toBe(1);
    expect(other.newPages).toBe(0);
    expect(getWeeklyHistory).toHaveBeenCalledTimes(1);
  });

  it("serves stale history after one hour and refreshes it in the background", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-29T12:00:00Z"));
    const { cache, drain } = cacheHarness();
    const periodEnd = new Date("2026-09-28T00:00:00Z");
    const load = vi
      .fn()
      .mockResolvedValueOnce(history("old"))
      .mockResolvedValueOnce(history("new"));

    expect((await cache().getOrLoad(periodEnd, load)).comparisons[0]?.id).toBe("old");
    await drain();
    vi.setSystemTime(new Date("2026-09-29T13:00:01Z"));
    expect((await cache().getOrLoad(periodEnd, load)).comparisons[0]?.id).toBe("old");
    await drain();
    expect((await cache().getOrLoad(periodEnd, load)).comparisons[0]?.id).toBe("new");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("blocks on the origin after 24 hours and uses a new key on Monday", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-29T12:00:00Z"));
    const { cache, drain } = cacheHarness();
    const periodEnd = new Date("2026-09-28T00:00:00Z");
    await cache().getOrLoad(periodEnd, async () => history("old"));
    await drain();

    vi.setSystemTime(new Date("2026-09-30T12:00:01Z"));
    let release!: (value: WeeklyHistory) => void;
    const origin = new Promise<WeeklyHistory>((resolve) => (release = resolve));
    const pending = cache().getOrLoad(periodEnd, () => origin);
    let completed = false;
    void pending.then(() => (completed = true));
    await Promise.resolve();
    expect(completed).toBe(false);
    release(history("expired-refresh"));
    expect((await pending).comparisons[0]?.id).toBe("expired-refresh");
    await drain();

    vi.setSystemTime(new Date("2026-10-05T00:00:00Z"));
    const newWeek = await cache().getOrLoad(new Date("2026-10-05T00:00:00Z"), async () =>
      history("new-week"),
    );
    expect(newWeek.comparisons[0]?.id).toBe("new-week");
  });
});

it("stores Cloudflare entries with bounded TTL and Date values", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-29T12:00:00Z"));
  const entries = new Map<string, Response>();
  const edge = {
    match: async (request: Request) => entries.get(request.url)?.clone(),
    put: async (request: Request, response: Response) => {
      entries.set(request.url, response.clone());
    },
    delete: async (request: Request) => entries.delete(request.url),
  };
  const open = vi.fn(async () => edge);
  vi.stubGlobal("caches", { open });
  const memory = new MemoryStore<string, WeeklyHistory>({ persistentMap: new Map() });
  const store = new WeeklyHistoryCloudflareStore(memory);
  const entry = {
    value: history("date-roundtrip"),
    freshUntil: Date.now() + 60 * 60 * 1_000,
    staleUntil: Date.now() + 24 * 60 * 60 * 1_000,
  };

  expect((await store.set("weeklyHistory", "v1:2026-09-28", entry)).err).toBeUndefined();
  expect(open).toHaveBeenCalledWith("pricelog-weekly-history-v1");
  const [url, response] = [...entries.entries()][0]!;
  expect(url).toContain("/__internal-cache/");
  expect(response.headers.get("Cache-Control")).toBe("public, max-age=86400");
  const cached = await store.get("weeklyHistory", "v1:2026-09-28");
  expect(cached.val?.value.comparisons[0]?.createdAt).toEqual(new Date("2026-09-24T12:00:00Z"));
  entries.clear();
  const backfilled = await memory.get("weeklyHistory", "v1:2026-09-28");
  expect(backfilled.val?.value.comparisons[0]?.id).toBe("date-roundtrip");
});

it("loads weekly history when the edge cache cannot be read", async () => {
  vi.stubGlobal("caches", { open: async () => Promise.reject(new Error("cache unavailable")) });
  const memory = new MemoryStore<string, WeeklyHistory>({ persistentMap: new Map() });
  const cache = createWeeklyHistoryCache(() => {}, [new WeeklyHistoryCloudflareStore(memory)]);
  const load = vi.fn(async () => history("origin"));

  const result = await cache.getOrLoad(new Date("2026-09-28T00:00:00Z"), load);

  expect(result.comparisons[0]?.id).toBe("origin");
  expect(load).toHaveBeenCalledTimes(1);
});
