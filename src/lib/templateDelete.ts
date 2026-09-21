import { getTemplateSchemaMeta } from "./templateVersioning";

export type TemplateEntryForDelete = {
  id: string;
  schema?: unknown;
};

export type TemplateDeletePlan = {
  lineageId: string;
  lineageTemplateIds: string[];
  totalAuditRows: number;
  requiresSubmissionCleanup: boolean;
};

export function buildTemplateDeletePlan({
  templateId,
  allTemplates,
  countsByTemplateId,
}: {
  templateId: string;
  allTemplates: TemplateEntryForDelete[];
  countsByTemplateId: Record<string, number>;
}): TemplateDeletePlan {
  const current = allTemplates.find((t) => t.id === templateId) ?? { id: templateId, schema: null };
  const currentMeta = getTemplateSchemaMeta(current.schema);
  const lineageId = currentMeta.lineageId || current.id;

  const lineageTemplateIds = allTemplates
    .filter((t) => {
      const meta = getTemplateSchemaMeta(t.schema);
      return (meta.lineageId || t.id) === lineageId;
    })
    .map((t) => t.id);

  const totalAuditRows = lineageTemplateIds.reduce((sum, id) => sum + (countsByTemplateId[id] ?? 0), 0);

  return {
    lineageId,
    lineageTemplateIds,
    totalAuditRows,
    requiresSubmissionCleanup: totalAuditRows > 0,
  };
}
