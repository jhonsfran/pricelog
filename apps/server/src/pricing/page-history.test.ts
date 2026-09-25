import { unavailablePricingFacts } from "@my-better-t-app/db/pricing-facts";
import { URL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/durable-sqlite";
import { PageStore } from "./page-store";
import { publishPageProjection } from "./publication";
import { COMPARISON_VERSION } from "@my-better-t-app/api/pricing-history";
import type { PublicEvaluation } from "./evaluation";

vi.mock("./publication", () => ({ publishPageProjection: vi.fn() }));
vi.mock("cloudflare:workers", () => ({ DurableObject: class {} }));
vi.mock("./drizzle/migrations.js", () => ({ default: { migrations: {} } }));

// Run PageStore queries against real SQLite through the DO storage interface.
function storeFor(pageId: string, migrationCount = Infinity) {
  const sqlite = new DatabaseSync(":memory:");
  const migrations = new URL("./drizzle/", import.meta.url);
  for (const directory of readdirSync(migrations)
    .filter((name) => /^\d/.test(name))
    .sort()
    .slice(0, migrationCount)) {
    sqlite.exec(readFileSync(new URL(`${directory}/migration.sql`, migrations), "utf8"));
  }
  sqlite.exec("CREATE TABLE test_kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  const createWorkflow = vi.fn().mockResolvedValue({});
  const storage = {
    kv: {
      get(key: string) {
        const row = sqlite.prepare("SELECT value FROM test_kv WHERE key = ?").get(key);
        return row ? JSON.parse(String(row.value)) : undefined;
      },
      put(key: string, value: unknown) {
        sqlite
          .prepare(
            "INSERT INTO test_kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
          )
          .run(key, JSON.stringify(value));
      },
      delete(key: string) {
        return sqlite.prepare("DELETE FROM test_kv WHERE key = ?").run(key).changes > 0;
      },
      list(options: { prefix?: string; limit?: number } = {}) {
        return sqlite
          .prepare("SELECT key, value FROM test_kv WHERE key LIKE ? ORDER BY key LIMIT ?")
          .all(`${options.prefix ?? ""}%`, options.limit ?? -1)
          .map((row) => [String(row.key), JSON.parse(String(row.value))] as [string, unknown]);
      },
    },
    sql: {
      exec(query: string, ...params: (string | number | null)[]) {
        const statement = sqlite.prepare(query);
        const columns = statement.columns().map((column) => column.name);
        statement.setReturnArrays(true);
        const rows = statement.all(...params) as unknown as unknown[][];
        const objects = rows.map((row) =>
          Object.fromEntries(columns.map((name, index) => [name, row[index]])),
        );
        return {
          toArray: () => objects,
          one: () => objects[0],
          raw: () => {
            const iterator = rows[Symbol.iterator]();
            return { next: () => iterator.next(), toArray: () => rows };
          },
        };
      },
    },
    transactionSync<T>(fn: () => T): T {
      sqlite.exec("BEGIN");
      try {
        const value = fn();
        sqlite.exec("COMMIT");
        return value;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
    setAlarm: vi.fn(),
    deleteAlarm: vi.fn(),
  } as unknown as DurableObjectStorage;
  sqlite
    .prepare(
      "INSERT INTO page_config (id, page_id, normalized_domain, canonical_url) VALUES (1, ?, ?, ?)",
    )
    .run(pageId, `${pageId}.com`, `https://${pageId}.com/pricing`);
  const store: PageStore = Object.assign(Object.create(PageStore.prototype), {
    db: drizzle(storage),
    ctx: { storage },
    env: { DB: {}, SCAN_WORKFLOW: { create: createWorkflow } },
  });
  return { store, sqlite, storage, createWorkflow };
}

async function capture(
  store: PageStore,
  sqlite: DatabaseSync,
  runId: string,
  date: string,
  status = "succeeded",
  model = "jev-1.13.0",
) {
  sqlite
    .prepare(
      "INSERT INTO scan_run (id, trigger, status, stage, workflow_instance_id) VALUES (?, 'manual', 'running', 'evaluate', ?)",
    )
    .run(runId, runId);
  await store.persistVersion(runId, {
    capturedAt: new Date(date).getTime(),
    httpStatus: 200,
    finalUrl: "https://example.com/pricing",
    title: "Example",
    htmlKey: `${runId}.html`,
    screenshotKey: `${runId}.png`,
    contentKey: `${runId}.md`,
    htmlSha256: runId,
    screenshotSha256: runId,
    contentSha256: runId,
    htmlBytes: 1,
    screenshotBytes: 1,
    contentBytes: 1,
  });
  await store.persistAnswers(runId, "pricing-intelligence-v4", [
    { key: "has_free_plan", type: "noul", noul: 0.9 },
  ]);
  await store.persistEvaluation(runId, {
    rubricId: "pricing-intelligence-v4",
    model,
    ...({ choices: [], signals: [], tags: [] } as PublicEvaluation),
  });
  sqlite.prepare("UPDATE scan_run SET status = ? WHERE id = ?").run(status, runId);
}

describe("page-local pricing history", () => {
  it("seeds an immutable rubric and rejects changed content under the same identity", async () => {
    const { store, sqlite } = storeFor("one");
    const seed = () => (store as unknown as { seedRubric(): Promise<void> }).seedRubric();
    try {
      await seed();
      await seed();
      sqlite.exec("UPDATE question SET instructions = 'changed' WHERE key = 'buying_motion'");
      await expect(seed()).rejects.toThrow("immutable");
      expect(
        sqlite.prepare("SELECT instructions FROM question WHERE key = 'buying_motion'").get()
          ?.instructions,
      ).toBe("changed");
    } finally {
      sqlite.close();
    }
  });

  it("keeps numeric observations with their version and ignores later replacement", async () => {
    const { store, sqlite } = storeFor("one");
    try {
      await capture(store, sqlite, "numeric", "2026-09-22", "running");
      const evaluation = {
        rubricId: "pricing-intelligence-v5",
        model: "jev-1.13.0",
        choices: [],
        signals: [],
        tags: [],
        pricingFacts: {
          ...unavailablePricingFacts("test record"),
          status: "collected" as const,
          model: "jev-1.13.0",
        },
        numericPrices: {
          version: "numeric-prices-v1" as const,
          status: "collected" as const,
          model: "jev-1.13.0",
          offers: [],
        },
      };
      await store.persistEvaluation("numeric", evaluation);
      sqlite.prepare("UPDATE scan_run SET status = 'succeeded' WHERE id = ?").run("numeric");
      await store.persistEvaluation("numeric", {
        ...evaluation,
        numericPrices: { ...evaluation.numericPrices, status: "unavailable" },
      });
      expect(
        JSON.parse(
          sqlite
            .prepare("SELECT evaluation_json FROM version_evaluation WHERE run_id = 'numeric'")
            .get()?.evaluation_json as string,
        ).numericPrices,
      ).toEqual(evaluation.numericPrices);
      expect(
        (await store.getWeeklyHistory("one", Date.parse("2026-09-28"))).observations[0]
          ?.pricingFacts,
      ).toEqual(evaluation.pricingFacts);
    } finally {
      sqlite.close();
    }
  });
  it("migrates existing versions and keeps choice/noul answers while removing scores", async () => {
    const { store, sqlite } = storeFor("one", 3);
    try {
      // Current PageStore reads the run trace while this fixture tests an older answer migration.
      sqlite.exec("ALTER TABLE scan_run ADD COLUMN events TEXT NOT NULL DEFAULT '[]'");
      await capture(store, sqlite, "existing", "2026-09-17");
      sqlite.exec(
        "INSERT INTO answer (version_id, question_set_id, question_key, type, score) VALUES ('existing', 'old-rubric', 'clarity', 'score', 3)",
      );
      sqlite.exec(
        readFileSync(
          new URL("./drizzle/20260921155102_handy_plazm/migration.sql", import.meta.url),
          "utf8",
        ),
      );
      expect(sqlite.prepare("SELECT question_key FROM answer").all()).toEqual([
        { question_key: "has_free_plan" },
      ]);
      expect(await store.getPublicSource("one", "existing")).toMatchObject({ key: "existing.md" });
      expect(
        (await store.getWeeklyHistory("one", Date.parse("2026-09-21"))).observations[0]?.model,
      ).toBe("jev-1.13.0");
    } finally {
      sqlite.close();
    }
  });

  it("selects each week's latest successful version and preserves its exact model", async () => {
    const { store, sqlite } = storeFor("one");
    try {
      await capture(store, sqlite, "before", "2026-09-10", "succeeded", "jev-1.12.0");
      await capture(store, sqlite, "old-after", "2026-09-15");
      await capture(store, sqlite, "after", "2026-09-17");
      await capture(store, sqlite, "failed", "2026-09-18", "failed");
      await capture(store, sqlite, "running", "2026-09-19", "running");
      const history = await store.getWeeklyHistory("one", Date.parse("2026-09-21"));
      expect(history.observations.map(({ runId, model }) => ({ runId, model }))).toEqual([
        { runId: "before", model: "jev-1.12.0" },
        { runId: "after", model: "jev-1.13.0" },
      ]);
      expect(await store.getPublicSource("one", "after")).toMatchObject({ key: "after.md" });
      expect(await store.getPublicSource("one", "failed")).toBeNull();
      expect(await store.getPublicSource("one", "running")).toBeNull();
      expect(await store.getPublicSource("another-page", "after")).toBeNull();
      await expect(store.getWeeklyHistory("another-page", Date.now())).rejects.toThrow(
        "does not own",
      );
      await store.persistAnswers("after", "pricing-intelligence-v4", [
        { key: "has_free_plan", type: "noul", noul: 0 },
      ]);
      expect(sqlite.prepare("SELECT noul FROM answer WHERE version_id = 'after'").get()?.noul).toBe(
        0.9,
      );
    } finally {
      sqlite.close();
    }
  });

  it("keeps comparisons inside the owning page and rejects failed or foreign versions", async () => {
    const one = storeFor("one");
    const two = storeFor("two");
    try {
      await capture(one.store, one.sqlite, "before", "2026-09-10");
      await capture(one.store, one.sqlite, "after", "2026-09-17");
      await capture(one.store, one.sqlite, "failed", "2026-09-18", "failed");
      const comparison = {
        id: "pair",
        beforeRunId: "before",
        afterRunId: "after",
        verifierVersion: COMPARISON_VERSION,
        model: "jev-1.13.0",
        status: "reviewed" as const,
        changes: [],
        createdAt: new Date(),
      };
      await one.store.persistComparison("one", comparison);
      expect(
        (await one.store.getWeeklyHistory("one", Date.parse("2026-09-21"))).comparisons,
      ).toHaveLength(1);
      await expect(two.store.persistComparison("one", comparison)).rejects.toThrow("does not own");
      await expect(two.store.persistComparison("two", comparison)).rejects.toThrow("not published");
      await expect(
        one.store.persistComparison("one", { ...comparison, id: "bad", afterRunId: "failed" }),
      ).rejects.toThrow("not published");
      expect(
        (await two.store.getWeeklyHistory("two", Date.parse("2026-09-21"))).observations,
      ).toEqual([]);
    } finally {
      one.sqlite.close();
      two.sqlite.close();
    }
  });
});

function publication(runId: string): Parameters<PageStore["preparePublication"]>[1] {
  return {
    pageId: "one",
    runId,
    normalizedDomain: "one.com",
    capturedAt: Date.parse("2026-09-17"),
    displayName: "One",
    description: null,
    rubricId: "pricing-intelligence-v4",
    model: "jev-1.13.0",
    choices: [],
    signals: [],
    tags: [],
  };
}

describe("durable publication delivery", () => {
  it("assigns increasing creation times when scans start within one millisecond or the clock moves back", async () => {
    const { store, sqlite, createWorkflow } = storeFor("one");
    const now = Date.parse("2026-09-21T12:00:00Z");
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    try {
      await capture(store, sqlite, "previous", "2026-09-17");
      sqlite.prepare("UPDATE scan_run SET created_at = ? WHERE id = 'previous'").run(now);
      sqlite.exec("INSERT INTO scheduler_state (id) VALUES (1)");
      const first = await store.triggerManual("owner");
      expect(first.createdAt).toBe(now + 1);
      await store.completeFailure(first.id, "capture_failed", "Capture failed", now);
      clock.mockReturnValue(now - 1000);
      const second = await store.triggerManual("owner");
      expect(second.createdAt).toBe(now + 2);
      expect(sqlite.prepare("SELECT updated_at FROM scheduler_state").get()?.updated_at).toBe(
        now + 2,
      );
      expect(createWorkflow).toHaveBeenCalledTimes(2);
    } finally {
      clock.mockRestore();
      sqlite.close();
    }
  });

  it("retains failed delivery, retries from the alarm without recapture, and resumes the weekly schedule", async () => {
    const { store, sqlite, storage, createWorkflow } = storeFor("one");
    const now = Date.parse("2026-09-21T12:00:00Z");
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    vi.mocked(publishPageProjection).mockReset();
    try {
      await capture(store, sqlite, "run", "2026-09-17", "running");
      sqlite.exec("INSERT INTO scheduler_state (id, active_run_id) VALUES (1, 'run')");
      await expect(store.completeSuccess("run", now)).rejects.toThrow("No prepared publication");
      await expect(
        store.preparePublication("run", { ...publication("run"), pageId: "wrong" }),
      ).rejects.toThrow("does not belong");
      await store.preparePublication("run", publication("run"));
      const nextScanAt = await store.completeSuccess("run", now);
      await store.markRunning("run");
      await store.setStage("run", "publish");
      expect(await store.getRun("run")).toMatchObject({ status: "succeeded", stage: "complete" });

      expect(nextScanAt).toBe(now + 7 * 24 * 60 * 60 * 1000);
      expect(storage.setAlarm).toHaveBeenLastCalledWith(now + 60_000);
      expect(sqlite.prepare("SELECT next_scan_at FROM scheduler_state").get()?.next_scan_at).toBe(
        nextScanAt,
      );
      vi.mocked(publishPageProjection).mockRejectedValue(new Error("D1 unavailable"));
      await expect(store.publishPending()).rejects.toThrow("D1 unavailable");
      expect(storage.kv.get("publication:run")).toMatchObject({ runId: "run" });
      expect((await store.getRun("run"))?.status).toBe("succeeded");
      clock.mockReturnValue(now + 60_000);
      await expect(store.alarm()).rejects.toThrow("D1 unavailable");
      expect(createWorkflow).not.toHaveBeenCalled();
      expect(storage.setAlarm).toHaveBeenLastCalledWith(now + 120_000);
      // Simulate a fresh DO instance using the same durable storage.
      const recovered: PageStore = Object.assign(Object.create(PageStore.prototype), {
        db: drizzle(storage),
        ctx: { storage },
        env: { DB: {}, SCAN_WORKFLOW: { create: createWorkflow } },
      });
      vi.mocked(publishPageProjection).mockResolvedValue(undefined);
      await recovered.alarm();
      expect(storage.kv.get("publication:run")).toBeUndefined();
      expect(createWorkflow).not.toHaveBeenCalled();
      expect(storage.setAlarm).toHaveBeenLastCalledWith(nextScanAt);
      expect(vi.mocked(publishPageProjection).mock.calls.at(-1)?.[1]).toMatchObject({
        runId: "run",
        nextScanAt,
      });
      expect(await recovered.completeSuccess("run", now + 60_000)).toBe(nextScanAt);
      expect(storage.kv.get("publication:run")).toBeUndefined();
      clock.mockReturnValue(nextScanAt);
      await recovered.alarm();
      expect(createWorkflow).toHaveBeenCalledOnce();
    } finally {
      clock.mockRestore();
      sqlite.close();
    }
  });

  it("keeps a newer payload when an older delivery finishes after the next scan", async () => {
    const { store, sqlite, storage } = storeFor("one");
    const now = Date.parse("2026-09-21T12:00:00Z");
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    let delivered!: () => void;
    const delivery = new Promise<void>((resolve) => {
      delivered = resolve;
    });
    vi.mocked(publishPageProjection).mockReset().mockReturnValueOnce(delivery);
    try {
      await capture(store, sqlite, "older", "2026-09-17", "running");
      sqlite.exec("INSERT INTO scheduler_state (id, active_run_id) VALUES (1, 'older')");
      await store.preparePublication("older", publication("older"));
      await store.completeSuccess("older", now);
      const flushing = store.publishPending();
      await capture(store, sqlite, "newer", "2026-09-17", "running");
      sqlite.exec(
        "UPDATE scheduler_state SET active_run_id = 'newer', next_scan_at = NULL WHERE id = 1",
      );
      await store.preparePublication("newer", publication("newer"));
      await store.completeSuccess("newer", now + 1000);
      delivered();
      await flushing;
      expect(storage.kv.get("publication:older")).toBeUndefined();
      expect(storage.kv.get("publication:newer")).toMatchObject({ runId: "newer" });
      expect(storage.setAlarm).toHaveBeenLastCalledWith(now + 60_000);
      expect(sqlite.prepare("SELECT next_scan_at FROM scheduler_state").get()?.next_scan_at).toBe(
        now + 1000 + 7 * 24 * 60 * 60 * 1000,
      );
    } finally {
      delivered();
      clock.mockRestore();
      sqlite.close();
    }
  });

  it("deletes prepared delivery on failure and never publishes a running run", async () => {
    const { store, sqlite, storage, createWorkflow } = storeFor("one");
    vi.mocked(publishPageProjection).mockReset();
    try {
      await capture(store, sqlite, "run", "2026-09-17", "running");
      sqlite.exec("INSERT INTO scheduler_state (id, active_run_id) VALUES (1, 'run')");
      await store.preparePublication("run", publication("run"));
      await store.alarm();
      expect(publishPageProjection).not.toHaveBeenCalled();
      expect(createWorkflow).not.toHaveBeenCalled();
      expect(storage.kv.get("publication:run")).toBeDefined();
      const nextScanAt = await store.completeFailure("run", "failed", "Scan failed");
      expect(storage.kv.get("publication:run")).toBeUndefined();
      expect(storage.setAlarm).toHaveBeenLastCalledWith(nextScanAt);
      expect((await store.getRun("run"))?.status).toBe("failed");
    } finally {
      sqlite.close();
    }
  });
});
