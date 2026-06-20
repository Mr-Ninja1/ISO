"use client";

import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";
import { DC_AI_NAME, DC_AI_SHORT } from "@/lib/ai/deepControl";
import { openBrandCopilot } from "@/lib/copilot/events";
import { shouldShowBrandCopilot } from "@/lib/copilot/visibility";
import { useAppOffline } from "@/lib/client/useAppOffline";

export function CopilotHeaderButton() {
  const pathname = usePathname() || "/";
  const offline = useAppOffline();

  if (!shouldShowBrandCopilot(pathname, offline)) return null;

  return (
    <button
      type="button"
      onClick={() => openBrandCopilot()}
      className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--hse-teal)_40%,transparent)] bg-[color-mix(in_srgb,var(--hse-teal)_10%,white)] px-3 text-xs font-semibold text-[var(--hse-teal)] shadow-sm transition hover:bg-[color-mix(in_srgb,var(--hse-teal)_16%,white)] sm:text-sm"
      title={DC_AI_NAME}
      aria-label={`Open ${DC_AI_NAME}`}
    >
      <Sparkles className="h-4 w-4" />
      <span className="hidden sm:inline">{DC_AI_SHORT}</span>
    </button>
  );
}
