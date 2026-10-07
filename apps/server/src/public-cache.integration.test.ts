import { createRequire } from "node:module";
import { RPCHandler } from "@orpc/server/fetch";
import { CacheError, TieredStore } from "@unkey/cache";
import { directoryRouter } from "@pricelog/api/routers/directory";
import { PUBLIC_CACHE_POLICIES } from "@pricelog/api/public-cache";
import { initLogger, type WideEvent } from "evlog";
import { evlog } from "evlog/hono";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createContext } from "./context";

const { select, database } = vi.hoisted(() => {
  const select = vi.fn();
  return { select, database: { select } };
});

vi.mock("./env.server", () => ({ ENV: { PAGE_OPERATOR_EMAILS: "" } }));
vi.mock("./services", () => ({ getDb: () => database, createAuth: vi.fn() }));
vi.mock("./pricing/service", () => ({ pageMonitorService: {} }));

const require = createRequire(import.meta.url);
const commonJs: typeof import("@unkey/cache") = require("@unkey/cache");

function queryResult(result: Promise<unknown>) {
  const query = {
    from: () => query,
    innerJoin: () => query,
    where: () => query,
    orderBy: () => query,
    limit: () => result,
    then: result.then.bind(result),
  };
  return query;
}

function integrationHarness() {
  const entries = new Map<string, Response>();
  const pending: Promise<unknown>[] = [];
  const events: WideEvent[] = [];
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
  initLogger({
    silent: true,
    drain: ({ event }) => {
      events.push(structuredClone(event));
    },
  });
  const app = new Hono();
  const handler = new RPCHandler({ directory: directoryRouter });
  app.use(evlog());
  app.post("/rpc/directory/cards", async (context) => {
    const apiContext = await createContext({ context });
    const result = await handler.handle(context.req.raw, { prefix: "/rpc", context: apiContext });
    return result.matched ? result.response : context.notFound();
  });

  return {
    events,
    put,
    async call(input: unknown, requestId = "request") {
      return app.fetch(
        new Request("https://api.example.com/rpc/directory/cards", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-request-id": requestId },
          body: JSON.stringify({ json: input }),
        }),
        {},
        { waitUntil: (task) => pending.push(task), passThroughOnException() {} },
      );
    },
    async drain() {
      while (pending.length) await Promise.all(pending.splice(0));
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-07T12:00:00Z"));
  select.mockReset();
  select.mockImplementation((columns: Record<string, unknown>) =>
    queryResult(Promise.resolve("value" in columns ? [{ value: 0 }] : [])),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  initLogger({ silent: true, drain() {} });
});

describe("directory RPC cache integration", () => {
  it("rejects invalid null input before and after warming the default result", async () => {
    const harness = integrationHarness();
    expect((await harness.call(null)).status).toBe(400);
    const warm = await harness.call(undefined);
    expect(warm.status).toBe(200);
    expect(await warm.json()).toEqual({ json: { items: [], total: 0, nextCursor: null } });
    await harness.drain();

    expect((await harness.call(null)).status).toBe(400);
    expect(select).toHaveBeenCalledTimes(2);
  });

  it("shares results for equivalent trimmed and defaulted input", async () => {
    const harness = integrationHarness();
    const first = await harness.call({ search: " botpress ", unused: "ignored" });
    expect(first.status).toBe(200);
    await harness.drain();
    const second = await harness.call({ limit: 25, search: "botpress" });
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ json: { items: [], total: 0, nextCursor: null } });
    expect(select).toHaveBeenCalledTimes(2);
  });

  it("reports a Cache API write rejection while returning the source response", async () => {
    const harness = integrationHarness();
    harness.put.mockRejectedValue(new Error("Cache API put refused"));
    const response = await harness.call({ limit: 25 }, "request-put");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ json: { items: [], total: 0, nextCursor: null } });
    await harness.drain();

    expect(harness.events).toContainEqual(
      expect.objectContaining({
        operation: "public-cache.failure",
        _parentRequestId: "request-put",
        error: expect.objectContaining({ message: "Cache API put refused" }),
      }),
    );
  });

  it("reports stale refresh errors after the response through a separate logger", async () => {
    const harness = integrationHarness();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await harness.call({ limit: 25 }, "request-warm");
    await harness.drain();
    vi.advanceTimersByTime(PUBLIC_CACHE_POLICIES.directory.fresh + 1);

    let reject: ((error: Error) => void) | undefined;
    const refresh = new Promise<never>((_, rejectRefresh) => {
      reject = rejectRefresh;
    });
    select.mockImplementation(() => queryResult(refresh));
    const response = await harness.call({ limit: 25 }, "request-stale");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ json: { items: [], total: 0, nextCursor: null } });

    reject?.(new Error("Directory refresh failed"));
    await harness.drain();
    expect(harness.events).toContainEqual(
      expect.objectContaining({
        operation: "public-cache.failure",
        _parentRequestId: "request-stale",
        error: expect.objectContaining({ message: "Directory refresh failed" }),
      }),
    );
    expect(warn).not.toHaveBeenCalled();
  });
});

describe.each([
  ["ESM", TieredStore, CacheError],
  ["CommonJS", commonJs.TieredStore, commonJs.CacheError],
] as const)("Unkey %s mutation results", (_, Store, ErrorType) => {
  it("returns the first store error when set resolves with an Err result", async () => {
    const error = new ErrorType({ tier: "test", key: "cards", message: "Store write failed" });
    const store = new Store<string, unknown>({ waitUntil() {} }, [
      {
        name: "test",
        get: async () => ({ val: undefined }),
        set: async () => ({ err: error }),
        remove: async () => ({ val: undefined }),
      },
    ]);
    expect(
      await store.set("directory", "cards", {
        value: "cards",
        freshUntil: Date.now() + 1_000,
        staleUntil: Date.now() + 2_000,
      }),
    ).toEqual({ err: error });
  });

  it("returns the first store error when remove resolves with an Err result", async () => {
    const error = new ErrorType({ tier: "test", key: "cards", message: "Store removal failed" });
    const store = new Store<string, unknown>({ waitUntil() {} }, [
      {
        name: "test",
        get: async () => ({ val: undefined }),
        set: async () => ({ val: undefined }),
        remove: async () => ({ err: error }),
      },
    ]);
    expect(await store.remove("directory", "cards")).toEqual({ err: error });
  });
});
