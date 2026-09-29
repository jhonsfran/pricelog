CREATE TABLE `waitlist_entry` (
	`id` text PRIMARY KEY,
	`email` text NOT NULL UNIQUE,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT "waitlist_entry_email_normalized" CHECK("email" = lower(trim("email")))
);
