CREATE TABLE `kyc_checks` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`kind` text NOT NULL,
	`result` text NOT NULL,
	`source` text NOT NULL,
	`detail` text NOT NULL,
	`checked_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `kyc_checks_case_idx` ON `kyc_checks` (`case_id`);--> statement-breakpoint
CREATE TABLE `kyc_discrepancies` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`topic` text NOT NULL,
	`declared` text NOT NULL,
	`found` text NOT NULL,
	`source` text NOT NULL,
	`severity` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `kyc_discrepancies_case_idx` ON `kyc_discrepancies` (`case_id`);--> statement-breakpoint
ALTER TABLE `kyc_cases` ADD `pep` integer DEFAULT 0 NOT NULL;