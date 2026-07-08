"use client";

import {
  getTenantDeactivationBrandName,
  getTenantDeactivationReason,
} from "@/lib/client/brandAccess";

type Props = {
  tenantSlug?: string;
  brandName?: string | null;
  reason?: string | null;
};

export function TenantDeactivatedScreen({
  tenantSlug,
  brandName: brandNameProp,
  reason: reasonProp,
}: Props) {
  const reason =
    reasonProp?.trim() ||
    (tenantSlug ? getTenantDeactivationReason(tenantSlug) : null) ||
    null;
  const brandName =
    brandNameProp?.trim() ||
    (tenantSlug ? getTenantDeactivationBrandName(tenantSlug) : null) ||
    null;

  return (
    <main className="workspace-shell fixed inset-0 z-[10050] flex min-h-dvh items-center justify-center overflow-y-auto bg-[linear-gradient(165deg,#f8fafc_0%,#eef2f7_45%,#e8edf3_100%)] px-4 py-12">
      <div
        className="w-full max-w-xl rounded-2xl border border-slate-300/90 bg-white p-8 shadow-[0_24px_64px_rgba(15,23,42,0.12)]"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="brand-deactivated-title"
        aria-describedby="brand-deactivated-desc"
      >
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-700">Brand locked</p>
        <h1 id="brand-deactivated-title" className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
          {brandName ? `${brandName} is not available` : "Your brand has been deactivated"}
        </h1>
        {tenantSlug ? (
          <p className="mt-1 text-sm font-medium text-slate-500">/{tenantSlug}</p>
        ) : null}
        <p id="brand-deactivated-desc" className="mt-3 text-sm leading-relaxed text-slate-600">
          A platform administrator has suspended access to this brand. You cannot use the workspace,
          forms, or settings until the brand is reactivated.
        </p>

        {reason ? (
          <div className="mt-6 rounded-xl border-2 border-red-400 bg-red-50 px-5 py-4">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-red-800">Reason</p>
            <p className="mt-2 whitespace-pre-line text-base font-bold leading-snug text-red-950">{reason}</p>
          </div>
        ) : (
          <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 px-5 py-4">
            <p className="text-sm font-semibold text-slate-800">No reason was provided</p>
            <p className="mt-1 text-sm text-slate-600">
              Contact ISO Grid support or your platform developer to learn why access was removed.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
