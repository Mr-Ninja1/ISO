export function getAdminOversightEmails(): string[] {
  const raw = process.env.NEXT_PUBLIC_ADMIN_OVERSIGHT_EMAILS || process.env.ADMIN_OVERSIGHT_EMAILS || "";
  return raw
    .split(/[,;\s]+/)
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isPlatformAdminEmail(email: string | null | undefined) {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  return getAdminOversightEmails().includes(normalized);
}