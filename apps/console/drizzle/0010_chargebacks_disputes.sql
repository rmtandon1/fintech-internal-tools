CREATE TABLE `disputes` (
	`id` text PRIMARY KEY NOT NULL,
	`card_network` text NOT NULL,
	`reason_code` text NOT NULL,
	`reason_category` text NOT NULL,
	`merchant` text NOT NULL,
	`usd_minor` integer NOT NULL,
	`opened_at` integer NOT NULL,
	`due_at` integer NOT NULL,
	`status` text NOT NULL,
	`evidence_uploaded` integer NOT NULL,
	`notes` text,
	`version` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `disputes_status_idx` ON `disputes` (`status`);--> statement-breakpoint
CREATE INDEX `disputes_due_idx` ON `disputes` (`due_at`);