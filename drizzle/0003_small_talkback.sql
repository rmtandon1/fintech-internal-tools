CREATE TABLE `feature_flags` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`description` text NOT NULL,
	`flag_type` text NOT NULL,
	`environment` text NOT NULL,
	`owner` text NOT NULL,
	`enabled` integer NOT NULL,
	`rollout_percent` integer NOT NULL,
	`customer_facing` integer NOT NULL,
	`status` text NOT NULL,
	`expires_at` integer,
	`last_changed_by` text,
	`last_changed_at` integer NOT NULL,
	`last_note` text,
	`version` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `feature_flags_key_unique` ON `feature_flags` (`key`);--> statement-breakpoint
CREATE INDEX `feature_flags_status_idx` ON `feature_flags` (`status`);--> statement-breakpoint
CREATE INDEX `feature_flags_env_idx` ON `feature_flags` (`environment`);