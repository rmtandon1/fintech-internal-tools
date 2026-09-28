ALTER TABLE `devin_runs` RENAME COLUMN "kind" TO "operation";--> statement-breakpoint
ALTER TABLE `devin_runs` DROP COLUMN `scope`;--> statement-breakpoint
UPDATE devin_runs SET operation = CASE WHEN operation = 'REVERSAL' THEN 'undo' ELSE 'change' END;