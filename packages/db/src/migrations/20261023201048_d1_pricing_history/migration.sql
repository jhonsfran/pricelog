CREATE TABLE `history_analysis` (
	`page_id` text NOT NULL,
	`id` text NOT NULL,
	`run_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`rubric_id` text NOT NULL,
	`model` text NOT NULL,
	`created_at` integer NOT NULL,
	`envelope_json` text NOT NULL,
	CONSTRAINT `history_analysis_pk` PRIMARY KEY(`page_id`, `id`),
	CONSTRAINT `fk_history_analysis_page_id_run_id_history_capture_page_id_run_id_fk` FOREIGN KEY (`page_id`,`run_id`) REFERENCES `history_capture`(`page_id`,`run_id`),
	CONSTRAINT `fk_history_analysis_page_id_rubric_id_history_rubric_page_id_id_fk` FOREIGN KEY (`page_id`,`rubric_id`) REFERENCES `history_rubric`(`page_id`,`id`)
);
--> statement-breakpoint
CREATE TABLE `history_answers` (
	`page_id` text NOT NULL,
	`run_id` text NOT NULL,
	`rubric_id` text NOT NULL,
	`values_json` text NOT NULL,
	CONSTRAINT `history_answers_pk` PRIMARY KEY(`page_id`, `run_id`, `rubric_id`),
	CONSTRAINT `fk_history_answers_page_id_run_id_history_capture_page_id_run_id_fk` FOREIGN KEY (`page_id`,`run_id`) REFERENCES `history_capture`(`page_id`,`run_id`),
	CONSTRAINT `fk_history_answers_page_id_rubric_id_history_rubric_page_id_id_fk` FOREIGN KEY (`page_id`,`rubric_id`) REFERENCES `history_rubric`(`page_id`,`id`)
);
--> statement-breakpoint
CREATE TABLE `history_capture` (
	`page_id` text NOT NULL,
	`run_id` text NOT NULL,
	`captured_at` integer NOT NULL,
	`content_sha256` text NOT NULL,
	`manifest_json` text NOT NULL,
	`metadata_json` text,
	`selected_analysis_id` text,
	CONSTRAINT `history_capture_pk` PRIMARY KEY(`page_id`, `run_id`),
	CONSTRAINT `fk_history_capture_page_id_run_id_history_run_page_id_run_id_fk` FOREIGN KEY (`page_id`,`run_id`) REFERENCES `history_run`(`page_id`,`run_id`)
);
--> statement-breakpoint
CREATE TABLE `history_comparison` (
	`page_id` text NOT NULL,
	`id` text NOT NULL,
	`before_run_id` text NOT NULL,
	`after_run_id` text NOT NULL,
	`before_analysis_id` text NOT NULL,
	`after_analysis_id` text NOT NULL,
	`verifier_version` text NOT NULL,
	`payload_json` text NOT NULL,
	CONSTRAINT `history_comparison_pk` PRIMARY KEY(`page_id`, `id`),
	CONSTRAINT `fk_history_comparison_page_id_before_analysis_id_history_analysis_page_id_id_fk` FOREIGN KEY (`page_id`,`before_analysis_id`) REFERENCES `history_analysis`(`page_id`,`id`),
	CONSTRAINT `fk_history_comparison_page_id_after_analysis_id_history_analysis_page_id_id_fk` FOREIGN KEY (`page_id`,`after_analysis_id`) REFERENCES `history_analysis`(`page_id`,`id`),
	CONSTRAINT "history_comparison_distinct_capture" CHECK("before_run_id" != "after_run_id")
);
--> statement-breakpoint
CREATE TABLE `history_import` (
	`page_id` text PRIMARY KEY,
	`source_identity` text NOT NULL,
	`checkpoint` text,
	`expected_count` integer NOT NULL,
	`imported_count` integer NOT NULL,
	`ready` integer DEFAULT false NOT NULL,
	CONSTRAINT `fk_history_import_page_id_page_id_fk` FOREIGN KEY (`page_id`) REFERENCES `page`(`id`)
);
--> statement-breakpoint
CREATE TABLE `history_rubric` (
	`page_id` text NOT NULL,
	`id` text NOT NULL,
	`document_json` text NOT NULL,
	CONSTRAINT `history_rubric_pk` PRIMARY KEY(`page_id`, `id`),
	CONSTRAINT `fk_history_rubric_page_id_page_id_fk` FOREIGN KEY (`page_id`) REFERENCES `page`(`id`)
);
--> statement-breakpoint
CREATE TABLE `history_run` (
	`page_id` text NOT NULL,
	`run_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`status` text NOT NULL,
	`payload_json` text NOT NULL,
	CONSTRAINT `history_run_pk` PRIMARY KEY(`page_id`, `run_id`),
	CONSTRAINT `fk_history_run_page_id_page_id_fk` FOREIGN KEY (`page_id`) REFERENCES `page`(`id`),
	CONSTRAINT "history_run_terminal" CHECK("status" in ('succeeded', 'failed'))
);
--> statement-breakpoint
ALTER TABLE `page_public_summary` ADD `analysis_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `history_analysis_idempotency_idx` ON `history_analysis` (`page_id`,`run_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `history_analysis_capture_idx` ON `history_analysis` (`page_id`,`run_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `history_capture_order_idx` ON `history_capture` (`page_id`,`captured_at`,`run_id`);--> statement-breakpoint
CREATE INDEX `history_capture_week_idx` ON `history_capture` (`captured_at`,`page_id`,`run_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `history_comparison_pair_idx` ON `history_comparison` (`page_id`,`before_analysis_id`,`after_analysis_id`,`verifier_version`);--> statement-breakpoint
CREATE INDEX `history_run_order_idx` ON `history_run` (`page_id`,`created_at`,`run_id`);
--> statement-breakpoint
CREATE TRIGGER history_run_immutable BEFORE UPDATE ON history_run
WHEN NEW.page_id IS NOT OLD.page_id OR NEW.run_id IS NOT OLD.run_id OR NEW.created_at IS NOT OLD.created_at OR NEW.status IS NOT OLD.status OR NEW.payload_json IS NOT OLD.payload_json
BEGIN SELECT RAISE(ABORT, 'Immutable history_run identity conflict'); END;
CREATE TRIGGER history_capture_immutable BEFORE UPDATE ON history_capture
WHEN NEW.page_id IS NOT OLD.page_id OR NEW.run_id IS NOT OLD.run_id OR NEW.captured_at IS NOT OLD.captured_at OR NEW.content_sha256 IS NOT OLD.content_sha256 OR NEW.manifest_json IS NOT OLD.manifest_json OR NEW.metadata_json IS NOT OLD.metadata_json
BEGIN SELECT RAISE(ABORT, 'Immutable history_capture identity conflict'); END;
CREATE TRIGGER history_rubric_immutable BEFORE UPDATE ON history_rubric
WHEN NEW.page_id IS NOT OLD.page_id OR NEW.id IS NOT OLD.id OR NEW.document_json IS NOT OLD.document_json
BEGIN SELECT RAISE(ABORT, 'Immutable history_rubric identity conflict'); END;
CREATE TRIGGER history_analysis_immutable BEFORE UPDATE ON history_analysis
WHEN NEW.page_id IS NOT OLD.page_id OR NEW.id IS NOT OLD.id OR NEW.run_id IS NOT OLD.run_id OR NEW.idempotency_key IS NOT OLD.idempotency_key OR NEW.rubric_id IS NOT OLD.rubric_id OR NEW.model IS NOT OLD.model OR NEW.created_at IS NOT OLD.created_at OR NEW.envelope_json IS NOT OLD.envelope_json
BEGIN SELECT RAISE(ABORT, 'Immutable history_analysis identity conflict'); END;
CREATE TRIGGER history_answers_immutable BEFORE UPDATE ON history_answers
WHEN NEW.page_id IS NOT OLD.page_id OR NEW.run_id IS NOT OLD.run_id OR NEW.rubric_id IS NOT OLD.rubric_id OR NEW.values_json IS NOT OLD.values_json
BEGIN SELECT RAISE(ABORT, 'Immutable history_answers identity conflict'); END;
CREATE TRIGGER history_comparison_immutable BEFORE UPDATE ON history_comparison
WHEN NEW.page_id IS NOT OLD.page_id OR NEW.id IS NOT OLD.id OR NEW.before_run_id IS NOT OLD.before_run_id OR NEW.after_run_id IS NOT OLD.after_run_id OR NEW.before_analysis_id IS NOT OLD.before_analysis_id OR NEW.after_analysis_id IS NOT OLD.after_analysis_id OR NEW.verifier_version IS NOT OLD.verifier_version OR NEW.payload_json IS NOT OLD.payload_json
BEGIN SELECT RAISE(ABORT, 'Immutable history_comparison identity conflict'); END;
CREATE TRIGGER history_capture_selection_insert BEFORE UPDATE OF selected_analysis_id ON history_capture
WHEN NEW.selected_analysis_id IS NOT NULL AND NOT EXISTS (
 SELECT 1 FROM history_analysis a JOIN history_run r ON r.page_id=a.page_id AND r.run_id=a.run_id
 WHERE a.page_id=NEW.page_id AND a.run_id=NEW.run_id AND a.id=NEW.selected_analysis_id AND r.status='succeeded'
)
BEGIN SELECT RAISE(ABORT, 'Analysis does not belong to a published capture'); END;
CREATE TRIGGER history_comparison_scope BEFORE INSERT ON history_comparison
WHEN NOT EXISTS (
 SELECT 1 FROM history_analysis b JOIN history_analysis a ON a.page_id=b.page_id
 JOIN history_run br ON br.page_id=b.page_id AND br.run_id=b.run_id
 JOIN history_run ar ON ar.page_id=a.page_id AND ar.run_id=a.run_id
 WHERE b.page_id=NEW.page_id AND b.id=NEW.before_analysis_id AND a.id=NEW.after_analysis_id
 AND b.run_id=NEW.before_run_id AND a.run_id=NEW.after_run_id AND br.status='succeeded' AND ar.status='succeeded'
)
BEGIN SELECT RAISE(ABORT, 'Comparison does not reference published captures'); END;
