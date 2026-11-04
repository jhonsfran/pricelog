import { URL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { vi } from "vitest";
import { drizzle } from "drizzle-orm/durable-sqlite";
import { historyDatabase } from "@pricelog/api/pricing-history-test-fixtures";
import { PageStore } from "./page-store";

export function storeFor(pageId: string, migrationCount = Infinity) {
  const sqlite = new DatabaseSync(":memory:");
  const migrations = new URL("./drizzle/", import.meta.url);
  for (const directory of readdirSync(migrations)
    .filter((name) => /^\d/.test(name))
    .sort()
    .slice(0, migrationCount)) {
    sqlite.exec(readFileSync(new URL(`${directory}/migration.sql`, migrations), "utf8"));
  }
  sqlite.exec("INSERT INTO scheduler_state (id) VALUES (1)");
  sqlite.exec("CREATE TABLE test_kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  const createWorkflow = vi.fn().mockResolvedValue({});
  const history = historyDatabase();
  history.sqlite
    .prepare(
      "INSERT OR IGNORE INTO page (id,owner_user_id,normalized_domain,canonical_url,slug) VALUES (?, 'owner', ?, ?, ?)",
    )
    .run(pageId, `${pageId}.com`, `https://${pageId}.com/pricing`, pageId);
  history.sqlite.prepare("UPDATE page SET state='active' WHERE id=?").run(pageId);
  sqlite.exec(
    "INSERT INTO question_set (id,model,version,active) VALUES ('pricing-intelligence-v4','jev-1.13.0',4,0)",
  );
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
    env: { DB: history.binding, SCAN_WORKFLOW: { create: createWorkflow } },
  });
  return { store, sqlite, storage, createWorkflow, history };
}
