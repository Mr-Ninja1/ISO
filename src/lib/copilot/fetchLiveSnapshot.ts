import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppRole } from "@/lib/roleGate";
import type { CopilotCapabilities } from "@/lib/copilot/intents";

export type CopilotLiveSnapshot = {
  templateCount: number;
  categoryCount: number;
  categoryNames: string[];
  recentTemplateTitles: string[];
  activityToday: {
    eventCount: number;
    activeActorCount: number;
    summaryLines: string[];
  } | null;
};

function startOfTodayUtcIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

function actionLabel(action: string): string {
  const map: Record<string, string> = {
    "auth.login": "staff PIN / profile switch",
    "template.create": "created a form",
    "template.delete": "deleted a form",
    "template.update.versioned": "updated a form",
    "template.update.overwrite": "updated a form",
    "template.move_category": "moved a form",
    "template.import": "imported a form",
    "category.create": "created a category",
    "category.update": "renamed a category",
    "category.delete": "deleted a category",
    "audit.submit": "submitted an inspection",
    "audit.saveDraft": "saved a draft",
    "audit.delete": "deleted a submission",
    "staff.upsert": "added/updated staff",
    "staff.update": "updated staff",
    "staff.remove": "removed staff",
    "correctiveAction.create": "created a corrective action",
  };
  return map[action] || action.replace(/\./g, " ");
}

function actorFromDetails(details: unknown): string | null {
  if (!details || typeof details !== "object" || Array.isArray(details)) return null;
  const d = details as Record<string, unknown>;
  for (const key of ["submittedByName", "userName", "staffName", "name", "title"]) {
    const v = d[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function summarizeTodayActivity(
  rows: Array<{
    action: string;
    details: unknown;
    created_at: string;
    user_id: string;
  }>,
): CopilotLiveSnapshot["activityToday"] {
  if (!rows.length) {
    return { eventCount: 0, activeActorCount: 0, summaryLines: ["No brand activity recorded yet today (UTC)."] };
  }

  const actors = new Set(rows.map((r) => r.user_id));
  const lines: string[] = [];
  const seen = new Set<string>();

  for (const row of rows.slice(0, 12)) {
    const actor = actorFromDetails(row.details) || "A team member";
    const time = new Date(row.created_at).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
    const line = `${time} — ${actor}: ${actionLabel(row.action)}`;
    const key = `${row.user_id}:${row.action}:${time}`;
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(line);
    if (lines.length >= 6) break;
  }

  return {
    eventCount: rows.length,
    activeActorCount: actors.size,
    summaryLines: lines,
  };
}

/** Small live snapshot for copilot — 3 fast queries, no heavy joins. */
export async function fetchCopilotLiveSnapshot(
  sb: SupabaseClient,
  tenantId: string,
  role: AppRole,
  caps: CopilotCapabilities,
): Promise<CopilotLiveSnapshot> {
  const [templatesRes, categoriesRes] = await Promise.all([
    sb
      .from("form_templates")
      .select("title", { count: "exact" })
      .eq("tenant_id", tenantId)
      .order("updated_at", { ascending: false })
      .limit(6),
    sb
      .from("categories")
      .select("name", { count: "exact" })
      .eq("tenant_id", tenantId)
      .order("sort_order", { ascending: true })
      .limit(12),
  ]);

  const templateCount = templatesRes.count ?? (templatesRes.data?.length || 0);
  const categoryCount = categoriesRes.count ?? (categoriesRes.data?.length || 0);
  const recentTemplateTitles = (templatesRes.data || [])
    .map((r) => String((r as { title?: string }).title || "").trim())
    .filter(Boolean);
  const categoryNames = (categoriesRes.data || [])
    .map((r) => String((r as { name?: string }).name || "").trim())
    .filter(Boolean);

  let activityToday: CopilotLiveSnapshot["activityToday"] = null;
  const canViewActivity =
    caps.canAccessSettings && (role === "ADMIN" || role === "MANAGER");

  if (canViewActivity) {
    const { data: logRows } = await sb
      .from("activity_logs")
      .select("action, details, created_at, user_id")
      .eq("tenant_id", tenantId)
      .gte("created_at", startOfTodayUtcIso())
      .order("created_at", { ascending: false })
      .limit(25);

    activityToday = summarizeTodayActivity(
      (logRows || []) as Array<{
        action: string;
        details: unknown;
        created_at: string;
        user_id: string;
      }>,
    );
  }

  return {
    templateCount,
    categoryCount,
    categoryNames,
    recentTemplateTitles,
    activityToday,
  };
}

export function formatLiveSnapshotBlock(snapshot: CopilotLiveSnapshot): string {
  const lines = [
    `Forms (templates) in database: ${snapshot.templateCount}`,
    `Categories in database: ${snapshot.categoryCount}`,
  ];
  if (snapshot.categoryNames.length) {
    lines.push(`Category names: ${snapshot.categoryNames.slice(0, 10).join(", ")}`);
  }
  if (snapshot.recentTemplateTitles.length) {
    lines.push(`Recently updated forms: ${snapshot.recentTemplateTitles.slice(0, 5).join(", ")}`);
  }
  if (snapshot.activityToday) {
    lines.push(
      `Today's activity (UTC): ${snapshot.activityToday.eventCount} events, ${snapshot.activityToday.activeActorCount} people`,
    );
    for (const s of snapshot.activityToday.summaryLines) {
      lines.push(`- ${s}`);
    }
  }
  return lines.join("\n");
}
