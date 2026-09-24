-- Expand frozen approval rows from the flat analyst/manager/admin roles to
-- domain-scoped roles. Audit rows keep their historical role strings.
UPDATE approval_requests SET allowed_roles_json = replace(allowed_roles_json, '"manager"', '"' || tool || '_manager"') WHERE tool IN ('kyc','refunds');--> statement-breakpoint
UPDATE approval_requests SET allowed_roles_json = replace(allowed_roles_json, '"manager"', '"kyc_manager","refunds_manager"') WHERE tool = 'flags';--> statement-breakpoint
UPDATE approval_requests SET requester_role = CASE tool WHEN 'kyc' THEN 'kyc_reviewer' WHEN 'refunds' THEN 'refunds_agent' ELSE 'kyc_reviewer' END WHERE requester_role = 'analyst';--> statement-breakpoint
UPDATE approval_requests SET requester_role = tool || '_manager' WHERE requester_role = 'manager' AND tool IN ('kyc','refunds');--> statement-breakpoint
UPDATE approval_requests SET requester_role = 'kyc_manager' WHERE requester_role = 'manager' AND tool = 'flags';
