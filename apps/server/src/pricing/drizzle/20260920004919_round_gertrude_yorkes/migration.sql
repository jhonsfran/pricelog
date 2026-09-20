CREATE TABLE `answer` (
	`version_id` text NOT NULL,
	`question_set_id` text NOT NULL,
	`question_key` text NOT NULL,
	`score` real NOT NULL,
	`confidence` real NOT NULL,
	`legend_json` text NOT NULL,
	`probabilities_json` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `answer_pk` PRIMARY KEY(`version_id`, `question_set_id`, `question_key`),
	CONSTRAINT `fk_answer_version_id_page_version_id_fk` FOREIGN KEY (`version_id`) REFERENCES `page_version`(`id`) ON DELETE CASCADE,
	CONSTRAINT "answer_score_check" CHECK("score" >= 0 and "score" <= 4),
	CONSTRAINT "answer_confidence_check" CHECK("confidence" >= 0 and "confidence" <= 1)
);
--> statement-breakpoint
CREATE TABLE `page_config` (
	`id` integer PRIMARY KEY,
	`page_id` text NOT NULL UNIQUE,
	`normalized_domain` text NOT NULL,
	`canonical_url` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT "page_config_singleton_check" CHECK("id" = 1)
);
--> statement-breakpoint
CREATE TABLE `page_version` (
	`id` text PRIMARY KEY,
	`run_id` text NOT NULL UNIQUE,
	`captured_at` integer NOT NULL,
	`http_status` integer NOT NULL,
	`final_url` text NOT NULL,
	`title` text,
	`browser_engine` text NOT NULL,
	`html_key` text NOT NULL,
	`screenshot_key` text NOT NULL,
	`content_key` text NOT NULL,
	`html_sha256` text NOT NULL,
	`screenshot_sha256` text NOT NULL,
	`content_sha256` text NOT NULL,
	`html_bytes` integer NOT NULL,
	`screenshot_bytes` integer NOT NULL,
	`content_bytes` integer NOT NULL,
	CONSTRAINT `fk_page_version_run_id_scan_run_id_fk` FOREIGN KEY (`run_id`) REFERENCES `scan_run`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `question` (
	`question_set_id` text NOT NULL,
	`key` text NOT NULL,
	`type` text NOT NULL,
	`instructions` text NOT NULL,
	`criteria_json` text NOT NULL,
	`minimum` integer DEFAULT 0 NOT NULL,
	`maximum` integer DEFAULT 4 NOT NULL,
	`position` integer NOT NULL,
	CONSTRAINT `question_pk` PRIMARY KEY(`question_set_id`, `key`),
	CONSTRAINT `fk_question_question_set_id_question_set_id_fk` FOREIGN KEY (`question_set_id`) REFERENCES `question_set`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `question_set` (
	`id` text PRIMARY KEY,
	`model` text NOT NULL,
	`version` integer NOT NULL,
	`active` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `scan_run` (
	`id` text PRIMARY KEY,
	`trigger` text NOT NULL,
	`status` text NOT NULL,
	`stage` text NOT NULL,
	`workflow_instance_id` text NOT NULL UNIQUE,
	`requested_by_user_id` text,
	`browser_engine` text,
	`error_code` text,
	`error_message` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`started_at` integer,
	`completed_at` integer
);
--> statement-breakpoint
CREATE TABLE `scheduler_state` (
	`id` integer PRIMARY KEY,
	`active_run_id` text,
	`next_scan_at` integer,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT "scheduler_state_singleton_check" CHECK("id" = 1)
);
--> statement-breakpoint
CREATE INDEX `scan_run_created_at_idx` ON `scan_run` (`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `scan_run_status_created_at_idx` ON `scan_run` (`status`,`created_at`);