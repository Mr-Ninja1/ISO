import { NextResponse } from "next/server";
import { requirePlatformDeveloper } from "@/lib/platformDevelopers";
import {
  createSyncGroup,
  deleteSyncGroup,
  listSyncGroups,
  updateSyncGroup,
  type SyncApprovalMode,
} from "@/lib/brandSync";

function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

export async function GET(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await requirePlatformDeveloper(token);

    const groups = await listSyncGroups();
    return NextResponse.json({ groups });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Server error";
    const status = typeof (error as { status?: number }).status === "number" ? (error as { status?: number }).status! : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const user = await requirePlatformDeveloper(token);

    const body = await req.json().catch(() => null);
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const tenantIds = Array.isArray(body?.tenantIds)
      ? body.tenantIds.filter((id: unknown) => typeof id === "string")
      : [];
    const approvalMode: SyncApprovalMode = body?.approvalMode === "auto" ? "auto" : "manual";
    const runInitialMerge = body?.runInitialMerge !== false;

    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const result = await createSyncGroup({
      name,
      tenantIds,
      approvalMode,
      createdBy: user.id,
      runInitialMerge,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Server error";
    const status = typeof (error as { status?: number }).status === "number" ? (error as { status?: number }).status! : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
