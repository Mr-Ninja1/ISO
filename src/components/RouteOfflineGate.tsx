"use client";

import { useAppOffline } from "@/lib/client/useAppOffline";
import { OfflineRouteBlock } from "@/components/OfflineRouteBlock";

type Props = {
  title: string;
  message: string;
  hint?: string;
  backHref?: string;
  backLabel?: string;
  children: React.ReactNode;
};

export function RouteOfflineGate({
  title,
  message,
  hint,
  backHref,
  backLabel,
  children,
}: Props) {
  const offline = useAppOffline();

  if (offline) {
    return <OfflineRouteBlock title={title} message={message} hint={hint} backHref={backHref} backLabel={backLabel} />;
  }

  return <>{children}</>;
}