CREATE TABLE `version_comparison` (
	`id` text PRIMARY KEY,
	`before_run_id` text NOT NULL,
	`after_run_id` text NOT NULL,
	`verifier_version` text NOT NULL,
	`model` text,
	`status` text NOT NULL,
	`changes_json` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_version_comparison_before_run_id_version_evaluation_run_id_fk` FOREIGN KEY (`before_run_id`) REFERENCES `version_evaluation`(`run_id`),
	CONSTRAINT `fk_version_comparison_after_run_id_version_evaluation_run_id_fk` FOREIGN KEY (`after_run_id`) REFERENCES `version_evaluation`(`run_id`)
);
--> statement-breakpoint
CREATE TABLE `version_evaluation` (
	`run_id` text PRIMARY KEY,
	`rubric_id` text NOT NULL,
	`model` text NOT NULL,
	`evaluation_json` text NOT NULL,
	CONSTRAINT `fk_version_evaluation_run_id_page_version_run_id_fk` FOREIGN KEY (`run_id`) REFERENCES `page_version`(`run_id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `version_comparison_after_idx` ON `version_comparison` (`after_run_id`);