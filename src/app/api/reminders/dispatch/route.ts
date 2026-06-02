import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { createServiceRoleSupabase } from "@/lib/supabase/serviceRole";
import { createSupabaseWithBearer } from "@/lib/supabase/routeClient";
import { sendFormDueReminderEmails } from "@/lib/notifications/emailAlerts";
import { sendPushNotificationToUsers } from "@/lib/push/firebaseAdmin";
import { templateMetaFromSchema } from "@/lib/dueRules";

function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

const bodySchema = z.object({
  tenantSlug: z.string().min(1),
  templateId: z.string().uuid(),
  title: z.string().min(1),
  body: z.string().min(1),
  dueReminderAt: z.string().min(1),
  dispatchKey: z.string().min(1),
});

async function wasReminderAlreadyDispatched(tenantId: string, dispatchKey: string) {
  const svc = createServiceRoleSupabase();
  if (!svc) return false;

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data } = await svc
    .from("activity_logs")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("action", "reminder.dispatch")
    .eq("entity_id", dispatchKey)
    .gte("created_at", since)
    .maybeSingle();

  return Boolean(data);
}

async function recordReminderDispatch(args: {
  tenantId: string;
  userId: string;
  dispatchKey: string;
  templateId: string;
  dueReminderAt: string;
  push: unknown;
  email: unknown;
}) {
  const svc = createServiceRoleSupabase();
  if (!svc) return;

  await svc.from("activity_logs").insert({
    tenant_id: args.tenantId,
    user_id: args.userId,
    action: "reminder.dispatch",
    entity_type: "template",
    entity_id: args.dispatchKey,
    details: {
      templateId: args.templateId,
      dueReminderAt: args.dueReminderAt,
      push: args.push,
      email: args.email,
    },
  });
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabaseAuth = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser(token);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { tenantSlug, templateId, title, body, dueReminderAt, dispatchKey } = parsed.data;
    const sb = createSupabaseWithBearer(token);

    const { data: tenant, error: tenantErr } = await sb
      .from("tenants")
      .select("id, slug")
      .eq("slug", tenantSlug)
      .maybeSingle();
    if (tenantErr || !tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

    const { data: membership, error: memberErr } = await sb
      .from("tenant_members")
      .select("role")
      .eq("tenant_id", tenant.id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (memberErr || !membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    if (await wasReminderAlreadyDispatched(String(tenant.id), dispatchKey)) {
      return NextResponse.json({ ok: true, skipped: "Already dispatched for this due cycle" });
    }

    const { data: template, error: templateErr } = await sb
      .from("templates")
      .select("id, schema")
      .eq("id", templateId)
      .eq("tenant_id", tenant.id)
      .maybeSingle();
    if (templateErr || !template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    const meta = templateMetaFromSchema(template.schema) || {};
    const assigneeUserId = typeof meta.assigneeUserId === "string" ? meta.assigneeUserId : null;
    const assigneeEmail = typeof meta.assigneeEmail === "string" ? meta.assigneeEmail : null;
    const assigneeRole = typeof meta.assigneeRole === "string" ? meta.assigneeRole : null;

    let targetUserIds: string[] = [];
    if (assigneeUserId) {
      targetUserIds = [assigneeUserId];
    } else if (assigneeRole) {
      const svc = createServiceRoleSupabase();
      let roleMembers: Array<{ user_id?: string }> = [];
      if (svc) {
        const { data } = await svc
          .from("tenant_members")
          .select("user_id")
          .eq("tenant_id", tenant.id)
          .eq("role", assigneeRole.toUpperCase());
        roleMembers = data || [];
      }
      targetUserIds = roleMembers
        .map((row) => row.user_id)
        .filter((value): value is string => typeof value === "string" && value.length > 0);
    } else {
      targetUserIds = [user.id];
    }

    const deepLink = `/${tenantSlug}/workspace?tenantSlug=${encodeURIComponent(tenantSlug)}`;
    const push = await sendPushNotificationToUsers({
      tenantId: String(tenant.id),
      userIds: targetUserIds,
      payload: {
        title: `Reminder: ${title}`,
        body,
        category: "reminder",
        tenantSlug,
        deepLink,
        data: {
          source: "form_due_reminder",
          templateId,
          dueReminderAt,
        },
      },
    });

    const email = await sendFormDueReminderEmails({
      tenantId: String(tenant.id),
      title,
      body,
      assigneeUserId,
      assigneeEmail,
      assigneeRole,
    });

    await recordReminderDispatch({
      tenantId: String(tenant.id),
      userId: user.id,
      dispatchKey,
      templateId,
      dueReminderAt,
      push,
      email,
    });

    return NextResponse.json({ ok: true, push, email });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
