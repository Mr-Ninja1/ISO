import type { SupabaseClient } from "@supabase/supabase-js";
import { archiveAudit, decryptArchiveCredential, type ArchivedAudit } from "@/lib/googleDriveArchive";

export async function archiveTenantSubmissions(svc: SupabaseClient, tenantId: string, archiveAfterDays: number) {
  const { data: integration, error: integrationError } = await svc.from("tenant_google_drive_archives")
    .select("refresh_token_encrypted").eq("tenant_id", tenantId).maybeSingle();
  if (integrationError) throw new Error(integrationError.message);
  if (!integration) return { archived: 0, skipped: true };
  const refreshToken = decryptArchiveCredential(integration.refresh_token_encrypted as string);
  const cutoff = new Date(Date.now() - archiveAfterDays * 86400_000).toISOString();
  const { data: alreadyArchived } = await svc.from("audit_archives").select("id").eq("tenant_id", tenantId);
  const archivedIds = new Set((alreadyArchived || []).map((row) => row.id as string));
  const { data: candidates, error } = await svc.from("audit_logs")
    .select("id,tenant_id,template_id,status,created_at,updated_at,submitted_at,payload,form_templates(title,schema)")
    .eq("tenant_id", tenantId).eq("status", "SUBMITTED").lt("submitted_at", cutoff)
    .order("submitted_at", { ascending: true }).limit(10);
  if (error) throw new Error(error.message);
  let archived = 0;
  for (const candidate of candidates || []) {
    if (archivedIds.has(candidate.id as string)) continue;
    const templateRaw = candidate.form_templates as { title?: string; schema?: unknown } | { title?: string; schema?: unknown }[] | null;
    const template = Array.isArray(templateRaw) ? templateRaw[0] : templateRaw;
    const row: ArchivedAudit = {
      id: candidate.id as string, tenant_id: tenantId, template_id: candidate.template_id as string,
      status: candidate.status as string, created_at: candidate.created_at as string,
      updated_at: candidate.updated_at as string, submitted_at: candidate.submitted_at as string,
      payload: candidate.payload, template_title: template?.title || "Form", template_schema: template?.schema,
    };
    await archiveAudit(svc, tenantId, refreshToken, row);
    archived += 1;
  }
  await svc.from("tenant_google_drive_archives").update({ last_archived_at: new Date().toISOString(), last_error: null }).eq("tenant_id", tenantId);
  return { archived, skipped: false };
}
