import { createClient } from "@libsql/client";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationsDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "migrations");
const legacyMigrationPath = resolve(
  migrationsDirectory,
  "20260920202340_swift_groot/migration.sql",
);
const rubricMigrationPath = resolve(
  migrationsDirectory,
  "20260921123524_add_benchmark_rubric_id/migration.sql",
);

describe("D1 migrations", () => {
  it("preserves benchmark snapshots and removes misplaced page history", async () => {
    const database = createClient({ url: "file::memory:" });
    try {
      await database.executeMultiple(
        await readFile(
          resolve(migrationsDirectory, "20260920004540_fancy_slyde/migration.sql"),
          "utf8",
        ),
      );
      await database.executeMultiple(
        await readFile(
          resolve(migrationsDirectory, "20260920130251_abnormal_bastion/migration.sql"),
          "utf8",
        ),
      );
      await database.executeMultiple(await readFile(legacyMigrationPath, "utf8"));
      await database.executeMultiple(await readFile(rubricMigrationPath, "utf8"));
      await database.execute(`insert into benchmark_snapshot (id, cohort, computed_at, page_count,
        score_distributions_json, choice_shares_json, signal_counts_json)
        values ('legacy', 'all', 1, 10, '{}', '{}', '{}')`);
      await database.executeMultiple(
        await readFile(
          resolve(migrationsDirectory, "20260921145749_lean_polaris/migration.sql"),
          "utf8",
        ),
      );
      const old = await database.execute(
        "select rubric_id, signal_shares_json from benchmark_snapshot where id = 'legacy'",
      );
      expect(old.rows[0]).toMatchObject({
        rubric_id: "pricing-intelligence-v3",
        signal_shares_json: "{}",
      });
      await database.executeMultiple(
        await readFile(
          resolve(migrationsDirectory, "20260921154805_cuddly_colleen_wing/migration.sql"),
          "utf8",
        ),
      );
      const historyTables = await database.execute(
        "select name from sqlite_master where type = 'table' and name in ('pricing_observation', 'pricing_comparison')",
      );
      expect(historyTables.rows).toEqual([]);
      await database.executeMultiple(
        await readFile(
          resolve(migrationsDirectory, "20260921155237_strong_captain_universe/migration.sql"),
          "utf8",
        ),
      );
      const publicColumns = await database.execute("pragma table_info(page_public_summary)");
      expect(publicColumns.rows.map((row) => row.name)).not.toContain("overall_score");
      expect(publicColumns.rows.map((row) => row.name)).not.toContain("scores_json");
      const benchmarkColumns = await database.execute("pragma table_info(benchmark_snapshot)");
      expect(benchmarkColumns.rows.map((row) => row.name)).not.toContain(
        "score_distributions_json",
      );
      await database.executeMultiple(
        await readFile(
          resolve(migrationsDirectory, "20260921201233_marvelous_retro_girl/migration.sql"),
          "utf8",
        ),
      );
      await database.executeMultiple(
        await readFile(
          resolve(migrationsDirectory, "20260921205419_quiet_deadpool/migration.sql"),
          "utf8",
        ),
      );
      await database.execute(`insert into benchmark_snapshot
        (id, cohort, computed_at, page_count, choice_shares_json, signal_counts_json)
        values ('current', 'ai_applications', 2, 40, '{}', '{}')`);
      const rubricVersions = await database.execute(
        "select id, rubric_id from benchmark_snapshot order by id",
      );
      expect(rubricVersions.rows).toEqual([
        { id: "current", rubric_id: "pricing-intelligence-v5" },
        { id: "legacy", rubric_id: "pricing-intelligence-v3" },
      ]);
      await database.executeMultiple(
        await readFile(
          resolve(migrationsDirectory, "20260922063454_loud_glorian/migration.sql"),
          "utf8",
        ),
      );
      const numericHistory = await database.execute(
        "select id, numeric_prices_json from benchmark_snapshot order by id",
      );
      expect(numericHistory.rows).toEqual([
        { id: "current", numeric_prices_json: null },
        { id: "legacy", numeric_prices_json: null },
      ]);
      expect(
        (await database.execute("pragma table_info(page_public_summary)")).rows.map(
          (row) => row.name,
        ),
      ).toContain("numeric_prices_json");
      const retained = await database.execute(
        "select name from sqlite_master where type = 'table' and name in ('user', 'session', 'page', 'page_public_summary', 'benchmark_snapshot') order by name",
      );
      expect(retained.rows.map((row) => row.name)).toEqual([
        "benchmark_snapshot",
        "page",
        "page_public_summary",
        "session",
        "user",
      ]);
    } finally {
      database.close();
    }
  });

  it("adds a rubric ID to existing benchmark snapshots", async () => {
    const database = createClient({ url: "file::memory:" });
    const [legacyMigration, rubricMigration] = await Promise.all([
      readFile(legacyMigrationPath, "utf8"),
      readFile(rubricMigrationPath, "utf8"),
    ]);

    try {
      await database.executeMultiple(legacyMigration);
      await database.execute({
        sql: `insert into benchmark_snapshot (
          id, cohort, computed_at, page_count,
          score_distributions_json, choice_shares_json, signal_counts_json
        ) values (?, ?, ?, ?, ?, ?, ?)`,
        args: ["legacy", "all", 1, 10, "{}", "{}", "{}"],
      });

      await database.executeMultiple(rubricMigration);

      const result = await database.execute(
        "select rubric_id from benchmark_snapshot where id = 'legacy'",
      );
      expect(result.rows[0]?.rubric_id).toBe("pricing-intelligence-v3");
    } finally {
      database.close();
    }
  });
});
