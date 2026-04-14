import { redirect } from "next/navigation";

export default async function WorkspaceFormsPage({
  searchParams,
}: {
  searchParams: Promise<{ tenantSlug?: string; categoryId?: string; refresh?: string }>;
}) {
  const params = await searchParams;
  const tenantSlug = params.tenantSlug || "";

  if (!tenantSlug) {
    redirect("/dashboard");
  }

  const next = new URLSearchParams();
  next.set("tenantSlug", tenantSlug);
  next.set("view", "forms");

  if (params.categoryId) {
    next.set("categoryId", params.categoryId);
  }

  if (params.refresh === "1") {
    next.set("refresh", "1");
  }

  redirect(`/workspace?${next.toString()}`);
}
