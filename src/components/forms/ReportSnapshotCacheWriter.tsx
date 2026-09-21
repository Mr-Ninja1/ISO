"use client";

import { useEffect } from "react";
import type { FormSchemaV1 } from "@/types/forms";
import { writeAuditReportSnapshot } from "@/lib/client/auditReportSnapshot";

type SnapshotInput = {
  tenantSlug: string;
  auditId: string;
  title: string;
  status: string;
  createdAt: string;
  tenantName: string;
  templateId?: string;
  payload: Record<string, unknown>;
  schema?: FormSchemaV1 | null;
};

export function ReportSnapshotCacheWriter(data: SnapshotInput) {
  useEffect(() => {
    writeAuditReportSnapshot(data.tenantSlug, data.auditId, {
      title: data.title,
      status: data.status,
      createdAt: data.createdAt,
      tenantName: data.tenantName,
      templateId: data.templateId,
      payload: data.payload,
      schema: data.schema,
    });
  }, [data]);

  return null;
}
