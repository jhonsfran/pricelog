import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { URL } from "node:url";
import { createDb } from "@my-better-t-app/db";
import { describe, expect, it } from "vitest";
import { publishOwnerProjection, publishPageProjection, type PagePublication } from "./publication";

function database() {
  const sqlite = new DatabaseSync(":memory:");
  const migrations = new URL("../../../../packages/db/src/migrations/", import.meta.url);
  for (const name of readdirSync(migrations)
    .filter((name) => /^\d/.test(name))
    .sort()) {
    sqlite.exec(readFileSync(new URL(`${name}/migration.sql`, migrations), "utf8"));
  }
  sqlite.exec(`INSERT INTO user (id, name, email, email_verified) VALUES ('owner', 'Owner', 'test@example.com', 1);
    INSERT INTO page (id, owner_user_id, normalized_domain, canonical_url, slug)
    VALUES ('page', 'owner', 'example.com', 'https://example.com/pricing', 'example');`);
  function prepare(query: string) {
    let values: SQLInputValue[] = [];
    return {
      bind(...params: SQLInputValue[]) {
        values = params;
        return this;
      },
      async all() {
        return { results: sqlite.prepare(query).all(...values), success: true, meta: {} };
      },
      async run() {
        return this.all();
      },
    };
  }
  const binding = {
    prepare,
    async batch(statements: ReturnType<typeof prepare>[]) {
      sqlite.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.all());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  } as unknown as D1Database;
  return { sqlite, db: createDb({ DB: binding }) };
}

function publication(runId: string, capturedAt: number): PagePublication {
  return {
    pageId: "page",
    runId,
    runCreatedAt: capturedAt - 1,
    normalizedDomain: "example.com",
    capturedAt,
    displayName: runId,
    description: `${runId} description`,
    rubricId: "pricing-intelligence-v4",
    model: "jev-1.13.0",
    choices: [],
    signals: [],
    tags: [],
    nextScanAt: capturedAt + 604800000,
  };
}

describe("D1 publication delivery", () => {
  it("publishes all projections and permits repeated delivery", async () => {
    const { sqlite, db } = database();
    try {
      const input = publication("first", 1000);
      await publishPageProjection(db, input);
      await publishPageProjection(db, input);
      expect(sqlite.prepare("SELECT state, display_name FROM page").get()).toEqual({
        state: "active",
        display_name: "first",
      });
      expect(sqlite.prepare("SELECT run_id, scanned_at FROM page_public_summary").all()).toEqual([
        { run_id: "first", scanned_at: 1000 },
      ]);
      expect(
        sqlite
          .prepare("SELECT active_run_id, last_run_id, last_run_status FROM page_owner_state")
          .get(),
      ).toEqual({ active_run_id: null, last_run_id: "first", last_run_status: "succeeded" });
    } finally {
      sqlite.close();
    }
  });

  it("cannot regress the summary or page metadata when older delivery finishes last", async () => {
    const { sqlite, db } = database();
    try {
      await publishPageProjection(db, publication("new", 2000));
      await publishPageProjection(db, publication("old", 1000));
      expect(sqlite.prepare("SELECT display_name, description FROM page").get()).toEqual({
        display_name: "new",
        description: "new description",
      });
      expect(sqlite.prepare("SELECT run_id FROM page_public_summary").get()?.run_id).toBe("new");
      expect(sqlite.prepare("SELECT last_run_id FROM page_owner_state").get()?.last_run_id).toBe(
        "new",
      );
    } finally {
      sqlite.close();
    }
  });

  it("does not clear a newer running scan when publishing a completed version", async () => {
    const { sqlite, db } = database();
    try {
      sqlite.exec(
        "INSERT INTO page_owner_state (page_id, active_run_id, last_run_id, last_run_status, last_run_created_at) VALUES ('page', 'new', 'new', 'running', 2000)",
      );
      await publishPageProjection(db, publication("old", 1000));
      expect(
        sqlite
          .prepare("SELECT active_run_id, last_run_id, last_run_status FROM page_owner_state")
          .get(),
      ).toEqual({ active_run_id: "new", last_run_id: "new", last_run_status: "running" });
      expect(sqlite.prepare("SELECT run_id FROM page_public_summary").get()?.run_id).toBe("old");
    } finally {
      sqlite.close();
    }
  });
  it("records a newer failure even if its running projection was never delivered", async () => {
    const { sqlite, db } = database();
    try {
      await publishPageProjection(db, publication("old", 1000));
      await publishOwnerProjection(db, {
        pageId: "page",
        runId: "failed",
        runCreatedAt: 2000,
        status: "failed",
        nextScanAt: 3000,
      });
      expect(
        sqlite
          .prepare("SELECT last_run_id, last_run_status, next_scan_at FROM page_owner_state")
          .get(),
      ).toEqual({ last_run_id: "failed", last_run_status: "failed", next_scan_at: 3000 });
      await publishPageProjection(db, publication("old", 1000));
      expect(sqlite.prepare("SELECT last_run_id FROM page_owner_state").get()?.last_run_id).toBe(
        "failed",
      );
    } finally {
      sqlite.close();
    }
  });

  it("rejects delayed running writes after terminal completion or a newer scan", async () => {
    const { sqlite, db } = database();
    try {
      await publishPageProjection(db, publication("new", 2000));
      for (const [runId, runCreatedAt] of [
        ["old", 999],
        ["new", 1999],
      ] as const) {
        await publishOwnerProjection(db, {
          pageId: "page",
          runId,
          runCreatedAt,
          status: "running",
        });
      }
      expect(
        sqlite.prepare("SELECT last_run_id, last_run_status FROM page_owner_state").get(),
      ).toEqual({ last_run_id: "new", last_run_status: "succeeded" });
    } finally {
      sqlite.close();
    }
  });
});
