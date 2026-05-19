"use client";

/** Subtle footer line for screen, print, and PDF export — not a prominent header block. */
export function AuditReportFooter({
  submittedByName,
  submittedByEmail,
  submittedAt,
  status,
}: {
  submittedByName?: string;
  submittedByEmail?: string;
  submittedAt?: string | Date;
  status?: string;
}) {
  const name = submittedByName?.trim() || "";
  const email = submittedByEmail?.trim() || "";
  const staff = name || (email ? email.split("@")[0] : "");
  const when = submittedAt
    ? new Date(submittedAt).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "";

  const parts: string[] = [];
  if (status === "SUBMITTED" && when) parts.push(`Recorded ${when}`);
  if (staff) parts.push(staff);
  if (!parts.length) return null;

  return (
    <footer className="report-footer mt-6 border-t border-foreground/15 pt-3 text-center text-[11px] leading-relaxed text-foreground/45 print:mt-4 print:pt-2 print:text-[9pt]">
      {parts.join(" · ")}
    </footer>
  );
}

export function auditMetaFromPayload(payload: Record<string, unknown>) {
  const auditMeta =
    payload && typeof payload.__auditMeta === "object" && payload.__auditMeta !== null
      ? (payload.__auditMeta as Record<string, unknown>)
      : null;
  return {
    submittedByName:
      auditMeta && typeof auditMeta.submittedByName === "string" ? auditMeta.submittedByName : "",
    submittedByEmail:
      auditMeta && typeof auditMeta.submittedByEmail === "string" ? auditMeta.submittedByEmail : "",
  };
}
