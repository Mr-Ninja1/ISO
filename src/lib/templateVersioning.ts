type JsonObject = Record<string, any>;

export type TemplateSchemaMeta = {
  lineageId?: string;
  templateVersion?: number;
  isLive?: boolean;
  previousTemplateId?: string;
};

export function normalizeTemplateSchema(raw: unknown, title: string): JsonObject {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Schema must be a JSON object");
  }

  const obj = raw as JsonObject;
  const next: JsonObject = { ...obj };

  if (typeof next.version !== "number") next.version = 1;
  next.title = title;

  const prevMeta = getTemplateSchemaMeta(next);
  next.meta = {
    lineageId: prevMeta.lineageId,
    templateVersion: typeof prevMeta.templateVersion === "number" ? prevMeta.templateVersion : 1,
    isLive: prevMeta.isLive !== false,
    previousTemplateId: prevMeta.previousTemplateId,
  };

  return next;
}

export function getTemplateSchemaMeta(schema: unknown): TemplateSchemaMeta {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return {};
  const obj = schema as JsonObject;
  const meta = obj.meta;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return {};

  return {
    lineageId: typeof meta.lineageId === "string" ? meta.lineageId : undefined,
    templateVersion: typeof meta.templateVersion === "number" ? meta.templateVersion : undefined,
    isLive: typeof meta.isLive === "boolean" ? meta.isLive : undefined,
    previousTemplateId: typeof meta.previousTemplateId === "string" ? meta.previousTemplateId : undefined,
  };
}

export function withTemplateSchemaMeta(schema: unknown, patch: TemplateSchemaMeta, title?: string): JsonObject {
  const base = normalizeTemplateSchema(schema, title || ((schema as any)?.title ?? "Form"));
  const prev = getTemplateSchemaMeta(base);

  return {
    ...base,
    ...(title ? { title } : {}),
    meta: {
      lineageId: patch.lineageId ?? prev.lineageId,
      templateVersion:
        typeof patch.templateVersion === "number"
          ? patch.templateVersion
          : (typeof prev.templateVersion === "number" ? prev.templateVersion : 1),
      isLive: typeof patch.isLive === "boolean" ? patch.isLive : (prev.isLive !== false),
      previousTemplateId: patch.previousTemplateId ?? prev.previousTemplateId,
    },
  };
}

export function isLiveTemplateSchema(schema: unknown): boolean {
  const meta = getTemplateSchemaMeta(schema);
  return meta.isLive !== false;
}

export function getTemplateSchemaVersion(schema: unknown): number {
  const meta = getTemplateSchemaMeta(schema);
  return typeof meta.templateVersion === "number" ? meta.templateVersion : 1;
}
