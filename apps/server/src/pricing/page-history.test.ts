import { URL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/durable-sqlite";
import { PageStore } from "./page-store";
import { storeFor } from "./page-store-test-fixtures";
import { initialAnalysisId } from "@pricelog/db/history-types";
import {
  HISTORY_IMPORT_KEY,
  TERMINAL_ARCHIVE_PREFIX,
  exportLegacyBatch,
  legacySourceCount,
} from "./legacy-history";
import { COMPARISON_VERSION } from "@pricelog/api/pricing-history";
import type { PublicEvaluation } from "./evaluation";

vi.mock("cloudflare:workers", () => ({ DurableObject: class {} }));
vi.mock("./drizzle/migrations.js", () => ({ default: { migrations: {} } }));

async function capture(
  _store: PageStore,
  sqlite: DatabaseSync,
  runId: string,
  date: string,
  status = "succeeded",
  model = "jev-1.13.0",
) {
  sqlite
    .prepare(
      "INSERT INTO scan_run (id,trigger,status,stage,workflow_instance_id,created_at,completed_at) VALUES (?,'manual',?,'complete',?,?,?)",
    )
    .run(
      runId,
      status,
      runId,
      Date.parse(date) - 1,
      status === "running" ? null : Date.parse(date) + 1,
    );
  sqlite
    .prepare(
      "INSERT INTO page_version (id,run_id,captured_at,http_status,final_url,title,browser_engine,html_key,screenshot_key,content_key,html_sha256,screenshot_sha256,content_sha256,html_bytes,screenshot_bytes,content_bytes) VALUES (?,?,?,200,'https://example.com/pricing','Example','chromium',?,?,?,?,?,?,1,1,1)",
    )
    .run(
      runId,
      runId,
      Date.parse(date),
      `${runId}.html`,
      `${runId}.png`,
      `${runId}.md`,
      runId,
      runId,
      runId,
    );
  sqlite
    .prepare(
      "INSERT INTO answer (version_id,question_set_id,question_key,type,noul) VALUES (?,'pricing-intelligence-v4','has_free_plan','noul',0.9)",
    )
    .run(runId);
  sqlite
    .prepare(
      "INSERT INTO version_evaluation (run_id,rubric_id,model,evaluation_json) VALUES (?,'pricing-intelligence-v4',?,?)",
    )
    .run(runId, model, JSON.stringify({ choices: [], signals: [], tags: [] }));
}

async function scanned(
  store: PageStore,
  sqlite: DatabaseSync,
  runId: string,
  contentSha256: string,
  evaluation?: PublicEvaluation & { rubricId: string; model: string },
) {
  await capture(
    store,
    sqlite,
    runId,
    "2026-09-22",
    evaluation ? "succeeded" : "running",
    evaluation?.model,
  );
  sqlite
    .prepare("UPDATE page_version SET content_sha256=? WHERE run_id=?")
    .run(contentSha256, runId);
  if (!evaluation) {
    sqlite.prepare("DELETE FROM version_evaluation WHERE run_id=?").run(runId);
    return;
  }
  sqlite
    .prepare("INSERT OR IGNORE INTO question_set (id,model,version) VALUES (?, 'typesafe/jev',10)")
    .run(evaluation.rubricId);
  const { rubricId, model, ...payload } = evaluation;
  sqlite
    .prepare("UPDATE version_evaluation SET rubric_id=?,model=?,evaluation_json=? WHERE run_id=?")
    .run(rubricId, model, JSON.stringify(payload), runId);
  sqlite.prepare("UPDATE answer SET question_set_id=? WHERE version_id=?").run(rubricId, runId);
  sqlite
    .prepare(
      "INSERT INTO answer (version_id,question_set_id,question_key,type,choice,confidence,probabilities_json) VALUES (?,?,'price_0_role','choice','base_price',0.8,?)",
    )
    .run(runId, rubricId, JSON.stringify({ base_price: 0.8 }));
}

const PIPELINE = "pricing-snapshot-v4-aaaaaaaaaaaa";
const COLLECTED = {
  rubricId: "pricing-intelligence-v10",
  model: "jev-1.13.0",
  choices: [],
  signals: [],
  tags: [],
  pipeline: PIPELINE,
  snapshot: {
    version: "pricing-snapshot-v4" as const,
    status: "collected" as const,
    offers: [{ name: "Pro", prices: [] }],
    features: [],
  },
};

describe("unchanged page reuse", () => {
  it("reuses the latest evaluation only for the same content, rubric and pipeline", async () => {
    const { store, sqlite } = storeFor("one");
    try {
      await scanned(store, sqlite, "first", "same", COLLECTED);
      await scanned(store, sqlite, "second", "same");
      expect(
        await store.findReusableEvaluation("second", "same", "pricing-intelligence-v10", PIPELINE),
      ).toEqual({
        runId: "first",
        rubricId: "pricing-intelligence-v10",
        model: "jev-1.13.0",
        evaluation: {
          choices: [],
          signals: [],
          tags: [],
          pipeline: PIPELINE,
          snapshot: COLLECTED.snapshot,
          review: [],
        },
        answers: [
          { key: "has_free_plan", type: "noul", noul: 0.9 },
          {
            key: "price_0_role",
            type: "choice",
            choice: "base_price",
            confidence: 0.8,
            probabilities: { base_price: 0.8 },
          },
        ],
      });
      expect(
        await store.findReusableEvaluation(
          "second",
          "changed",
          "pricing-intelligence-v10",
          PIPELINE,
        ),
      ).toBeNull();
      expect(
        await store.findReusableEvaluation("second", "same", "pricing-intelligence-v11", PIPELINE),
      ).toBeNull();
      expect(
        await store.findReusableEvaluation(
          "second",
          "same",
          "pricing-intelligence-v10",
          "pricing-snapshot-v4-bbbbbbbbbbbb",
        ),
      ).toBeNull();
    } finally {
      sqlite.close();
    }
  });

  it("does not reuse an evaluation that published no snapshot", async () => {
    const { store, sqlite } = storeFor("one");
    try {
      await scanned(store, sqlite, "first", "same", {
        ...COLLECTED,
        snapshot: { ...COLLECTED.snapshot, status: "unavailable" },
      });
      await scanned(store, sqlite, "second", "same");
      expect(
        await store.findReusableEvaluation("second", "same", "pricing-intelligence-v10", PIPELINE),
      ).toBeNull();
    } finally {
      sqlite.close();
    }
  });
});

describe("page-local pricing history", () => {
  it("returns the latest published version with its rail and keeps foreign pages private", async () => {
    const { store, sqlite } = storeFor("one");
    try {
      await capture(store, sqlite, "older", "2026-09-21");
      await capture(store, sqlite, "latest", "2026-09-28");
      await capture(store, sqlite, "failed", "2026-09-30", "failed");
      const page = await store.getPublicPage("one");
      expect(page.versions.map((version) => version.runId)).toEqual(["latest", "older"]);
      expect(page.version?.runId).toBe("latest");
      expect(await store.getPublicPage("another-page")).toEqual({ versions: [], version: null });
    } finally {
      sqlite.close();
    }
  });
  it("seeds an immutable rubric and rejects changed content under the same identity", async () => {
    const { store, sqlite } = storeFor("one");
    const seed = () => (store as unknown as { seedRubric(): Promise<void> }).seedRubric();
    try {
      await seed();
      await seed();
      sqlite.exec("UPDATE question SET instructions = 'changed' WHERE key = 'product_category'");
      await expect(seed()).rejects.toThrow("immutable");
      expect(
        sqlite.prepare("SELECT instructions FROM question WHERE key = 'product_category'").get()
          ?.instructions,
      ).toBe("changed");
    } finally {
      sqlite.close();
    }
  });

  it("keeps snapshot observations with their version and ignores later replacement", async () => {
    const { store, sqlite } = storeFor("one");
    try {
      await capture(store, sqlite, "numeric", "2026-09-22", "running");
      const evaluation = {
        rubricId: "pricing-intelligence-v5",
        model: "jev-1.13.0",
        choices: [],
        signals: [],
        tags: [],
        pipeline: PIPELINE,
        snapshot: COLLECTED.snapshot,
        numericPrices: {
          version: "numeric-prices-v1" as const,
          status: "collected" as const,
          model: "jev-1.13.0",
          offers: [],
        },
      };
      sqlite
        .prepare(
          "INSERT OR IGNORE INTO question_set (id,model,version) VALUES ('pricing-intelligence-v5','typesafe/jev',5)",
        )
        .run();
      sqlite
        .prepare(
          "UPDATE version_evaluation SET rubric_id=?,model=?,evaluation_json=? WHERE run_id='numeric'",
        )
        .run(evaluation.rubricId, evaluation.model, JSON.stringify(evaluation));
      sqlite
        .prepare("UPDATE scan_run SET status='succeeded',completed_at=? WHERE id='numeric'")
        .run(Date.parse("2026-09-22") + 1);
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
        (await store.getWeeklyHistory("one", Date.parse("2026-09-28"))).observations[0],
      ).toMatchObject({ snapshot: COLLECTED.snapshot, pipeline: PIPELINE });
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
        beforeAnalysisId: initialAnalysisId("one", "before"),
        afterAnalysisId: initialAnalysisId("one", "after"),
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
      await expect(two.store.persistComparison("two", comparison)).rejects.toThrow();
      await expect(
        one.store.persistComparison("one", { ...comparison, id: "bad", afterRunId: "failed" }),
      ).rejects.toThrow();
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

async function workspaceCapture(
  store: PageStore,
  runId: string,
  capturedAt = Date.parse("2026-09-17"),
) {
  await store.persistVersion(runId, {
    capturedAt,
    httpStatus: 200,
    finalUrl: "https://one.com/pricing",
    title: "One",
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
    { key: "free", type: "noul", noul: 0.8 },
  ]);
  await store.persistEvaluation(runId, {
    rubricId: "pricing-intelligence-v4",
    model: "jev-1.13.0",
    choices: [],
    signals: [],
    tags: [],
    draft: "original raw output",
  });
  await store.preparePublication(runId, { ...publication(runId), capturedAt });
}

async function finishImport(store: PageStore, limit = 10) {
  for (let i = 0; i < 100; i++) {
    const progress = await store.migrateHistory(limit);
    if (progress.ready) return progress;
  }
  throw new Error("Fixture import did not finish");
}

describe("durable terminal delivery", () => {
  it("retains failed delivery and retries from the alarm without recapture", async () => {
    const { store, sqlite, history, storage, createWorkflow } = storeFor("one");
    try {
      const run = await store.triggerManual("owner");
      await workspaceCapture(store, run.id);
      const completed = Date.now();
      const next = await store.completeSuccess(run.id, completed);
      const batch = vi
        .spyOn(history.binding, "batch")
        .mockRejectedValueOnce(new Error("D1 unavailable"));
      await expect(store.publishPending()).rejects.toThrow("D1 unavailable");
      expect(storage.kv.get(`${TERMINAL_ARCHIVE_PREFIX}${run.id}`)).toBeDefined();
      expect(sqlite.prepare("SELECT status FROM scan_run WHERE id=?").get(run.id)?.status).toBe(
        "succeeded",
      );
      expect(storage.setAlarm).toHaveBeenCalled();
      batch.mockRestore();
      await store.alarm();
      expect(createWorkflow).toHaveBeenCalledTimes(1);
      expect(storage.kv.get(`${TERMINAL_ARCHIVE_PREFIX}${run.id}`)).toBeUndefined();
      expect(sqlite.prepare("SELECT id FROM scan_run WHERE id=?").get(run.id)).toBeUndefined();
      expect((await store.getPublicPage("one")).version?.runId).toBe(run.id);
      expect(await store.completeSuccess(run.id, completed + 1000)).toBe(next);
      await expect(store.completeFailure(run.id, "failed", "late failure")).rejects.toThrow(
        "Cannot change completed run",
      );
      await expect(
        store.persistVersion(run.id, { capturedAt: 0 } as Parameters<
          PageStore["persistVersion"]
        >[1]),
      ).rejects.toThrow();
    } finally {
      sqlite.close();
      history.sqlite.close();
    }
  });

  it("archives failures with captured artifacts and releases only acknowledged workspace rows", async () => {
    const { store, sqlite, history, storage } = storeFor("one");
    try {
      const run = await store.triggerManual("owner");
      await workspaceCapture(store, run.id);
      await store.completeFailure(run.id, "verification_failed", "Failed after capture");
      expect(storage.kv.get(`publication:${run.id}`)).toBeUndefined();
      expect(storage.kv.get(`${TERMINAL_ARCHIVE_PREFIX}${run.id}`)).toMatchObject({
        run: { status: "failed" },
        capture: { contentKey: `${run.id}.md` },
      });
      await store.publishPending();
      expect((await store.getRun(run.id))?.status).toBe("failed");
      expect(await store.getArtifact(run.id, "content")).toMatchObject({ key: `${run.id}.md` });
      expect(await store.getPublicSource("one", run.id)).toBeNull();
      expect(sqlite.prepare("SELECT count(*) AS count FROM scan_run").get()?.count).toBe(0);
    } finally {
      sqlite.close();
      history.sqlite.close();
    }
  });

  it("keeps run creation monotonic through cleanup and clock rollback", async () => {
    const { store, sqlite, history } = storeFor("one");
    const clock = vi.spyOn(Date, "now").mockReturnValue(1000000);
    try {
      const first = await store.triggerManual("owner");
      await store.completeFailure(first.id, "failed", "Failed");
      await store.publishPending();
      clock.mockReturnValue(900000);
      const second = await store.triggerManual("owner");
      expect(second.createdAt).toBe(first.createdAt + 1);
      await store.completeFailure(second.id, "failed", "Failed");
      await store.publishPending();
      const page = await store.listRuns(1);
      expect(page.items.map((row) => row.id)).toEqual([second.id]);
      expect((await store.listRuns(1, page.nextCursor!)).items.map((row) => row.id)).toEqual([
        first.id,
      ]);
    } finally {
      clock.mockRestore();
      sqlite.close();
      history.sqlite.close();
    }
  });
  it("paginates tied timestamps with SQLite ID order and removes source/history duplicates", async () => {
    const { store, sqlite, history } = storeFor("one");
    try {
      for (const id of ["A", "a", "Z"]) await capture(store, sqlite, id, "2026-09-17");
      await finishImport(store);
      const first = await store.listRuns(2);
      expect(first.items.map((row) => row.id)).toEqual(["a", "Z"]);
      const second = await store.listRuns(2, first.nextCursor!);
      expect(second.items.map((row) => row.id)).toEqual(["A"]);
      expect(second.nextCursor).toBeNull();
    } finally {
      sqlite.close();
      history.sqlite.close();
    }
  });
});

describe("bounded legacy import", () => {
  it("resumes after a lost acknowledgement, verifies every record, and retains all legacy source rows", async () => {
    const { store, sqlite, history, storage } = storeFor("one");
    try {
      await capture(store, sqlite, "before", "2026-09-10");
      await capture(store, sqlite, "after", "2026-09-17");
      await capture(store, sqlite, "failed", "2026-09-18", "failed");
      const first = await store.migrateHistory(1);
      expect(first.ready).toBe(false);
      expect(first.importedCount).toBe(1);
      await expect(history.repo.requireReady("one")).rejects.toThrow("not ready");
      const batch = history.binding.batch.bind(history.binding);
      const spy = vi.spyOn(history.binding, "batch").mockImplementationOnce(async (...args) => {
        await batch(...args);
        throw new Error("Acknowledgement lost");
      });
      await expect(store.migrateHistory(1)).rejects.toThrow("Acknowledgement lost");
      expect(storage.kv.get(HISTORY_IMPORT_KEY)).toMatchObject({ importedCount: 1 });
      spy.mockRestore();
      const done = await finishImport(store, 1);
      expect(done.ready).toBe(true);
      expect(done.importedCount).toBe(4);
      expect(done.expectedCount).toBe(4);
      expect(history.sqlite.prepare("SELECT count(*) AS count FROM history_run").get()?.count).toBe(
        3,
      );
      expect(sqlite.prepare("SELECT count(*) AS count FROM scan_run").get()?.count).toBe(3);
      await history.repo.requireReady("one");
      expect((await store.getPublicPage("one")).versions.map((row) => row.runId)).toEqual([
        "after",
        "before",
      ]);
    } finally {
      sqlite.close();
      history.sqlite.close();
    }
  });

  it("exports by key and byte limits and delivers pending publication before acknowledging it", async () => {
    const { store, sqlite, history, storage } = storeFor("one");
    try {
      await capture(store, sqlite, "after", "2026-09-17");
      storage.kv.put("publication:after", publication("after"));
      const progress = {
        sourceIdentity: "source",
        checkpoint: null,
        expectedCount: 2,
        importedCount: 0,
        ready: false,
      };
      const local = drizzle(storage);
      const one = exportLegacyBatch(local, "one", progress, () => undefined, 1);
      expect(one.records).toHaveLength(1);
      expect(one.bytes).toBeLessThanOrEqual(1024 * 1024);
      expect(() => exportLegacyBatch(local, "one", progress, () => undefined, 1, 1)).toThrow(
        "byte limit",
      );
      await store.migrateHistory(1);
      expect(storage.kv.get("publication:after")).toBeDefined();
      const spy = vi
        .spyOn(history.binding, "batch")
        .mockRejectedValueOnce(new Error("D1 unavailable"));
      await expect(store.migrateHistory(1)).rejects.toThrow();
      expect(storage.kv.get("publication:after")).toBeDefined();
      spy.mockRestore();
      await finishImport(store, 1);
      expect(storage.kv.get("publication:after")).toBeUndefined();
      expect(
        history.sqlite.prepare("SELECT run_id FROM page_public_summary WHERE page_id='one'").get()
          ?.run_id,
      ).toBe("after");
      expect(legacySourceCount(local)).toBe(2);
    } finally {
      sqlite.close();
      history.sqlite.close();
    }
  });
  it("preserves every legacy rubric answer and comparison and keeps captures without evaluations private", async () => {
    const { store, sqlite, history, storage } = storeFor("one");
    try {
      await capture(store, sqlite, "before", "2026-09-10");
      await capture(store, sqlite, "after", "2026-09-17");
      await capture(store, sqlite, "unevaluated", "2026-09-18");
      sqlite.exec(
        "DELETE FROM version_evaluation WHERE run_id='unevaluated'; INSERT INTO question_set(id,model,version) VALUES ('old-rubric','old-model',1); INSERT INTO answer(version_id,question_set_id,question_key,type,noul) VALUES ('before','old-rubric','old-answer','noul',0.123); INSERT INTO version_comparison(id,before_run_id,after_run_id,verifier_version,model,status,changes_json,created_at) VALUES ('legacy-pair','before','after','snapshot-diff-v1',null,'reviewed','[]',1000)",
      );
      await store.migrateHistory(1);
      expect(await store.getArtifact("unevaluated", "html")).toMatchObject({
        key: "unevaluated.html",
      });
      await expect(history.repo.requireReady("one")).rejects.toThrow("not ready");
      const done = await finishImport(store, 1);
      expect(done.importedCount).toBe(6);
      const answers = history.sqlite
        .prepare(
          "SELECT values_json FROM history_answers WHERE page_id='one' AND run_id='before' AND rubric_id='old-rubric'",
        )
        .get();
      expect(JSON.parse(String(answers?.values_json))).toEqual([
        { key: "old-answer", type: "noul", noul: 0.123 },
      ]);
      expect(
        history.sqlite
          .prepare(
            "SELECT before_analysis_id,after_analysis_id FROM history_comparison WHERE page_id='one'",
          )
          .get(),
      ).toEqual({
        before_analysis_id: initialAnalysisId("one", "before"),
        after_analysis_id: initialAnalysisId("one", "after"),
      });
      expect(await store.getPublicSource("one", "unevaluated")).toBeNull();
      expect(
        history.sqlite
          .prepare(
            "SELECT metadata_json,selected_analysis_id FROM history_capture WHERE run_id='unevaluated'",
          )
          .get(),
      ).toEqual({ metadata_json: null, selected_analysis_id: null });
      expect(storage.kv.get(HISTORY_IMPORT_KEY)).toMatchObject({ ready: true });
    } finally {
      sqlite.close();
      history.sqlite.close();
    }
  });
});
