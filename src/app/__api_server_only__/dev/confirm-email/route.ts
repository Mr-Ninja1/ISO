import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const supabaseUrl =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      {
        error:
          "Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
      },
      { status: 500 }
    );
  }

  try {
    const { email, userId } = (await req.json()) as {
      email?: string;
      userId?: string;
    };

    if (!email && !userId) {
      return NextResponse.json(
        { error: "Provide either email or userId" },
        { status: 400 }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    let resolvedUserId = userId;

    if (!resolvedUserId && email) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({
        perPage: 1000,
      });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const match = data.users.find(
        (u) => (u.email || "").toLowerCase() === email.toLowerCase()
      );

      if (!match) {
        return NextResponse.json(
          { error: "User not found for email" },
          { status: 404 }
        );
      }

      resolvedUserId = match.id;
    }

    if (!resolvedUserId) {
      return NextResponse.json(
        { error: "Unable to resolve userId" },
        { status: 400 }
      );
    }

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      resolvedUserId,
      { email_confirm: true }
    );

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to confirm email" },
      { status: 500 }
    );
  }
}
