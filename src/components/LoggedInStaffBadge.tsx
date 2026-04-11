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
    <div className="inline-flex items-center gap-2 rounded-full border border-foreground/20 bg-background px-2.5 py-1">
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-foreground/20 bg-foreground/[0.04]">
        <UserRound className="h-3.5 w-3.5" />
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-[11px] font-semibold">{displayName}</span>
        {subtitle ? <span className="text-[10px] text-foreground/65">{subtitle}</span> : null}
      </span>
    </div>
  );
}
