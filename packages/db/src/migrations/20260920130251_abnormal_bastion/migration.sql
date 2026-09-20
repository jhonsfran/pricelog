ALTER TABLE `page_public_summary` ADD `choices_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `page_public_summary` ADD `signals_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `page_public_summary` ADD `tags_json` text DEFAULT '[]' NOT NULL;