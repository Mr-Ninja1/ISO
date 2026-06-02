import { hasPermission, normalizeRole, type AppRole } from "@/lib/roleGate";
import { parseTemplateDueRule, resolveTemplateDueReminderAt, type TemplateDueRule } from "@/lib/dueRules";
import { isLiveTemplateSchema } from "@/lib/templateVersioning";

export type WorkspaceTenantPayload = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
};

export type WorkspaceCategoryPayload = {
  id: string;
  name: string;
  sortOrder: number;
};

export type WorkspaceTemplatePayload = {
  id: string;
  title: string;
  updatedAt: string;
  categoryId: string | null;
  hasTemperatureInputs?: boolean;
  settings?: {
    dueDays?: number;
    dueRule?: TemplateDueRule | null;
    dueReminderAt?: string;
    dueRuleSetAt?: string;
    temperatureAlertBelow?: number;
    temperatureAlertAbove?: number;
    temperatureUnit?: "C" | "F";
    cardIcon?: string;
    cardColor?: string;
    assigneeUserId?: string;
    assigneeName?: string;
    assigneeEmail?: string;
    assigneeRole?: string;
  };
};

export type BuiltWorkspacePayload = {
  tenant: WorkspaceTenantPayload;
  categories: WorkspaceCategoryPayload[];
  selectedCategoryId: string | null;
  templates: WorkspaceTemplatePayload[];
  isAdmin: boolean;
  role: AppRole;
  capabilities: {
    canAccessSettings: boolean;
    canCreateForms: boolean;
    canManageCategories: boolean;
    canManageStaff: boolean;
  };
};

export function schemaHasTemperatureInputs(schema: unknown): boolean {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return false;
  const obj = schema as Record<string, unknown>;
  const sections =
    Array.isArray(obj.sections) && obj.sections.length
      ? (obj.sections as Array<Record<string, unknown>>)
      : Array.isArray(obj.fields)
        ? [{ type: "fields", fields: obj.fields } as Record<string, unknown>]
        : [];

  for (const section of sections) {
    if (section.type === "fields" && Array.isArray(section.fields)) {
      if (
        section.fields.some(
          (field) =>
            field &&
            typeof field === "object" &&
            !Array.isArray(field) &&
            (field as Record<string, unknown>).type === "temp" &&
            (field as Record<string, unknown>).isActive !== false
        )
      ) {
        return true;
      }
    }

    if (section.type === "grid" && Array.isArray(section.columns)) {
      if (
        section.columns.some(
          (col) =>
            col &&
            typeof col === "object" &&
            !Array.isArray(col) &&
            (col as Record<string, unknown>).type === "temp" &&
            (col as Record<string, unknown>).isActive !== false
        )
      ) {
        return true;
      }
    }
  }

  return false;
}

function templateMetaSettings(schema: unknown): WorkspaceTemplatePayload["settings"] | undefined {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return undefined;
  const meta = (schema as Record<string, unknown>).meta;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return undefined;
  const m = meta as Record<string, unknown>;
  const dueRule = parseTemplateDueRule(m);
  const dueAt = resolveTemplateDueReminderAt(m);
  return {
    dueDays: dueRule?.mode === "days" ? dueRule.days : typeof m.dueDays === "number" ? m.dueDays : undefined,
    dueRule,
    dueReminderAt: dueAt?.toISOString(),
    dueRuleSetAt: typeof m.dueRuleSetAt === "string" ? m.dueRuleSetAt : undefined,
    temperatureAlertBelow: typeof m.temperatureAlertBelow === "number" ? m.temperatureAlertBelow : undefined,
    temperatureAlertAbove: typeof m.temperatureAlertAbove === "number" ? m.temperatureAlertAbove : undefined,
    temperatureUnit: m.temperatureUnit === "F" || m.temperatureUnit === "C" ? m.temperatureUnit : undefined,
    cardIcon: typeof m.cardIcon === "string" ? m.cardIcon : undefined,
    cardColor: typeof m.cardColor === "string" ? m.cardColor : undefined,
    assigneeUserId: typeof m.assigneeUserId === "string" ? m.assigneeUserId : undefined,
    assigneeName: typeof m.assigneeName === "string" ? m.assigneeName : undefined,
    assigneeEmail: typeof m.assigneeEmail === "string" ? m.assigneeEmail : undefined,
    assigneeRole: typeof m.assigneeRole === "string" ? m.assigneeRole : undefined,
  };
}

function toIso(updatedAt: Date | string): string {
  if (updatedAt instanceof Date) return updatedAt.toISOString();
  if (typeof updatedAt === "string") return updatedAt;
  return String(updatedAt);
}

export type TemplateRowInput = {
  id: string;
  title: string;
  updatedAt: Date | string;
  categoryId: string | null;
  schema: unknown;
};

export function mapTemplateRowsToPayload(rows: TemplateRowInput[]): WorkspaceTemplatePayload[] {
  return rows
    .filter((t) => isLiveTemplateSchema(t.schema))
    .map((t) => ({
      id: t.id,
      title: t.title,
      updatedAt: toIso(t.updatedAt),
      categoryId: t.categoryId,
      hasTemperatureInputs: schemaHasTemperatureInputs(t.schema),
      settings: templateMetaSettings(t.schema),
    }));
}

/** Aligns URL `categoryId` with stored categories (same rules as `/api/workspace`). */
export function resolveSelectedWorkspaceCategoryId(
  categories: WorkspaceCategoryPayload[],
  requestedCategoryId: string | null | undefined
): string | null {
  if (categories.length === 0) return null;
  let selectedCategoryId: string | null = requestedCategoryId ?? null;
  const found = selectedCategoryId ? categories.some((c) => c.id === selectedCategoryId) : false;
  if (!selectedCategoryId || !found) {
    selectedCategoryId = categories[0].id;
  }
  return selectedCategoryId;
}

export function buildWorkspacePayload(args: {
  tenant: WorkspaceTenantPayload;
  membershipRole: unknown;
  categories: WorkspaceCategoryPayload[];
  requestedCategoryId: string | null | undefined;
  /** Rows for `tenantId` + resolved category only (same scope as Prisma workspace query). */
  templateRowsForSelectedCategory: TemplateRowInput[];
}): BuiltWorkspacePayload {
  const normalizedRole = normalizeRole(args.membershipRole);
  const isAdmin = normalizedRole === "ADMIN";
  const capabilities = {
    canAccessSettings: hasPermission(normalizedRole, "settings.view"),
    canCreateForms: hasPermission(normalizedRole, "forms.create"),
    canManageCategories: hasPermission(normalizedRole, "categories.manage"),
    canManageStaff: hasPermission(normalizedRole, "staff.manage"),
  };

  const categories = args.categories;
  const selectedCategoryId = resolveSelectedWorkspaceCategoryId(categories, args.requestedCategoryId);

  const templates =
    selectedCategoryId != null ? mapTemplateRowsToPayload(args.templateRowsForSelectedCategory) : [];

  return {
    tenant: args.tenant,
    categories,
    selectedCategoryId,
    templates,
    isAdmin,
    role: normalizedRole,
    capabilities,
  };
}
