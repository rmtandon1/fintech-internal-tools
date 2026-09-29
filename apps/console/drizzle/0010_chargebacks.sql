CREATE TABLE `chargebacks` (
	`id` text PRIMARY KEY NOT NULL,
	`card_network` text NOT NULL,
	`reason_code` text NOT NULL,
	`reason_category` text NOT NULL,
	`merchant` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`opened_at` integer NOT NULL,
	`due_at` integer NOT NULL,
	`status` text NOT NULL,
	`evidence_uploaded` integer NOT NULL,
	`notes` text,
	`decided_by` text,
	`version` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `chargebacks_status_idx` ON `chargebacks` (`status`);--> statement-breakpoint
CREATE INDEX `chargebacks_due_idx` ON `chargebacks` (`due_at`);