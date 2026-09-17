CREATE TABLE `refunds` (
	`id` text PRIMARY KEY NOT NULL,
	`payment_id` text NOT NULL,
	`customer_email` text NOT NULL,
	`card_last4` text NOT NULL,
	`merchant` text NOT NULL,
	`psp` text NOT NULL,
	`currency` text NOT NULL,
	`captured_minor` integer NOT NULL,
	`refunded_minor` integer NOT NULL,
	`amount_minor` integer NOT NULL,
	`usd_minor` integer NOT NULL,
	`reason_code` text NOT NULL,
	`disputed` integer NOT NULL,
	`status` text NOT NULL,
	`requested_by` text,
	`requested_at` integer NOT NULL,
	`settled_at` integer,
	`last_note` text,
	`version` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `refunds_status_idx` ON `refunds` (`status`);--> statement-breakpoint
CREATE INDEX `refunds_payment_idx` ON `refunds` (`payment_id`);