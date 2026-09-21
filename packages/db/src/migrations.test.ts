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
