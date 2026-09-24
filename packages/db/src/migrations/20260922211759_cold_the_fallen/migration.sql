ALTER TABLE `page_public_summary` ADD `pricing_facts_json` text;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_benchmark_snapshot` (
	`id` text PRIMARY KEY,
	`rubric_id` text NOT NULL,
	`cohort` text NOT NULL,
	`computed_at` integer NOT NULL,
	`page_count` integer NOT NULL,
	`numeric_prices_json` text,
	`choice_shares_json` text NOT NULL,
	`signal_counts_json` text NOT NULL,
	`signal_shares_json` text DEFAULT '{}' NOT NULL,
	CONSTRAINT "benchmark_snapshot_page_count_check" CHECK("page_count" >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_benchmark_snapshot`(`id`, `rubric_id`, `cohort`, `computed_at`, `page_count`, `numeric_prices_json`, `choice_shares_json`, `signal_counts_json`, `signal_shares_json`) SELECT `id`, `rubric_id`, `cohort`, `computed_at`, `page_count`, `numeric_prices_json`, `choice_shares_json`, `signal_counts_json`, `signal_shares_json` FROM `benchmark_snapshot`;--> statement-breakpoint
DROP TABLE `benchmark_snapshot`;--> statement-breakpoint
ALTER TABLE `__new_benchmark_snapshot` RENAME TO `benchmark_snapshot`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `benchmark_snapshot_rubric_cohort_computed_at_idx` ON `benchmark_snapshot` (`rubric_id`,`cohort`,`computed_at`);--> statement-breakpoint
CREATE INDEX `benchmark_snapshot_computed_at_idx` ON `benchmark_snapshot` (`computed_at`);