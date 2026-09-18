"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { isCapacitorNativeApp } from "@/lib/capacitor/runtime";

/**
 * Capacitor-only bootstraps. On the web they are no-ops, but mounting them still
 * costs parse/effect setup on every page — gate them until we know we are native.
 */
const CapacitorRouteRewrite = dynamic(
  () => import("@/components/CapacitorRouteRewrite").then((m) => m.CapacitorRouteRewrite),
  { ssr: false },
);
const CapacitorRouterRewrite = dynamic(
  () => import("@/components/CapacitorRouterRewrite").then((m) => m.CapacitorRouterRewrite),
  { ssr: false },
);
const LiveUpdateBootstrap = dynamic(
  () => import("@/components/LiveUpdateBootstrap").then((m) => m.LiveUpdateBootstrap),
  { ssr: false },
);
const CapacitorStylesGuard = dynamic(
  () => import("@/components/CapacitorStylesGuard").then((m) => m.CapacitorStylesGuard),
  { ssr: false },
);
const NativeUpdateGate = dynamic(
  () => import("@/components/NativeUpdateGate").then((m) => m.NativeUpdateGate),
  { ssr: false },
);
const CapacitorEntryRedirect = dynamic(
  () => import("@/components/CapacitorEntryRedirect").then((m) => m.CapacitorEntryRedirect),
  { ssr: false },
);
const CapacitorAppRecovery = dynamic(
  () => import("@/components/CapacitorAppRecovery").then((m) => m.CapacitorAppRecovery),
  { ssr: false },
);
const CapacitorBackButtonHandler = dynamic(
  () => import("@/components/CapacitorBackButtonHandler").then((m) => m.CapacitorBackButtonHandler),
  { ssr: false },
);
const PushNotificationsBootstrap = dynamic(
  () =>
    import("@/components/PushNotificationsBootstrap").then((m) => m.PushNotificationsBootstrap),
  { ssr: false },
);

export function NativeRuntimeShell() {
  const [native, setNative] = useState(false);

  useEffect(() => {
    setNative(isCapacitorNativeApp());
  }, []);

  if (!native) return null;

  return (
    <>
      <CapacitorRouteRewrite />
      <CapacitorRouterRewrite />
      <LiveUpdateBootstrap />
      <CapacitorStylesGuard />
      <NativeUpdateGate />
      <CapacitorEntryRedirect />
      <CapacitorAppRecovery />
      <CapacitorBackButtonHandler />
      <PushNotificationsBootstrap />
    </>
  );
}
