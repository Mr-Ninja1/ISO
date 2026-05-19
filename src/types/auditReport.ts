import type { FormSchemaV1 } from "@/types/forms";

export type AuditReportData = {
  id: string;
  status: string;
  createdAt: string;
  payload: Record<string, unknown>;
  tenant: { name: string; slug: string; logoUrl: string | null };
  template: { title: string; schema: FormSchemaV1 | null };
  /** Used to hydrate schema from offline template cache when API omits it. */
  templateId?: string;
};
