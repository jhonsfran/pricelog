import { describe, expect, it } from "vitest";
import { historyDatabase, archiveInput } from "./pricing-history-test-fixtures";

describe("D1 pricing history", () => {
  it("runs the full migration chain and preserves the exact archive payload", async () => {
    const { sqlite, repo } = historyDatabase();
    try {
      const input = archiveInput();
      await repo.archive(input);
      expect(await repo.getRun("page", "run")).toEqual(input.run);
      expect(await repo.getAnalysis("page", input.analysis!.id)).toEqual(input.analysis);
      expect(
        JSON.parse(
          String(sqlite.prepare("SELECT manifest_json FROM history_capture").get()?.manifest_json),
        ),
      ).toEqual(input.capture);
      expect(
        JSON.parse(
          String(sqlite.prepare("SELECT values_json FROM history_answers").get()?.values_json),
        ),
      ).toEqual(input.answers[0]!.values);
      expect(
        JSON.parse(
          String(sqlite.prepare("SELECT metadata_json FROM history_capture").get()?.metadata_json),
        ),
      ).toEqual(input.metadata);
      expect(sqlite.prepare("SELECT next_scan_at FROM page_owner_state").get()?.next_scan_at).toBe(
        input.nextScanAt,
      );
      expect(
        JSON.parse(
          String(sqlite.prepare("SELECT document_json FROM history_rubric").get()?.document_json),
        ),
      ).toEqual(input.rubrics[0]);
      expect(sqlite.prepare("SELECT analysis_id,run_id FROM page_public_summary").get()).toEqual({
        analysis_id: input.analysis!.id,
        run_id: "run",
      });
    } finally {
      sqlite.close();
    }
  });

  it("accepts exact retries and rolls back changed immutable payloads with their projections", async () => {
    const { sqlite, repo } = historyDatabase();
    try {
      const input = archiveInput();
      await repo.archive(input);
      await repo.archive(input);
      const conflicting = structuredClone(input);
      conflicting.analysis!.evaluation.tags = ["changed"];
      await expect(repo.archive(conflicting)).rejects.toThrow();
      expect(await repo.getAnalysis("page", input.analysis!.id)).toEqual(input.analysis);
      expect(sqlite.prepare("SELECT count(*) AS count FROM history_run").get()?.count).toBe(1);
      const newRun = archiveInput("second", 2000);
      newRun.rubrics[0]!.questions[0]!.instructions = "Different rubric";
      await expect(repo.archive(newRun)).rejects.toThrow();
      expect(await repo.getRun("page", "second")).toBeNull();
      expect(sqlite.prepare("SELECT run_id FROM page_public_summary").get()?.run_id).toBe("run");
    } finally {
      sqlite.close();
    }
  });

  it("isolates pages and requires success and a selected analysis for public artifacts", async () => {
    const { sqlite, repo } = historyDatabase();
    try {
      const input = archiveInput();
      await repo.archive(input);
      expect(await repo.getRun("other", "run")).toBeNull();
      expect(await repo.getArtifact("other", "run", "content")).toBeNull();
      expect(await repo.getPublicVersion("other", "run")).toBeNull();
      const failed = archiveInput("failed");
      failed.run.status = "failed";
      failed.analysis = null;
      failed.metadata = null;
      await repo.archive(failed);
      expect(await repo.getArtifact("page", "failed", "html")).toMatchObject({
        key: "failed.html",
      });
      expect(await repo.getArtifact("page", "failed", "html", true)).toBeNull();
      expect((await repo.listPublicVersions("page")).map((row) => row.runId)).toEqual(["run"]);
      const other = archiveInput("other-run");
      other.pageId = "other";
      other.rubrics[0]!.questions[0]!.instructions = "Independent historical definition";
      await repo.archive(other);
      expect(sqlite.prepare("SELECT count(*) AS count FROM history_rubric").get()?.count).toBe(2);
    } finally {
      sqlite.close();
    }
  });

  it("appends revisions, selects with compare and set, and resists stale delivery and old capture corrections", async () => {
    const { sqlite, repo } = historyDatabase();
    try {
      const input = archiveInput();
      await repo.archive(input);
      const revision = {
        ...structuredClone(input.analysis!),
        id: "corrected",
        idempotencyKey: "fix-1",
        createdAt: 3000,
      };
      revision.evaluation.tags = ["corrected"];
      await repo.appendAnalysis("page", revision, input.rubrics[0]!);
      expect((await repo.getPublicVersion("page", "run"))?.tags).toEqual([]);
      await repo.selectAnalysis("page", "run", revision.id, input.analysis!.id);
      await repo.archive(input);
      expect((await repo.getPublicVersion("page", "run"))?.tags).toEqual(["corrected"]);
      expect(
        sqlite.prepare("SELECT analysis_id,tags_json,scanned_at FROM page_public_summary").get(),
      ).toEqual({ analysis_id: "corrected", tags_json: '["corrected"]', scanned_at: 1000 });
      await expect(repo.selectAnalysis("page", "run", input.analysis!.id, "stale")).rejects.toThrow(
        "Selected analysis changed",
      );
      await repo.archive(archiveInput("newer", 4000));
      await repo.selectAnalysis("page", "run", input.analysis!.id, revision.id);
      expect(sqlite.prepare("SELECT run_id,scanned_at FROM page_public_summary").get()).toEqual({
        run_id: "newer",
        scanned_at: 4000,
      });
      expect(sqlite.prepare("SELECT last_run_id,next_scan_at FROM page_owner_state").get()).toEqual(
        { last_run_id: "newer", next_scan_at: 4100 },
      );
    } finally {
      sqlite.close();
    }
  });
  it("does not create a summary or change metadata after a failed selection", async () => {
    const { sqlite, repo } = historyDatabase();
    try {
      const input = archiveInput();
      await repo.archive(input);
      const revision = {
        ...structuredClone(input.analysis!),
        id: "unselected",
        idempotencyKey: "unselected",
      };
      revision.evaluation.tags = ["unselected"];
      await repo.appendAnalysis("page", revision, input.rubrics[0]!);
      sqlite.exec(
        "DELETE FROM page_public_summary; UPDATE page SET display_name='unchanged', description='unchanged'",
      );
      await expect(repo.selectAnalysis("page", "run", revision.id, "stale")).rejects.toThrow(
        "Selected analysis changed",
      );
      expect(sqlite.prepare("SELECT count(*) AS count FROM page_public_summary").get()?.count).toBe(
        0,
      );
      expect(
        sqlite.prepare("SELECT display_name,description FROM page WHERE id='page'").get(),
      ).toEqual({ display_name: "unchanged", description: "unchanged" });
    } finally {
      sqlite.close();
    }
  });

  it("interprets a saved succeeded capture that has no original analysis without changing capture time or owner schedule", async () => {
    const { sqlite, repo } = historyDatabase();
    try {
      const input = archiveInput("legacy", 1000);
      input.source = "legacy";
      const analysis = input.analysis!;
      input.analysis = null;
      input.metadata = null;
      await repo.archive(input);
      expect(await repo.getPublicVersion("page", "legacy")).toBeNull();
      await repo.appendAnalysis("page", analysis, input.rubrics[0]!);
      await repo.selectAnalysis("page", "legacy", analysis.id, null);
      expect((await repo.getPublicVersion("page", "legacy"))?.capturedAt).toBe(1000);
      expect(
        sqlite.prepare("SELECT next_scan_at FROM page_owner_state WHERE page_id='page'").get(),
      ).toBeUndefined();
      expect(
        sqlite.prepare("SELECT metadata_json FROM history_capture").get()?.metadata_json,
      ).toBeNull();
    } finally {
      sqlite.close();
    }
  });

  it("rejects comparisons of the same capture, another page, or an unselected capture", async () => {
    const { sqlite, repo } = historyDatabase();
    try {
      const before = archiveInput("before", 1000);
      const after = archiveInput("after", 2000);
      await repo.archive(before);
      await repo.archive(after);
      const comparison = {
        id: "pair",
        beforeRunId: "before",
        afterRunId: "after",
        beforeAnalysisId: before.analysis!.id,
        afterAnalysisId: after.analysis!.id,
        verifierVersion: "snapshot-diff-v1",
        model: null,
        status: "reviewed" as const,
        changes: [],
        createdAt: new Date(3000),
      };
      await expect(repo.persistComparison("other", comparison)).rejects.toThrow("not published");
      await expect(
        repo.persistComparison("page", {
          ...comparison,
          afterRunId: "before",
          afterAnalysisId: before.analysis!.id,
        }),
      ).rejects.toThrow();
      const unselected = archiveInput("unselected", 2500);
      const analysis = unselected.analysis!;
      unselected.source = "legacy";
      unselected.analysis = null;
      unselected.metadata = null;
      await repo.archive(unselected);
      await repo.appendAnalysis("page", analysis, unselected.rubrics[0]!);
      await expect(
        repo.persistComparison("page", {
          ...comparison,
          afterRunId: "unselected",
          afterAnalysisId: analysis.id,
        }),
      ).rejects.toThrow("not published");
      expect(sqlite.prepare("SELECT count(*) AS count FROM history_comparison").get()?.count).toBe(
        0,
      );
    } finally {
      sqlite.close();
    }
  });
});
