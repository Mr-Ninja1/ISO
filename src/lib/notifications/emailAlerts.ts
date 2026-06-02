import { createServiceRoleSupabase } from "@/lib/supabase/serviceRole";
import { normalizeAnnouncementAudience } from "@/lib/platformAudience";

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
  const { apiKey, from } = getEmailConfig();
  if (!apiKey || !from) {
    return { attempted: false, sent: 0, failed: 0, skipped: "Email provider is not configured" };
  }

  const svc = createServiceRoleSupabase();
  if (!svc) return { attempted: false, sent: 0, failed: 0, skipped: "Service role is not configured" };

  const audience = normalizeAnnouncementAudience(args.audience);
  // Email is user-facing and useful for all audience modes except explicit none.
  let query = svc.from("tenant_staff_pins").select("email, tenant_id").not("email", "is", null);
  if (audience === "native" || audience === "web" || audience === "all") {
    // Keep full set; these audience labels are app-channel focused.
  }

  const { data, error } = await query;
  if (error) return { attempted: false, sent: 0, failed: 0, skipped: error.message || "Failed to load recipients" };

  const recipients = uniqueEmails((data || []).map((row) => (row as { email?: string | null }).email));
  if (!recipients.length) {
    return { attempted: true, sent: 0, failed: 0, skipped: "No email recipients found" };
  }

  let sent = 0;
  let failed = 0;
  const failures: string[] = [];
  for (const to of recipients) {
    const subject = `ISO Grid alert: ${args.title}`;
    const text = `${args.message}\n\nThis message was sent from ISO Grid.`;
    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111;">
        <h2 style="margin:0 0 8px;">${args.title}</h2>
        <p style="margin:0 0 12px;">${args.message}</p>
        <p style="margin:0;color:#555;font-size:13px;">Sent from ISO Grid alerts.</p>
      </div>
    `;
    const result = await sendResendEmail({ apiKey, from, to, subject, text, html });
    if (result.ok) sent += 1;
    else {
      failed += 1;
      if (failures.length < MAX_FAILURES) failures.push(result.error);
    }
  }

  return { attempted: true, sent, failed, failures: failures.length ? failures : undefined };
}
