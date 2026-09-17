CREATE TABLE `kyc_cases` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_name` text NOT NULL,
	`email` text NOT NULL,
	`date_of_birth` text NOT NULL,
	`document_type` text NOT NULL,
	`document_number` text NOT NULL,
	`country` text NOT NULL,
	`segment` text NOT NULL,
	`risk_score` integer NOT NULL,
	`risk_tier` text NOT NULL,
	`sanctions_hit` integer NOT NULL,
	`documents_complete` integer NOT NULL,
	`status` text NOT NULL,
	`opened_at` integer NOT NULL,
	`due_at` integer NOT NULL,
	`last_note` text,
	`decided_by` text,
	`version` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `kyc_cases_status_idx` ON `kyc_cases` (`status`);--> statement-breakpoint
CREATE INDEX `kyc_cases_risk_idx` ON `kyc_cases` (`risk_tier`);