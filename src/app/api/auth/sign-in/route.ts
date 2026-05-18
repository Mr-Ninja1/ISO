import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type SignInBody = {
  email?: string;
  password?: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as SignInBody;
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.session || !data.user) {
      return NextResponse.json({ error: error?.message || "Sign in failed" }, { status: 401 });
    }

    return NextResponse.json({
      session: data.session,
      user: {
        id: data.user.id,
        email: data.user.email || email,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Sign in failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}