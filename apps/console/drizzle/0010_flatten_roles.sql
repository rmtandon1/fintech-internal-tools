UPDATE approval_requests
SET allowed_roles_json = (
  SELECT json_group_array(role)
  FROM (
    SELECT DISTINCT CASE value
      WHEN 'kyc_reviewer' THEN 'analyst'
      WHEN 'refunds_agent' THEN 'analyst'
      WHEN 'kyc_manager' THEN 'manager'
      WHEN 'refunds_manager' THEN 'manager'
      ELSE value
    END AS role
    FROM json_each(approval_requests.allowed_roles_json)
    ORDER BY CASE role
      WHEN 'analyst' THEN 1
      WHEN 'manager' THEN 2
      WHEN 'admin' THEN 3
      WHEN 'engineer' THEN 4
      ELSE 5
    END
  )
)
WHERE allowed_roles_json LIKE '%kyc_reviewer%'
   OR allowed_roles_json LIKE '%refunds_agent%'
   OR allowed_roles_json LIKE '%kyc_manager%'
   OR allowed_roles_json LIKE '%refunds_manager%';
--> statement-breakpoint
UPDATE approval_requests
SET requester_role = CASE requester_role
  WHEN 'kyc_reviewer' THEN 'analyst'
  WHEN 'refunds_agent' THEN 'analyst'
  WHEN 'kyc_manager' THEN 'manager'
  WHEN 'refunds_manager' THEN 'manager'
  ELSE requester_role
END
WHERE requester_role IN ('kyc_reviewer', 'refunds_agent', 'kyc_manager', 'refunds_manager');
--> statement-breakpoint
UPDATE devin_runs
SET requested_by_role = CASE requested_by_role
  WHEN 'kyc_reviewer' THEN 'analyst'
  WHEN 'refunds_agent' THEN 'analyst'
  WHEN 'kyc_manager' THEN 'manager'
  WHEN 'refunds_manager' THEN 'manager'
  ELSE requested_by_role
END
WHERE requested_by_role IN ('kyc_reviewer', 'refunds_agent', 'kyc_manager', 'refunds_manager');
--> statement-breakpoint
UPDATE approval_requests
SET requester_id = CASE requester_id
  WHEN 'usr_kyc_reviewer' THEN 'usr_analyst'
  WHEN 'usr_refunds_agent' THEN 'usr_analyst'
  WHEN 'usr_kyc_manager' THEN 'usr_manager'
  WHEN 'usr_refunds_manager' THEN 'usr_manager'
  WHEN 'usr_kyc_manager_2' THEN 'usr_manager'
  ELSE requester_id
END
WHERE requester_id IN ('usr_kyc_reviewer', 'usr_refunds_agent', 'usr_kyc_manager', 'usr_refunds_manager', 'usr_kyc_manager_2');
--> statement-breakpoint
UPDATE approval_requests
SET decided_by = CASE decided_by
  WHEN 'usr_kyc_reviewer' THEN 'usr_analyst'
  WHEN 'usr_refunds_agent' THEN 'usr_analyst'
  WHEN 'usr_kyc_manager' THEN 'usr_manager'
  WHEN 'usr_refunds_manager' THEN 'usr_manager'
  WHEN 'usr_kyc_manager_2' THEN 'usr_manager'
  ELSE decided_by
END
WHERE decided_by IN ('usr_kyc_reviewer', 'usr_refunds_agent', 'usr_kyc_manager', 'usr_refunds_manager', 'usr_kyc_manager_2');
--> statement-breakpoint
UPDATE idempotency_keys
SET actor_id = CASE actor_id
  WHEN 'usr_kyc_reviewer' THEN 'usr_analyst'
  WHEN 'usr_refunds_agent' THEN 'usr_analyst'
  WHEN 'usr_kyc_manager' THEN 'usr_manager'
  WHEN 'usr_refunds_manager' THEN 'usr_manager'
  WHEN 'usr_kyc_manager_2' THEN 'usr_manager'
  ELSE actor_id
END
WHERE actor_id IN ('usr_kyc_reviewer', 'usr_refunds_agent', 'usr_kyc_manager', 'usr_refunds_manager', 'usr_kyc_manager_2');
--> statement-breakpoint
UPDATE runtime_constants
SET updated_by = CASE updated_by
  WHEN 'usr_kyc_reviewer' THEN 'usr_analyst'
  WHEN 'usr_refunds_agent' THEN 'usr_analyst'
  WHEN 'usr_kyc_manager' THEN 'usr_manager'
  WHEN 'usr_refunds_manager' THEN 'usr_manager'
  WHEN 'usr_kyc_manager_2' THEN 'usr_manager'
  ELSE updated_by
END
WHERE updated_by IN ('usr_kyc_reviewer', 'usr_refunds_agent', 'usr_kyc_manager', 'usr_refunds_manager', 'usr_kyc_manager_2');
--> statement-breakpoint
UPDATE devin_runs
SET requested_by = CASE requested_by
  WHEN 'usr_kyc_reviewer' THEN 'usr_analyst'
  WHEN 'usr_refunds_agent' THEN 'usr_analyst'
  WHEN 'usr_kyc_manager' THEN 'usr_manager'
  WHEN 'usr_refunds_manager' THEN 'usr_manager'
  WHEN 'usr_kyc_manager_2' THEN 'usr_manager'
  ELSE requested_by
END
WHERE requested_by IN ('usr_kyc_reviewer', 'usr_refunds_agent', 'usr_kyc_manager', 'usr_refunds_manager', 'usr_kyc_manager_2');
--> statement-breakpoint
UPDATE devin_runs
SET approved_by = CASE approved_by
  WHEN 'usr_kyc_reviewer' THEN 'usr_analyst'
  WHEN 'usr_refunds_agent' THEN 'usr_analyst'
  WHEN 'usr_kyc_manager' THEN 'usr_manager'
  WHEN 'usr_refunds_manager' THEN 'usr_manager'
  WHEN 'usr_kyc_manager_2' THEN 'usr_manager'
  ELSE approved_by
END
WHERE approved_by IN ('usr_kyc_reviewer', 'usr_refunds_agent', 'usr_kyc_manager', 'usr_refunds_manager', 'usr_kyc_manager_2');
