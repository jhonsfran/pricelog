CREATE TABLE `benchmark_snapshot` (
	`id` text PRIMARY KEY,
	`rubric_id` text NOT NULL,
	`cohort` text NOT NULL,
	`computed_at` integer NOT NULL,
	`page_count` integer NOT NULL,
	`score_distributions_json` text NOT NULL,
	`choice_shares_json` text NOT NULL,
	`signal_counts_json` text NOT NULL,
	CONSTRAINT "benchmark_snapshot_page_count_check" CHECK("page_count" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `benchmark_snapshot_rubric_cohort_computed_at_idx` ON `benchmark_snapshot` (`rubric_id`,`cohort`,`computed_at`);--> statement-breakpoint
CREATE INDEX `benchmark_snapshot_computed_at_idx` ON `benchmark_snapshot` (`computed_at`);
