"use client";

import { Suspense, type ReactNode } from "react";
import { RouteLoadingFallback } from "@/components/SuspenseFallback";

export function SearchParamsBoundary({ children }: { children: ReactNode }) {
  return <Suspense fallback={<RouteLoadingFallback />}>{children}</Suspense>;
}
