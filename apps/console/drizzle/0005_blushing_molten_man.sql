CREATE TABLE `devin_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`spec` text NOT NULL,
	`tool` text NOT NULL,
	`scope` text NOT NULL,
	`intent` text NOT NULL,
	`context_sha256` text NOT NULL,
	`session_id` text,
	`status` text NOT NULL,
	`pr_url` text,
	`merge_commit` text,
	`reverses` text,
	`requested_by` text NOT NULL,
	`requested_by_role` text NOT NULL,
	`approved_by` text,
	`last_note` text,
	`requested_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`version` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `devin_runs_status_idx` ON `devin_runs` (`status`);--> statement-breakpoint
CREATE INDEX `devin_runs_tool_idx` ON `devin_runs` (`tool`);--> statement-breakpoint
CREATE INDEX `devin_runs_reverses_idx` ON `devin_runs` (`reverses`);