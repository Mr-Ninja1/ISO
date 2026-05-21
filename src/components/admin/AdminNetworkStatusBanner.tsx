"use client";

import { WifiOff } from "lucide-react";

type Props = {
  offline: boolean;
  pending?: boolean;
  error?: string | null;
  onDismissError?: () => void;
};

export function AdminNetworkStatusBanner({ offline, pending, error, onDismissError }: Props) {
  if (!offline && !pending && !error) return null;

  return (
    <div className="space-y-2">
      {offline ? (
        <div
          className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
          role="status"
        >
          <WifiOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div>
            <p className="font-semibold">You are offline</p>
            <p className="mt-1 text-xs leading-5 text-amber-900/90">
              Your draft text is kept on screen. Reconnect to save, send messages, or refresh brand data.
            </p>
          </div>
        </div>
      ) : null}

      {pending && !offline ? (
        <p className="text-xs text-foreground/55" role="status">
          Waiting for server…
        </p>
      ) : null}

      {error ? (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <p className="min-w-0">{error}</p>
          {onDismissError ? (
            <button
              type="button"
              onClick={onDismissError}
              className="shrink-0 text-xs font-semibold underline underline-offset-2"
            >
              Dismiss
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
