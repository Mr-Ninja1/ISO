"use client";

import { useEffect, useMemo, useState } from "react";
import { UserRound } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";

type ActiveStaffProfile = {
  tenantSlug?: string | null;
  name?: string | null;
  email?: string | null;
  userId?: string | null;
};

export function LoggedInStaffBadge({ tenantSlug }: { tenantSlug?: string }) {
  const { user } = useAuth();
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
    const email = profile?.email || user?.email || "";
    if (!email) return "User";
    return email.split("@")[0] || email;
  }, [profile?.name, profile?.email, user?.email]);

  const subtitle = useMemo(() => {
    return (profile?.email || user?.email || "").trim();
  }, [profile?.email, user?.email]);

  if (!user) return null;

  return (
    <div className="inline-flex max-w-[210px] items-center gap-2 rounded-full border border-foreground/20 bg-background px-2 py-1">
      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-foreground/20 bg-foreground/[0.04] sm:h-6 sm:w-6">
        <UserRound className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
      </span>
      <span className="min-w-0 flex flex-col leading-tight">
        <span className="truncate text-[11px] font-semibold">{displayName}</span>
        {subtitle ? <span className="hidden truncate text-[10px] text-foreground/65 sm:inline">{subtitle}</span> : null}
      </span>
    </div>
  );
}
