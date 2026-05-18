"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";

export default function Home() {
  const router = useRouter();
  const { loading, user } = useAuth();

  useEffect(() => {
    if (loading) return;
    router.replace(user?.id ? "/workspace" : "/login");
  }, [loading, router, user?.id]);

  return <main className="min-h-dvh bg-background" />;
}