CREATE TABLE `chargeback_disputes` (
	`id` text PRIMARY KEY NOT NULL,
	`card_network` text NOT NULL,
	`reason_code` text NOT NULL,
	`reason_category` text NOT NULL,
	`merchant` text NOT NULL,
	`amount_usd_minor` integer NOT NULL,
	`opened_at` integer NOT NULL,
	`due_at` integer NOT NULL,
	`status` text NOT NULL,
	`evidence_uploaded` integer NOT NULL,
	`notes` text,
	`version` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `chargeback_disputes_status_idx` ON `chargeback_disputes` (`status`);--> statement-breakpoint
CREATE INDEX `chargeback_disputes_due_idx` ON `chargeback_disputes` (`due_at`);