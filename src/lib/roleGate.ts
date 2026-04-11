export type AppRole = "ADMIN" | "MANAGER" | "AUDITOR" | "VIEWER" | "MEMBER";

export type AppPermission =
  | "audit.view"
  | "audit.saveDraft"
  | "audit.submit"
  | "forms.create"
  | "forms.edit"
  | "forms.import"
  | "forms.delete"
  | "categories.manage"
  | "settings.view"
  | "brand.manage"
  | "staff.manage";

const ROLE_PERMISSIONS: Record<AppRole, Set<AppPermission>> = {
  ADMIN: new Set([
    "audit.view",
    "audit.saveDraft",
    "audit.submit",
    "forms.create",
    "forms.edit",
    "forms.import",
    "forms.delete",
    "categories.manage",
    "settings.view",
    "brand.manage",
    "staff.manage",
  ]),
  MANAGER: new Set([
    "audit.view",
    "audit.saveDraft",
    "audit.submit",
    "forms.create",
    "forms.edit",
    "forms.import",
    "categories.manage",
    "settings.view",
  ]),
  AUDITOR: new Set(["audit.view", "audit.saveDraft", "audit.submit"]),
  MEMBER: new Set(["audit.view", "audit.saveDraft", "audit.submit"]),
  VIEWER: new Set(["audit.view"]),
};

export function normalizeRole(role: unknown): AppRole {
  const value = String(role || "").toUpperCase();
  if (value === "ADMIN") return "ADMIN";
  if (value === "MANAGER") return "MANAGER";
  if (value === "AUDITOR") return "AUDITOR";
  if (value === "VIEWER") return "VIEWER";
  return "MEMBER";
}

export function hasPermission(role: unknown, permission: AppPermission) {
  const normalized = normalizeRole(role);
  return ROLE_PERMISSIONS[normalized].has(permission);
}

export function listPermissions(role: unknown) {
  const normalized = normalizeRole(role);
  return Array.from(ROLE_PERMISSIONS[normalized]);
}
