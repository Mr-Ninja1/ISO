"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { SharedFormsLandingClient } from "@/components/forms/SharedFormsLandingClient";
import { decodeSharedFormsPayload, readSharedFormsRows } from "@/lib/sharedForms";

export default function SharedFormsPage() {
  const searchParams = useSearchParams();
  const encoded = searchParams.get("d") || "";

  const payload = useMemo(() => decodeSharedFormsPayload(encoded), [encoded]);
  const rows = useMemo(() => {
    if (!payload) return [];
    const source = readSharedFormsRows(payload.tenantSlug);
    const allowedIds = new Set(payload.auditIds);
    return source.filter((row) => allowedIds.has(row.id));
  }, [payload]);

  if (!payload) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-6">
        <div className="rounded-xl border border-foreground/15 bg-background p-4 text-sm text-foreground/70">
          This shared forms link is invalid or could not be opened.
        </div>
        <Link href="/workspace" className="text-sm underline">
          Back to workspace
        </Link>
      </div>
    );
  }

  return <SharedFormsLandingClient payload={payload} rows={rows} />;
}
