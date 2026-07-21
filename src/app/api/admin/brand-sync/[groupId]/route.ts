import { NextResponse } from "next/server";
import { requirePlatformDeveloper } from "@/lib/platformDevelopers";
import { deleteSyncGroup, listSyncGroups, updateSyncGroup, type SyncApprovalMode } from "@/lib/brandSync";

function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

export async function GET(req: Request, { params }: { params: Promise<{ groupId: string }> }) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await requirePlatformDeveloper(token);

    const { groupId } = await params;
    const groups = await listSyncGroups();
    const group = groups.find((g) => g.id === groupId);
    if (!group) return NextResponse.json({ error: "Sync group not found" }, { status: 404 });

    return NextResponse.json({ group });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Server error";
    const status = typeof (error as { status?: number }).status === "number" ? (error as { status?: number }).status! : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ groupId: string }> }) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await requirePlatformDeveloper(token);

    const { groupId } = await params;
    const body = await req.json().catch(() => null);
    const name = typeof body?.name === "string" ? body.name.trim() : undefined;
    const approvalMode: SyncApprovalMode | undefined =
      body?.approvalMode === "auto" ? "auto" : body?.approvalMode === "manual" ? "manual" : undefined;

    const group = await updateSyncGroup(groupId, { name, approvalMode });
    return NextResponse.json({ group });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Server error";
    const status = typeof (error as { status?: number }).status === "number" ? (error as { status?: number }).status! : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ groupId: string }> }) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await requirePlatformDeveloper(token);

    const { groupId } = await params;
    await deleteSyncGroup(groupId);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Server error";
    const status = typeof (error as { status?: number }).status === "number" ? (error as { status?: number }).status! : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
