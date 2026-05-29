export function tenantDeactivationReasonFromRow(row: Record<string, unknown> | null | undefined) {
  const raw = row?.deactivation_reason;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function buildTenantDeactivatedUserMessage(reason?: string | null) {
  const contact =
    "Contact ISO Grid support or your platform developer to find out why your brand was deactivated and to request reactivation of your account.";
  if (reason?.trim()) {
    return `Your brand has been deactivated and is not available right now.\n\nReason for deactivation:\n${reason.trim()}\n\n${contact}`;
  }
  return `Your brand has been deactivated and is not available right now. ${contact}`;
}

