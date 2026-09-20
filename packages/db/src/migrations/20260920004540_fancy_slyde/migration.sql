CREATE TABLE `account` (
	`id` text PRIMARY KEY,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_account_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL UNIQUE,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	CONSTRAINT `fk_session_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`email` text NOT NULL UNIQUE,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `page` (
	`id` text PRIMARY KEY,
	`owner_user_id` text NOT NULL,
	`normalized_domain` text NOT NULL UNIQUE,
	`canonical_url` text NOT NULL,
	`slug` text NOT NULL UNIQUE,
	`display_name` text,
	`description` text,
	`state` text DEFAULT 'pending' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_page_owner_user_id_user_id_fk` FOREIGN KEY (`owner_user_id`) REFERENCES `user`(`id`),
	CONSTRAINT "page_state_check" CHECK("state" in ('pending', 'active'))
);
--> statement-breakpoint
CREATE TABLE `page_owner_state` (
	`page_id` text PRIMARY KEY,
	`active_run_id` text,
	`last_run_id` text,
	`last_run_status` text,
	`next_scan_at` integer,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_page_owner_state_page_id_page_id_fk` FOREIGN KEY (`page_id`) REFERENCES `page`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `page_public_summary` (
	`page_id` text PRIMARY KEY,
	`run_id` text NOT NULL UNIQUE,
	`rubric_id` text NOT NULL,
	`model` text NOT NULL,
	`overall_score` real NOT NULL,
	`scores_json` text NOT NULL,
	`browser_engine` text NOT NULL,
	`scanned_at` integer NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_page_public_summary_page_id_page_id_fk` FOREIGN KEY (`page_id`) REFERENCES `page`(`id`) ON DELETE CASCADE,
	CONSTRAINT "page_public_summary_score_check" CHECK("overall_score" >= 0 and "overall_score" <= 100)
);
--> statement-breakpoint
CREATE INDEX `account_userId_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE INDEX `session_userId_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);--> statement-breakpoint
CREATE INDEX `page_owner_created_at_idx` ON `page` (`owner_user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `page_state_created_at_idx` ON `page` (`state`,`created_at`);--> statement-breakpoint
CREATE INDEX `page_public_summary_score_idx` ON `page_public_summary` (`overall_score`,`page_id`);--> statement-breakpoint
CREATE INDEX `page_public_summary_scanned_at_idx` ON `page_public_summary` (`scanned_at`,`page_id`);