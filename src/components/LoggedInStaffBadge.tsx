"use client";

import { useEffect, useMemo, useState } from "react";
import { UserRound } from "lucide-react";

type ActiveStaffProfile = {
  tenantSlug?: string | null;
  name?: string | null;
  email?: string | null;
  userId?: string | null;
};

export function LoggedInStaffBadge({ tenantSlug }: { tenantSlug?: string }) {
  const [profile, setProfile] = useState<ActiveStaffProfile | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("active-staff-profile:v1");
      if (!raw) {
        setProfile(null);
        return;
      }

      const parsed = JSON.parse(raw) as ActiveStaffProfile;
      if (!parsed || typeof parsed !== "object") {
        setProfile(null);
        return;
      }

      if (tenantSlug && parsed.tenantSlug && parsed.tenantSlug !== tenantSlug) {
        setProfile(null);
        return;
      }

      setProfile(parsed);
    } catch {
      setProfile(null);
    }
  }, [tenantSlug]);

  const displayName = useMemo(() => {
    const fromProfile = (profile?.name || "").trim();
    if (fromProfile) return fromProfile;
    const email = profile?.email || "";
    if (!email) return "User";
    return email.split("@")[0] || email;
  }, [profile?.name, profile?.email]);

  const subtitle = useMemo(() => {
    return (profile?.email || "").trim();
  }, [profile?.email]);

  if (!profile?.name && !profile?.email) return null;

  return (
    <div className="inline-flex max-w-[220px] items-center gap-2 rounded-full border border-emerald-300/70 bg-gradient-to-r from-emerald-50/95 to-teal-50/90 px-2.5 py-1 shadow-sm">
      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-emerald-400/50 bg-gradient-to-br from-emerald-100 to-teal-100 text-emerald-800">
        <UserRound className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 flex flex-col leading-tight">
        <span className="truncate text-[11px] font-semibold text-emerald-950">{displayName}</span>
        {subtitle ? (
          <span className="hidden truncate text-[10px] text-emerald-800/75 sm:inline">{subtitle}</span>
        ) : null}
      </span>
    </div>
  );
}
