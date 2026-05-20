import { NextResponse } from "next/server";
import { createServiceRoleSupabase } from "@/lib/supabase/serviceRole";
import { requirePlatformDeveloper } from "@/lib/platformDevelopers";

function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

function serializeRow(row: Record<string, unknown> | null) {
  if (!row) {
    return {
      minNativeBuild: 1,
      liveUpdateChannel: "production",
      liveUpdateBundleUrl: null as string | null,
      updatedAt: null as string | null,
    };
  }

  const min = row.min_native_build;
  return {
    minNativeBuild: typeof min === "number" && Number.isFinite(min) ? min : 1,
    liveUpdateChannel:
      typeof row.live_update_channel === "string" && row.live_update_channel.trim()
        ? row.live_update_channel.trim()
        : "production",
    liveUpdateBundleUrl:
      typeof row.live_update_bundle_url === "string" && row.live_update_bundle_url.trim()
        ? row.live_update_bundle_url.trim()
        : null,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
  };
}

export async function GET(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await requirePlatformDeveloper(token);
    const svc = createServiceRoleSupabase();
    if (!svc) return NextResponse.json({ error: "Service role is not configured" }, { status: 500 });

    const { data, error } = await svc
      .from("platform_settings")
      .select("min_native_build, live_update_channel, live_update_bundle_url, updated_at")
      .eq("id", "default")
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(serializeRow((data as Record<string, unknown> | null) ?? null));
  } catch (error: unknown) {
    const err = error as Error & { status?: number };
    const status = typeof err.status === "number" ? err.status : 500;
    return NextResponse.json({ error: err.message || "Server error" }, { status });
  }
}

export async function PATCH(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await requirePlatformDeveloper(token);
    const svc = createServiceRoleSupabase();
    if (!svc) return NextResponse.json({ error: "Service role is not configured" }, { status: 500 });

    const body = (await req.json().catch(() => ({}))) as {
      minNativeBuild?: number;
      liveUpdateChannel?: string;
      liveUpdateBundleUrl?: string | null;
    };

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (body.minNativeBuild != null) {
      const n = Number(body.minNativeBuild);
      if (!Number.isFinite(n) || n < 1) {
        return NextResponse.json({ error: "minNativeBuild must be a positive integer" }, { status: 400 });
      }
      patch.min_native_build = Math.floor(n);
    }

    if (body.liveUpdateChannel != null) {
      const channel = String(body.liveUpdateChannel).trim();
      if (!channel) return NextResponse.json({ error: "liveUpdateChannel cannot be empty" }, { status: 400 });
      patch.live_update_channel = channel;
    }

    if (body.liveUpdateBundleUrl !== undefined) {
      const url = body.liveUpdateBundleUrl == null ? null : String(body.liveUpdateBundleUrl).trim();
      if (url && !/^https:\/\/.+/i.test(url)) {
        return NextResponse.json({ error: "liveUpdateBundleUrl must be an HTTPS URL" }, { status: 400 });
      }
      patch.live_update_bundle_url = url || null;
    }

    const { data, error } = await svc
      .from("platform_settings")
      .upsert({ id: "default", ...patch }, { onConflict: "id" })
      .select("min_native_build, live_update_channel, live_update_bundle_url, updated_at")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(serializeRow(data as Record<string, unknown>));
  } catch (error: unknown) {
    const err = error as Error & { status?: number };
    const status = typeof err.status === "number" ? err.status : 500;
    return NextResponse.json({ error: err.message || "Server error" }, { status });
  }
}
