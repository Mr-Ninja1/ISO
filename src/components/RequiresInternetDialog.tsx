"use client";

import { useCallback, useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { INTERNET_REQUIRED_MESSAGE } from "@/lib/client/internetRequired";

type DialogState = {
  feature: string;
  message?: string;
};

let openHandler: ((state: DialogState) => void) | null = null;

/** Show the shared “needs internet” modal from anywhere in the client app. */
export function showRequiresInternetDialog(feature: string, message?: string) {
  if (openHandler) {
    openHandler({ feature, message });
    return;
  }
  window.alert(message || INTERNET_REQUIRED_MESSAGE);
}

export function RequiresInternetDialogHost() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<DialogState | null>(null);

  useEffect(() => {
    openHandler = (next) => {
      setState(next);
      setOpen(true);
    };
    return () => {
      openHandler = null;
    };
  }, []);

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  if (!open || !state) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" role="presentation">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close dialog" onClick={close} />
      <RequiresInternetDialogCard feature={state.feature} message={state.message} onClose={close} />
    </div>
  );
}

function RequiresInternetDialogCard({
  feature,
  message,
  onClose,
}: {
  feature: string;
  message?: string;
  onClose: () => void;
}) {
  return (
    <div
      className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl shadow-slate-300/30"
      role="dialog"
      aria-modal="true"
      aria-labelledby="requires-internet-title"
    >
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-300/40 bg-amber-50 text-amber-900">
          <WifiOff className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="requires-internet-title" className="text-lg font-semibold">
            Internet required
          </h2>
          <p className="mt-2 text-sm leading-6 text-foreground/75">
            {message || INTERNET_REQUIRED_MESSAGE}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="ui-btn-primary mt-4 inline-flex h-10 items-center justify-center px-4 text-sm"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
