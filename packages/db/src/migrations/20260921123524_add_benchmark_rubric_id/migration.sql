ALTER TABLE `benchmark_snapshot` ADD `rubric_id` text DEFAULT 'pricing-intelligence-v3' NOT NULL;--> statement-breakpoint
DROP INDEX IF EXISTS `benchmark_snapshot_cohort_computed_at_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `benchmark_snapshot_rubric_cohort_computed_at_idx` ON `benchmark_snapshot` (`rubric_id`,`cohort`,`computed_at`);
