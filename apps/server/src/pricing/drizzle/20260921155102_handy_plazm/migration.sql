PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_answer` (
	`version_id` text NOT NULL,
	`question_set_id` text NOT NULL,
	`question_key` text NOT NULL,
	`type` text NOT NULL,
	`choice` text,
	`noul` real,
	`confidence` real,
	`probabilities_json` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `answer_pk` PRIMARY KEY(`version_id`, `question_set_id`, `question_key`),
	CONSTRAINT `fk_answer_version_id_page_version_id_fk` FOREIGN KEY (`version_id`) REFERENCES `page_version`(`id`) ON DELETE CASCADE,
	CONSTRAINT "answer_value_check" CHECK(("type" = 'choice' and "choice" is not null and "noul" is null) or ("type" = 'noul' and "choice" is null and "noul" is not null)),
	CONSTRAINT "answer_confidence_check" CHECK("confidence" is null or ("confidence" >= 0 and "confidence" <= 1)),
	CONSTRAINT "answer_noul_check" CHECK("noul" is null or ("noul" >= 0 and "noul" <= 1))
);
--> statement-breakpoint
INSERT INTO `__new_answer`(`version_id`, `question_set_id`, `question_key`, `type`, `choice`, `noul`, `confidence`, `probabilities_json`, `created_at`) SELECT `version_id`, `question_set_id`, `question_key`, `type`, `choice`, `noul`, `confidence`, `probabilities_json`, `created_at` FROM `answer` WHERE `type` IN ('choice', 'noul');--> statement-breakpoint
DROP TABLE `answer`;--> statement-breakpoint
ALTER TABLE `__new_answer` RENAME TO `answer`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `question` DROP COLUMN `minimum`;--> statement-breakpoint
ALTER TABLE `question` DROP COLUMN `maximum`;
--> statement-breakpoint
DELETE FROM `question` WHERE `type` = 'score';
