import { URL } from "node:url";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { createDb } from "@pricelog/db";
import type { TerminalArchive } from "@pricelog/db/history-types";
import { createPricingHistoryRepository } from "./pricing-history-repository";

export function historyDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  const migrations = new URL("../../db/src/migrations/", import.meta.url);
  for (const name of readdirSync(migrations)
    .filter((name) => /^\d/.test(name))
    .sort())
    sqlite.exec(readFileSync(new URL(`${name}/migration.sql`, migrations), "utf8"));
  sqlite.exec("PRAGMA foreign_keys=ON");
  sqlite.exec(`INSERT INTO user (id,name,email,email_verified) VALUES ('owner','Owner','owner@example.com',1);
    INSERT INTO page (id,owner_user_id,normalized_domain,canonical_url,slug) VALUES ('page','owner','example.com','https://example.com/pricing','example'),('other','owner','other.com','https://other.com/pricing','other');`);
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
      async raw() {
        const statement = sqlite.prepare(query);
        statement.setReturnArrays(true);
        return statement.all(...values);
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
  const db = createDb({ DB: binding });
  return { sqlite, db, binding, repo: createPricingHistoryRepository(db) };
}

export function archiveInput(runId = "run", capturedAt = 1000): TerminalArchive {
  return {
    source: "scan",
    pageId: "page",
    run: {
      id: runId,
      trigger: "manual",
      status: "succeeded",
      stage: "complete",
      requestedByUserId: "owner",
      browserEngine: "chromium",
      errorCode: null,
      errorMessage: null,
      createdAt: capturedAt - 1,
      startedAt: capturedAt - 1,
      completedAt: capturedAt + 1,
      events: [{ at: capturedAt, stage: "verify", kind: "warning", message: "Original event" }],
    },
    capture: {
      capturedAt,
      httpStatus: 200,
      finalUrl: "https://example.com/pricing",
      title: "Example",
      htmlKey: `${runId}.html`,
      screenshotKey: `${runId}.png`,
      contentKey: `${runId}.md`,
      htmlSha256: "html-sha",
      screenshotSha256: "png-sha",
      contentSha256: "md-sha",
      htmlBytes: 10,
      screenshotBytes: 20,
      contentBytes: 30,
    },
    analysis: {
      id: `initial:page:${runId}`,
      idempotencyKey: "initial",
      runId,
      rubricId: "rubric",
      model: "jev-1.13.0",
      createdAt: capturedAt + 1,
      evaluation: {
        choices: [],
        signals: [],
        tags: [],
        draft: '{"raw":"unmodified"}',
        coverage: { literals: 7, claimed: 5 },
        pipeline: "pipeline-original",
        review: [{ path: "price", value: "bad quote", reason: "unavailable" }],
      },
      answers: [
        {
          key: "question",
          type: "choice",
          choice: "yes",
          confidence: 0.95,
          probabilities: { yes: 0.95, no: 0.05 },
        },
      ],
    },
    rubrics: [
      {
        id: "rubric",
        model: "typesafe/jev",
        version: 1,
        questions: [
          {
            key: "question",
            type: "choice",
            instructions: "Exact wording",
            criteria: { yes: "Yes", no: "No" },
            position: 0,
            minimum: null,
            maximum: null,
          },
        ],
      },
    ],
    answers: [
      {
        rubricId: "rubric",
        values: [
          {
            key: "question",
            type: "choice",
            choice: "yes",
            confidence: 0.95,
            probabilities: { yes: 0.95, no: 0.05 },
          },
        ],
      },
    ],
    metadata: { displayName: "Example", description: "Description" },
    nextScanAt: capturedAt + 100,
  };
}
