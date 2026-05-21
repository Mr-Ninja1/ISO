"use client";

import { getTenantDeactivationReason } from "@/lib/client/brandAccess";

type Props = {
  tenantSlug?: string;
  reason?: string | null;
};

export function TenantDeactivatedScreen({ tenantSlug, reason: reasonProp }: Props) {
  const reason =
    reasonProp?.trim() ||
    (tenantSlug ? getTenantDeactivationReason(tenantSlug) : null) ||
    null;

  return (
    <main className="workspace-shell flex min-h-dvh items-center justify-center bg-[linear-gradient(165deg,#f8fafc_0%,#eef2f7_45%,#e8edf3_100%)] px-4 py-12">
      <div
        className="w-full max-w-xl rounded-2xl border border-slate-300/90 bg-white p-8 shadow-[0_24px_64px_rgba(15,23,42,0.12)]"
        role="alertdialog"
        aria-labelledby="brand-deactivated-title"
        aria-describedby="brand-deactivated-desc"
      >
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-700">Access suspended</p>
        <h1 id="brand-deactivated-title" className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
          Your brand has been deactivated
        </h1>
        <p id="brand-deactivated-desc" className="mt-3 text-sm leading-relaxed text-slate-600">
          This workspace is not available until a platform administrator reactivates your brand.
        </p>

        {reason ? (
          <div className="mt-6 rounded-xl border-2 border-red-400 bg-red-50 px-5 py-4">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-red-800">Reason for deactivation</p>
            <p className="mt-2 whitespace-pre-line text-base font-bold leading-snug text-red-950">{reason}</p>
          </div>
        ) : (
          <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 px-5 py-4">
            <p className="text-sm font-semibold text-slate-800">No reason was provided</p>
            <p className="mt-1 text-sm text-slate-600">
              Contact Isopro or your platform developer to learn why access was removed.
            </p>
          </div>
        )}

        <p className="mt-6 text-sm leading-relaxed text-slate-600">
          To request reactivation, contact <span className="font-semibold text-slate-800">Isopro</span> or your
          platform developer with your brand name and account email.
        </p>
      </div>
    </main>
  );
}
