/** What each audit event is called on screen, in the order the filter lists them. */
export const AUDIT_EVENT_LABELS: Record<string, string> = {
  applied: "Done",
  applied_after_approval: "Done after approval",
  approval_requested: "Sent for approval",
  approval_granted: "Approved",
  approval_rejected: "Rejected",
  approval_failed: "Approved, but could not be applied",
  denied: "Blocked",
  pii_revealed: "Personal data viewed",
  constant_changed: "Setting changed",
};

export function auditEventLabel(event: string): string {
  return AUDIT_EVENT_LABELS[event] ?? event.replace(/_/g, " ");
}
