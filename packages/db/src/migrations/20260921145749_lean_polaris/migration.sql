CREATE TABLE `pricing_comparison` (
	`id` text PRIMARY KEY,
	`before_run_id` text NOT NULL,
	`after_run_id` text NOT NULL,
	`verifier_version` text NOT NULL,
	`model` text,
	`status` text NOT NULL,
	`changes_json` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_pricing_comparison_before_run_id_pricing_observation_run_id_fk` FOREIGN KEY (`before_run_id`) REFERENCES `pricing_observation`(`run_id`),
	CONSTRAINT `fk_pricing_comparison_after_run_id_pricing_observation_run_id_fk` FOREIGN KEY (`after_run_id`) REFERENCES `pricing_observation`(`run_id`)
);
--> statement-breakpoint
CREATE TABLE `pricing_observation` (
	`run_id` text PRIMARY KEY,
	`page_id` text NOT NULL,
	`rubric_id` text NOT NULL,
	`model` text NOT NULL,
	`captured_at` integer NOT NULL,
	`content_key` text NOT NULL,
	`content_sha256` text NOT NULL,
	`choices_json` text NOT NULL,
	`signals_json` text NOT NULL,
	CONSTRAINT `fk_pricing_observation_page_id_page_id_fk` FOREIGN KEY (`page_id`) REFERENCES `page`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
ALTER TABLE `benchmark_snapshot` ADD `signal_shares_json` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_benchmark_snapshot` (
	`id` text PRIMARY KEY,
	`rubric_id` text DEFAULT 'pricing-intelligence-v4' NOT NULL,
	`cohort` text NOT NULL,
	`computed_at` integer NOT NULL,
	`page_count` integer NOT NULL,
	`score_distributions_json` text NOT NULL,
	`choice_shares_json` text NOT NULL,
	`signal_counts_json` text NOT NULL,
	`signal_shares_json` text DEFAULT '{}' NOT NULL,
	CONSTRAINT "benchmark_snapshot_page_count_check" CHECK("page_count" >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_benchmark_snapshot`(`id`, `rubric_id`, `cohort`, `computed_at`, `page_count`, `score_distributions_json`, `choice_shares_json`, `signal_counts_json`) SELECT `id`, `rubric_id`, `cohort`, `computed_at`, `page_count`, `score_distributions_json`, `choice_shares_json`, `signal_counts_json` FROM `benchmark_snapshot`;--> statement-breakpoint
DROP TABLE `benchmark_snapshot`;--> statement-breakpoint
ALTER TABLE `__new_benchmark_snapshot` RENAME TO `benchmark_snapshot`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `benchmark_snapshot_rubric_cohort_computed_at_idx` ON `benchmark_snapshot` (`rubric_id`,`cohort`,`computed_at`);--> statement-breakpoint
CREATE INDEX `benchmark_snapshot_computed_at_idx` ON `benchmark_snapshot` (`computed_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `pricing_comparison_pair_verifier_idx` ON `pricing_comparison` (`before_run_id`,`after_run_id`,`verifier_version`);--> statement-breakpoint
CREATE INDEX `pricing_observation_rubric_capture_idx` ON `pricing_observation` (`rubric_id`,`captured_at`,`run_id`);--> statement-breakpoint
CREATE INDEX `pricing_observation_page_capture_idx` ON `pricing_observation` (`page_id`,`captured_at`);