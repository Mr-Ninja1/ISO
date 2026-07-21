import { NextResponse } from "next/server";
import { requirePlatformDeveloper } from "@/lib/platformDevelopers";
import { runInitialMerge } from "@/lib/brandSync";

function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

export async function POST(req: Request, { params }: { params: Promise<{ groupId: string }> }) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await requirePlatformDeveloper(token);

    const { groupId } = await params;
    const summary = await runInitialMerge(groupId);
    return NextResponse.json({ summary });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Server error";
    const status = typeof (error as { status?: number }).status === "number" ? (error as { status?: number }).status! : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
