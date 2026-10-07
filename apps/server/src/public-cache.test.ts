import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CloudflareStore } from "@unkey/cache/stores";
import { PUBLIC_CACHE_POLICIES, publicCacheKey } from "@pricelog/api/public-cache";
import { createPublicCache, isPublicDirectoryRequest } from "./public-cache";
import { createProcedureClient, ORPCError, os } from "@orpc/server";
import { publicCacheMiddleware } from "@pricelog/api";
import type { Context } from "@pricelog/api/context";
import { z } from "zod";

function cacheHarness() {
  const entries = new Map<string, Response>();
  const pending: Promise<unknown>[] = [];
  const put = vi.fn(async (request: Request, response: Response) => {
    entries.set(request.url, response.clone());
  });
  vi.stubGlobal("caches", {
    default: {
      match: async (request: Request) => entries.get(request.url)?.clone(),
      put,
      delete: async (request: Request) => entries.delete(request.url),
    },
  });
  return {
    cache: createPublicCache(
      { waitUntil: (task) => pending.push(task) },
      "api.example.com",
      vi.fn(),
    ),
    entries,
    put,
    drain: async () => {
      while (pending.length) await Promise.all(pending.splice(0));
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-07T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("public Unkey cache", () => {
  it("serves fresh entries without loading their source and preserves dates", async () => {
    const harness = cacheHarness();
    const load = vi.fn(async () => ({ pages: 106, scannedAt: new Date() }));
    await harness.cache.directory.swr("overview", load);
    await harness.drain();

    const result = await harness.cache.directory.swr("overview", load);
    expect(result.val).toEqual({ pages: 106, scannedAt: new Date() });
    expect(load).toHaveBeenCalledTimes(1);
    expect(harness.put.mock.calls[0]?.[1].headers.get("Cache-Control")).toBe(
      "public, max-age=86400",
    );
  });

  it("returns stale data while its callback refreshes in the background", async () => {
    const harness = cacheHarness();
    await harness.cache.directory.swr("cards", async () => "old");
    await harness.drain();
    vi.advanceTimersByTime(PUBLIC_CACHE_POLICIES.directory.fresh + 1);

    let finish: ((value: string) => void) | undefined;
    const refresh = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );
    const stale = await harness.cache.directory.swr("cards", refresh);
    expect(stale.val).toBe("old");
    expect(refresh).toHaveBeenCalledTimes(1);

    finish?.("new");
    await harness.drain();
    expect((await harness.cache.directory.swr("cards", refresh)).val).toBe("new");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("loads the source after the maximum age without requiring a purge token", async () => {
    const harness = cacheHarness();
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await harness.cache.directory.swr("cards", async () => "old");
    await harness.drain();
    vi.advanceTimersByTime(PUBLIC_CACHE_POLICIES.directory.stale + 1);

    expect((await harness.cache.directory.swr("cards", async () => "new")).val).toBe("new");
    await harness.drain();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("uses the correct global purge endpoint when credentials are supplied", async () => {
    cacheHarness();
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetch);
    const store = new CloudflareStore({
      domain: "api.example.com",
      zoneId: "zone",
      cloudflareApiKey: "test-token",
    });
    expect((await store.remove("directory", "overview")).err).toBeFalsy();
    expect(fetch.mock.calls[0]?.[0]).toBe(
      "https://api.cloudflare.com/client/v4/zones/zone/purge_cache",
    );
  });

  it("separates filters, cursors, routes, and reporting weeks", async () => {
    const key = await publicCacheKey(["directory", "cards"], { limit: 50 }, "directory");
    expect(
      await publicCacheKey(["directory", "cards"], { limit: 50, cohort: "coding" }, "directory"),
    ).not.toBe(key);
    expect(
      await publicCacheKey(
        ["directory", "cards"],
        { limit: 50, cursor: { id: "next", createdAt: 1 } },
        "directory",
      ),
    ).not.toBe(key);
    expect(await publicCacheKey(["directory", "list"], { limit: 50 }, "directory")).not.toBe(key);
    const week = await publicCacheKey(["directory", "weeklyChanges"], null, "weekly");
    vi.setSystemTime(new Date("2026-10-12T00:00:00Z"));
    expect(await publicCacheKey(["directory", "weeklyChanges"], null, "weekly")).not.toBe(week);
  });
});

describe("public request classification", () => {
  it("permits only public directory reads to omit the session lookup", () => {
    expect(
      isPublicDirectoryRequest(
        new Request("https://api.example.com/rpc/directory/cards", { method: "POST" }),
      ),
    ).toBe(true);
    expect(
      isPublicDirectoryRequest(
        new Request("https://api.example.com/api-reference/directory/overview"),
      ),
    ).toBe(true);
    expect(
      isPublicDirectoryRequest(
        new Request("https://api.example.com/rpc/pages/listOwned", { method: "POST" }),
      ),
    ).toBe(false);
    expect(
      isPublicDirectoryRequest(new Request("https://api.example.com/api/auth/get-session")),
    ).toBe(false);
    expect(
      isPublicDirectoryRequest(
        new Request("https://api.example.com/rpc/directory/cards", { method: "DELETE" }),
      ),
    ).toBe(false);
  });
});

describe("cached public procedures", () => {
  it("returns stale procedure output while the handler refreshes it", async () => {
    const harness = cacheHarness();
    const load = vi.fn(async () => "old");
    const procedure = os
      .$context<Pick<Context, "publicCache">>()
      .use(publicCacheMiddleware("directory"))
      .handler(load);
    const call = createProcedureClient(procedure, { context: { publicCache: harness.cache } });
    expect(await call()).toBe("old");
    await harness.drain();
    vi.advanceTimersByTime(PUBLIC_CACHE_POLICIES.directory.fresh + 1);

    let finish: ((value: string) => void) | undefined;
    load.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );
    expect(await call()).toBe("old");
    expect(load).toHaveBeenCalledTimes(2);
    finish?.("new");
    await harness.drain();
    expect(await call()).toBe("new");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("shares public results and validates input before running the source", async () => {
    const harness = cacheHarness();
    const load = vi.fn(async (limit: number) => ({ limit, pages: 106 }));
    const procedure = os
      .$context<Pick<Context, "publicCache">>()
      .input(z.object({ limit: z.number().min(1).max(50) }))
      .use(publicCacheMiddleware("directory"))
      .handler(({ input }) => load(input.limit));
    const call = createProcedureClient(procedure, { context: { publicCache: harness.cache } });

    expect(await call({ limit: 50 })).toEqual({ limit: 50, pages: 106 });
    await harness.drain();
    expect(await call({ limit: 50 })).toEqual({ limit: 50, pages: 106 });
    expect(load).toHaveBeenCalledTimes(1);
    await expect(call({ limit: 0 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("loads the source if the cache is unavailable", async () => {
    const harness = cacheHarness();
    vi.stubGlobal("caches", {
      default: {
        match: async () => {
          throw new Error("Cache unavailable");
        },
      },
    });
    const load = vi.fn(async () => "available");
    const procedure = os
      .$context<Pick<Context, "publicCache">>()
      .use(publicCacheMiddleware("directory"))
      .handler(load);
    const call = createProcedureClient(procedure, { context: { publicCache: harness.cache } });
    expect(await call()).toBe("available");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("preserves source errors without retrying or caching them", async () => {
    const harness = cacheHarness();
    const load = vi.fn(async () => {
      throw new ORPCError("NOT_FOUND");
    });
    const procedure = os
      .$context<Pick<Context, "publicCache">>()
      .use(publicCacheMiddleware("directory"))
      .handler(load);
    const call = createProcedureClient(procedure, { context: { publicCache: harness.cache } });
    await expect(call()).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(load).toHaveBeenCalledTimes(1);
    expect(harness.put).not.toHaveBeenCalled();
  });
});
