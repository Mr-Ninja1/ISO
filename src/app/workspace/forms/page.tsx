"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SearchParamsBoundary } from "@/components/SearchParamsBoundary";

export default function WorkspaceFormsPage() {
  return (
    <SearchParamsBoundary>
      <WorkspaceFormsRedirect />
    </SearchParamsBoundary>
  );
}

function WorkspaceFormsRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const tenantSlug = searchParams.get("tenantSlug") || "";
    if (!tenantSlug) {
      router.replace("/workspace");
      return;
    }

    const next = new URLSearchParams();
    next.set("tenantSlug", tenantSlug);
    next.set("view", "forms");

    const categoryId = searchParams.get("categoryId");
    if (categoryId) next.set("categoryId", categoryId);

    if (searchParams.get("refresh") === "1") next.set("refresh", "1");

    router.replace(`/workspace?${next.toString()}`);
  }, [router, searchParams]);

  return null;
}
