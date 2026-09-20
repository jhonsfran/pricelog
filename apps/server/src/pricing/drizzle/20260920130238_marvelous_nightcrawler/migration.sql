ALTER TABLE `answer` ADD `type` text DEFAULT 'score' NOT NULL;--> statement-breakpoint
ALTER TABLE `answer` ADD `choice` text;--> statement-breakpoint
ALTER TABLE `answer` ADD `noul` real;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_answer` (
	`version_id` text NOT NULL,
	`question_set_id` text NOT NULL,
	`question_key` text NOT NULL,
	`type` text DEFAULT 'score' NOT NULL,
	`score` real,
	`choice` text,
	`noul` real,
	`confidence` real,
	`legend_json` text,
	`probabilities_json` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `answer_pk` PRIMARY KEY(`version_id`, `question_set_id`, `question_key`),
	CONSTRAINT `fk_answer_version_id_page_version_id_fk` FOREIGN KEY (`version_id`) REFERENCES `page_version`(`id`) ON DELETE CASCADE,
	CONSTRAINT "answer_value_check" CHECK(("type" = 'score' and "score" is not null and "choice" is null and "noul" is null) or ("type" = 'choice' and "score" is null and "choice" is not null and "noul" is null) or ("type" = 'noul' and "score" is null and "choice" is null and "noul" is not null)),
	CONSTRAINT "answer_score_check" CHECK("score" is null or ("score" >= 0 and "score" <= 4)),
	CONSTRAINT "answer_confidence_check" CHECK("confidence" is null or ("confidence" >= 0 and "confidence" <= 1)),
	CONSTRAINT "answer_noul_check" CHECK("noul" is null or ("noul" >= 0 and "noul" <= 1))
);
--> statement-breakpoint
INSERT INTO `__new_answer`(`version_id`, `question_set_id`, `question_key`, `score`, `confidence`, `legend_json`, `probabilities_json`, `created_at`) SELECT `version_id`, `question_set_id`, `question_key`, `score`, `confidence`, `legend_json`, `probabilities_json`, `created_at` FROM `answer`;--> statement-breakpoint
DROP TABLE `answer`;--> statement-breakpoint
ALTER TABLE `__new_answer` RENAME TO `answer`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_question` (
	`question_set_id` text NOT NULL,
	`key` text NOT NULL,
	`type` text NOT NULL,
	`instructions` text NOT NULL,
	`criteria_json` text NOT NULL,
	`minimum` integer,
	`maximum` integer,
	`position` integer NOT NULL,
	CONSTRAINT `question_pk` PRIMARY KEY(`question_set_id`, `key`),
	CONSTRAINT `fk_question_question_set_id_question_set_id_fk` FOREIGN KEY (`question_set_id`) REFERENCES `question_set`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
INSERT INTO `__new_question`(`question_set_id`, `key`, `type`, `instructions`, `criteria_json`, `minimum`, `maximum`, `position`) SELECT `question_set_id`, `key`, `type`, `instructions`, `criteria_json`, `minimum`, `maximum`, `position` FROM `question`;--> statement-breakpoint
DROP TABLE `question`;--> statement-breakpoint
ALTER TABLE `__new_question` RENAME TO `question`;--> statement-breakpoint
PRAGMA foreign_keys=ON;