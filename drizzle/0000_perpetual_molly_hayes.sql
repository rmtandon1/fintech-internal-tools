CREATE TABLE `approval_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`tool` text NOT NULL,
	`action` text NOT NULL,
	`record_type` text NOT NULL,
	`record_id` text,
	`record_version` integer,
	`payload_json` text NOT NULL,
	`trace_json` text NOT NULL,
	`decision_json` text NOT NULL,
	`summary` text NOT NULL,
	`reason` text NOT NULL,
	`tier` text NOT NULL,
	`allowed_roles_json` text NOT NULL,
	`requester_id` text NOT NULL,
	`requester_role` text NOT NULL,
	`status` text NOT NULL,
	`decided_by` text,
	`decided_at` integer,
	`decision_note` text,
	`failure_code` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `approval_requests_status_idx` ON `approval_requests` (`status`);--> statement-breakpoint
CREATE TABLE `audit_head` (
	`id` integer PRIMARY KEY NOT NULL,
	`seq` integer NOT NULL,
	`row_hash` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id` text NOT NULL,
	`ts` integer NOT NULL,
	`actor_id` text NOT NULL,
	`actor_role` text NOT NULL,
	`tool` text NOT NULL,
	`action` text NOT NULL,
	`record_type` text NOT NULL,
	`record_id` text NOT NULL,
	`event` text NOT NULL,
	`summary` text NOT NULL,
	`payload_json` text NOT NULL,
	`before_json` text,
	`after_json` text,
	`decision_json` text NOT NULL,
	`prev_hash` text NOT NULL,
	`row_hash` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `audit_log_id_unique` ON `audit_log` (`id`);--> statement-breakpoint
CREATE INDEX `audit_log_record_idx` ON `audit_log` (`record_type`,`record_id`);--> statement-breakpoint
CREATE INDEX `audit_log_tool_idx` ON `audit_log` (`tool`);--> statement-breakpoint
CREATE INDEX `audit_log_ts_idx` ON `audit_log` (`ts`);--> statement-breakpoint
CREATE TABLE `idempotency_keys` (
	`key` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`tool` text NOT NULL,
	`action` text NOT NULL,
	`request_hash` text NOT NULL,
	`status` text NOT NULL,
	`result_json` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `runtime_constants` (
	`key` text PRIMARY KEY NOT NULL,
	`value_json` text NOT NULL,
	`type` text NOT NULL,
	`description` text NOT NULL,
	`tool` text NOT NULL,
	`updated_at` integer NOT NULL,
	`updated_by` text NOT NULL
);
