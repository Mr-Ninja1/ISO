import { createServiceRoleSupabase } from "@/lib/supabase/serviceRole";

type EmailSendResult = {
  attempted: boolean;
  sent: number;
  failed: number;
  skipped?: string;
  failures?: string[];
};

const MAX_FAILURES = 5;

function getEmailConfig() {
  const apiKey = (process.env.RESEND_API_KEY || "").trim();
  const from =
    (process.env.ALERT_FROM_EMAIL || process.env.NOTIFY_FROM_EMAIL || process.env.EMAIL_FROM || "").trim();
  return { apiKey, from };
}

function isEmail(value: string | null | undefined) {
  if (!value) return false;
  const v = value.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

async function sendResendEmail(args: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: args.from,
      to: [args.to],
      subject: args.subject,
      html: args.html,
      text: args.text,
    }),
  });
  if (res.ok) return { ok: true as const };
  const text = await res.text().catch(() => "");
  return { ok: false as const, error: text || `Resend failed (${res.status})` };
}

function uniqueEmails(emails: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const email of emails) {
    const normalized = (email || "").trim().toLowerCase();
    if (!isEmail(normalized) || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

async function resolveTenantMemberEmails(args: {
  tenantId: string;
  userIds?: string[];
  role?: string | null;
}) {
  const svc = createServiceRoleSupabase();
  if (!svc) return [] as string[];

  let memberQuery = svc.from("tenant_members").select("user_id, role").eq("tenant_id", args.tenantId);
  const { data: members, error: memberErr } = await memberQuery;
  if (memberErr) return [];

  let memberRows = members || [];
  if (args.userIds?.length) {
    const allowed = new Set(args.userIds);
    memberRows = memberRows.filter((row) => allowed.has(String((row as { user_id?: string }).user_id || "")));
  }
  if (args.role) {
    const role = args.role.trim().toUpperCase();
    memberRows = memberRows.filter(
      (row) => String((row as { role?: string }).role || "").toUpperCase() === role,
    );
  }

  const userIds = memberRows
    .map((row) => (row as { user_id?: string }).user_id)
    .filter((value): value is string => typeof value === "string" && value.length > 0);
  if (!userIds.length) return [];

  const { data: pinRows } = await svc
    .from("tenant_staff_pins")
    .select("user_id, email")
    .eq("tenant_id", args.tenantId)
    .in("user_id", userIds);

  const pinEmails = (pinRows || []).map((row) => (row as { email?: string | null }).email);
  return uniqueEmails(pinEmails);
}

async function sendEmailsToRecipients(args: {
  recipients: string[];
  subject: string;
  html: string;
  text: string;
}): Promise<EmailSendResult> {
  const { apiKey, from } = getEmailConfig();
  if (!apiKey || !from) {
    return { attempted: false, sent: 0, failed: 0, skipped: "Email provider is not configured" };
  }
  if (!args.recipients.length) {
    return { attempted: true, sent: 0, failed: 0, skipped: "No email recipients found" };
  }

  let sent = 0;
  let failed = 0;
  const failures: string[] = [];
  for (const to of args.recipients) {
    const result = await sendResendEmail({
      apiKey,
      from,
      to,
      subject: args.subject,
      html: args.html,
      text: args.text,
    });
    if (result.ok) sent += 1;
    else {
      failed += 1;
      if (failures.length < MAX_FAILURES) failures.push(result.error);
    }
  }

  return { attempted: true, sent, failed, failures: failures.length ? failures : undefined };
}

export async function sendCorrectiveActionEmail(args: {
  to: string | null | undefined;
  subject: string;
  message: string;
  tenantSlug: string;
  actionId: string;
}): Promise<EmailSendResult> {
  const email = (args.to || "").trim().toLowerCase();
  if (!isEmail(email)) return { attempted: false, sent: 0, failed: 0, skipped: "Owner email not set" };

  const { apiKey, from } = getEmailConfig();
  if (!apiKey || !from) {
    return { attempted: false, sent: 0, failed: 0, skipped: "Email provider is not configured" };
  }

  const subject = args.subject;
  const text = `${args.message}\n\nTenant: ${args.tenantSlug}\nAction ID: ${args.actionId}`;
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111;">
      <h2 style="margin:0 0 8px;">${subject}</h2>
      <p style="margin:0 0 12px;">${args.message}</p>
      <p style="margin:0;color:#555;font-size:13px;">
        Tenant: <strong>${args.tenantSlug}</strong><br/>
        Action ID: ${args.actionId}
      </p>
    </div>
  `;

  const sent = await sendResendEmail({
    apiKey,
    from,
    to: email,
    subject,
    html,
    text,
  });
  if (sent.ok) return { attempted: true, sent: 1, failed: 0 };
  return { attempted: true, sent: 0, failed: 1, failures: [sent.error] };
}

export async function sendGlobalAnnouncementEmails(args: {
  title: string;
  message: string;
  audience?: string | null;
}): Promise<EmailSendResult> {
  const svc = createServiceRoleSupabase();
  if (!svc) return { attempted: false, sent: 0, failed: 0, skipped: "Service role is not configured" };

  const { data, error } = await svc.from("tenant_staff_pins").select("email, tenant_id").not("email", "is", null);
  if (error) return { attempted: false, sent: 0, failed: 0, skipped: error.message || "Failed to load recipients" };

  const recipients = uniqueEmails((data || []).map((row) => (row as { email?: string | null }).email));
  const subject = `ISO Grid alert: ${args.title}`;
  const text = `${args.message}\n\nThis message was sent from ISO Grid.`;
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111;">
      <h2 style="margin:0 0 8px;">${args.title}</h2>
      <p style="margin:0 0 12px;">${args.message}</p>
      <p style="margin:0;color:#555;font-size:13px;">Sent from ISO Grid alerts.</p>
    </div>
  `;

  return sendEmailsToRecipients({ recipients, subject, html, text });
}

export async function sendTenantAnnouncementEmails(args: {
  tenantId: string;
  title: string;
  message: string;
}): Promise<EmailSendResult> {
  const recipients = await resolveTenantMemberEmails({ tenantId: args.tenantId });
  const subject = `ISO Grid alert: ${args.title}`;
  const text = `${args.message}\n\nThis message was sent from ISO Grid.`;
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111;">
      <h2 style="margin:0 0 8px;">${args.title}</h2>
      <p style="margin:0 0 12px;">${args.message}</p>
      <p style="margin:0;color:#555;font-size:13px;">Sent from ISO Grid alerts.</p>
    </div>
  `;
  return sendEmailsToRecipients({ recipients, subject, html, text });
}

export async function sendFormDueReminderEmails(args: {
  tenantId: string;
  title: string;
  body: string;
  assigneeUserId?: string | null;
  assigneeEmail?: string | null;
  assigneeRole?: string | null;
}): Promise<EmailSendResult> {
  const direct = (args.assigneeEmail || "").trim().toLowerCase();
  let recipients = isEmail(direct) ? [direct] : [];

  if (!recipients.length && args.assigneeUserId) {
    recipients = await resolveTenantMemberEmails({
      tenantId: args.tenantId,
      userIds: [args.assigneeUserId],
    });
  }

  if (!recipients.length && args.assigneeRole) {
    recipients = await resolveTenantMemberEmails({
      tenantId: args.tenantId,
      role: args.assigneeRole,
    });
  }

  if (!recipients.length) {
    recipients = await resolveTenantMemberEmails({ tenantId: args.tenantId });
  }

  const subject = `Form reminder: ${args.title}`;
  const text = `${args.body}\n\nOpen ISO Grid to complete this form.`;
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111;">
      <h2 style="margin:0 0 8px;">Form reminder</h2>
      <p style="margin:0 0 8px;"><strong>${args.title}</strong></p>
      <p style="margin:0 0 12px;">${args.body}</p>
      <p style="margin:0;color:#555;font-size:13px;">Open ISO Grid to complete this form.</p>
    </div>
  `;

  return sendEmailsToRecipients({ recipients, subject, html, text });
}
