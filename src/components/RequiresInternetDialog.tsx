"use client";

import { useCallback, useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

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
  window.alert(message || `${feature} needs an internet connection. Connect once, then try again.`);
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4" role="presentation">
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
      className="relative z-10 w-full max-w-md rounded-2xl border border-foreground/20 bg-background p-5 shadow-xl"
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
            {message ||
              `${feature} needs an internet connection. Your forms and saved work on this device stay available offline.`}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="mt-4 inline-flex h-10 items-center justify-center rounded-full bg-foreground px-4 text-sm font-medium text-background"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
