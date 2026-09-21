PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_page_public_summary` (
	`page_id` text PRIMARY KEY,
	`run_id` text NOT NULL UNIQUE,
	`rubric_id` text NOT NULL,
	`model` text NOT NULL,
	`choices_json` text DEFAULT '[]' NOT NULL,
	`signals_json` text DEFAULT '[]' NOT NULL,
	`tags_json` text DEFAULT '[]' NOT NULL,
	`browser_engine` text NOT NULL,
	`scanned_at` integer NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_page_public_summary_page_id_page_id_fk` FOREIGN KEY (`page_id`) REFERENCES `page`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
INSERT INTO `__new_page_public_summary`(`page_id`, `run_id`, `rubric_id`, `model`, `choices_json`, `signals_json`, `tags_json`, `browser_engine`, `scanned_at`, `updated_at`) SELECT `page_id`, `run_id`, `rubric_id`, `model`, `choices_json`, `signals_json`, `tags_json`, `browser_engine`, `scanned_at`, `updated_at` FROM `page_public_summary`;--> statement-breakpoint
DROP TABLE `page_public_summary`;--> statement-breakpoint
ALTER TABLE `__new_page_public_summary` RENAME TO `page_public_summary`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
DROP INDEX IF EXISTS `page_public_summary_score_idx`;--> statement-breakpoint
CREATE INDEX `page_public_summary_scanned_at_idx` ON `page_public_summary` (`scanned_at`,`page_id`);--> statement-breakpoint
ALTER TABLE `benchmark_snapshot` DROP COLUMN `score_distributions_json`;