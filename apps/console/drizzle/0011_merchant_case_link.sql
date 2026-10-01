CREATE TABLE `merchant_registry_status` (
	`case_id` text PRIMARY KEY NOT NULL,
	`company_status` text NOT NULL,
	`checked_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `refunds` ADD `merchant_case_id` text;--> statement-breakpoint
CREATE INDEX `refunds_merchant_case_idx` ON `refunds` (`merchant_case_id`);--> statement-breakpoint
UPDATE `refunds` SET `merchant_case_id` = (
	SELECT `kyc_cases`.`id` FROM `kyc_cases`
	WHERE `kyc_cases`.`segment` = 'business'
		AND lower(`kyc_cases`.`customer_name`) IN (
			lower(`refunds`.`merchant`),
			lower(`refunds`.`merchant`) || ' limited',
			lower(`refunds`.`merchant`) || ' ltd'
		)
	ORDER BY `kyc_cases`.`id`
	LIMIT 1
) WHERE `merchant_case_id` IS NULL;
