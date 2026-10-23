import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { serveHistoryMigration } from "./history-operations";
import { migratePricingHistoryBatch } from "./pricing/history-migration";

const session = vi.hoisted(() => ({ value: null as { user: { email: string } } | null }));
vi.mock("./env.server", () => ({ ENV: { PAGE_OPERATOR_EMAILS: "operator@example.com" } }));
vi.mock("./services", () => ({
  getDb: () => ({}),
  createAuth: async () => ({ api: { getSession: async () => session.value } }),
}));
vi.mock("./pricing/service", () => ({ storeClient: vi.fn() }));
vi.mock("./pricing/history-migration", () => ({
  migratePricingHistoryBatch: vi.fn(async () => ({
    results: [],
    remainingPages: 0,
    nextCursor: null,
  })),
}));

describe("operator history migration route", () => {
  it("requires an operator and passes the bounded sweep cursor", async () => {
    const app = new Hono().post("/migrate", serveHistoryMigration);
    session.value = null;
    expect((await app.request("/migrate", { method: "POST" })).status).toBe(401);
    session.value = { user: { email: "owner@example.com" } };
    expect((await app.request("/migrate", { method: "POST" })).status).toBe(403);
    expect(migratePricingHistoryBatch).not.toHaveBeenCalled();
    session.value = { user: { email: "operator@example.com" } };
    const response = await app.request("/migrate?cursor=page-5", { method: "POST" });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ results: [], remainingPages: 0, nextCursor: null });
    expect(vi.mocked(migratePricingHistoryBatch).mock.calls.at(-1)?.[2]).toBe("page-5");
  });
});
