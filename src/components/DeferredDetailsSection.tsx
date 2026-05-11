"use client";

import { useState } from "react";
import { Loader2, ChevronDown } from "lucide-react";

type Props = {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
};

export function DeferredDetailsSection({ title, defaultOpen = false, children }: Props) {
  const [hasOpened, setHasOpened] = useState(defaultOpen);
  const [isLoading, setIsLoading] = useState(false);

  const handleToggle = (event: React.SyntheticEvent<HTMLDetailsElement>) => {
    const el = event.currentTarget;
    if (el.open && !hasOpened) {
      setIsLoading(true);
      // Simulate a brief loading delay for better UX
      setTimeout(() => {
        setHasOpened(true);
        setIsLoading(false);
      }, 200);
    } else if (el.open) {
      setHasOpened(true);
    }
  };

  return (
    <details
      className="group rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50/80 p-4 shadow-sm transition-all hover:shadow-md"
      open={defaultOpen ? true : undefined}
      onToggle={handleToggle}
    >
      <summary className="flex cursor-pointer select-none items-center justify-between text-sm font-semibold text-slate-900 list-none">
        <span>{title}</span>
        <ChevronDown className="h-5 w-5 text-slate-500 transition-transform group-open:rotate-180" />
      </summary>
      {isLoading ? (
        <div className="mt-4 flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      ) : hasOpened ? (
        <div className="mt-4">{children}</div>
      ) : null}
    </details>
  );
}
