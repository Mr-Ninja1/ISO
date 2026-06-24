import type { CopilotCapabilities } from "@/lib/copilot/intents";

export type CopilotHint = {
  id: string;
  text: string;
  /** Shown only when pathname matches one of these (substring) */
  screens?: string[];
  /** Requires capability */
  requires?: keyof CopilotCapabilities;
};

export const COPILOT_ROTATING_HINTS: CopilotHint[] = [
  {
    id: "create-form",
    text: "Hey — I can help you create a new form in seconds. Try me!",
    screens: ["/workspace", "/templates"],
    requires: "canCreateForms",
  },
  {
    id: "ai-form",
    text: "Describe a checklist or attach a photo — I'll walk you to AI form builder.",
    requires: "canCreateForms",
  },
  {
    id: "categories",
    text: "Need a new category? I can take you there and explain the steps.",
    requires: "canManageCategories",
  },
  {
    id: "staff",
    text: "Adding team members? I'll open Settings → Staff for you.",
    requires: "canManageStaff",
  },
  {
    id: "saved-forms",
    text: "Looking for submitted forms? I know exactly where they live.",
    screens: ["/workspace", "/dashboard"],
  },
  {
    id: "settings",
    text: "Can't find a setting? Ask me — logo, staff, usage, templates.",
    requires: "canAccessSettings",
  },
  {
    id: "pdf",
    text: "Exporting PDFs? I'll show you the best way for wide tables.",
    screens: ["/audits"],
  },
  {
    id: "temp-log",
    text: "Fridge log or temperature sheet? I have example prompts ready.",
    requires: "canCreateForms",
  },
  {
    id: "dashboard",
    text: "Want today's submission count? I can point you to the dashboard.",
    screens: ["/dashboard", "/workspace"],
    requires: "canAccessSettings",
  },
  {
    id: "tour",
    text: "New here? I'll give you a personalised tour of what you can do.",
    screens: ["/workspace", "/dashboard"],
  },
  {
    id: "offline",
    text: "Working on site with poor signal? Ask me how offline mode works.",
    screens: ["/workspace"],
  },
  {
    id: "hse-console",
    text: "Managers — I can walk you through the HSE console in 30 seconds.",
    screens: ["/workspace"],
    requires: "canAccessSettings",
  },
  {
    id: "general",
    text: "Exploring ISO Grid? Ask me anything — I'll guide you step by step.",
  },
];

export function hintsForScreen(
  pathname: string,
  caps: CopilotCapabilities,
): CopilotHint[] {
  return COPILOT_ROTATING_HINTS.filter((hint) => {
    if (hint.requires && !caps[hint.requires]) return false;
    if (hint.screens?.length) {
      return hint.screens.some((s) => pathname.includes(s));
    }
    return true;
  });
}

export function pickRotatingHint(
  pathname: string,
  caps: CopilotCapabilities,
  index: number,
): CopilotHint | null {
  const pool = hintsForScreen(pathname, caps);
  if (!pool.length) return null;
  return pool[index % pool.length];
}

export function getContextualWelcome(
  pathname: string,
  caps: CopilotCapabilities,
  brandName?: string,
): { message: string; suggestions: string[] } {
  const name = brandName ? ` for **${brandName}**` : "";

  if (pathname.includes("/templates/new")) {
    return {
      message: `You're in the form builder${name}. I can walk you through **Create with AI**, table columns, signatures, photo evidence, or jump to your template library.`,
      suggestions: [
        "How does AI form creation work?",
        "Example prompt for a fridge temperature log",
        "Take me to saved forms",
      ],
    };
  }
  if (pathname.includes("/audits")) {
    return {
      message: `Saved submissions${name}. I can help you filter records, export PDFs, share read-only links, or get back to filling forms.`,
      suggestions: ["How do I export PDF?", "Share submissions without PDF", "Open workspace"],
    };
  }
  if (pathname.includes("/settings")) {
    return {
      message: `Settings${name} — staff invites, brand logo, categories, storage usage, and your plan. Tell me what you want to change.`,
      suggestions: ["Add a staff member", "Show storage usage", "What can managers do here?"],
    };
  }
  if (pathname.includes("/categories")) {
    return {
      message: `Categories organise your workspace${name}. I can show you how to add one, assign forms, or reorder them.`,
      suggestions: ["How do I add a category?", "Create a form with AI", "Back to workspace"],
    };
  }
  if (pathname.includes("/workspace")) {
    const adminPitch = caps.canAccessSettings
      ? " You're in the **HSE console** — I can tour the admin shortcuts or jump to field inspections."
      : "";
    return {
      message: `Welcome to your workspace${name}.${adminPitch} Ask me to fill a form, find submissions, or explain offline mode.`,
      suggestions: caps.canCreateForms
        ? ["Tour the HSE console", "Create a form with AI", "Where are saved forms?"]
        : ["Fill a form", "Where are saved forms?", "How does offline work?"],
    };
  }
  if (pathname.includes("/dashboard")) {
    return {
      message: `Dashboard${name} — compliance metrics, today's activity, and trends. I can explain any chart or take you to templates and corrective actions.`,
      suggestions: ["Forms submitted today?", "Open corrective actions", "Create a form"],
    };
  }
  if (pathname.includes("/activity")) {
    return {
      message: `Activity log${name} — see who changed forms, staff, and settings. Great for audits and compliance reviews.`,
      suggestions: ["Who submitted forms today?", "Open brand settings", "Back to workspace"],
    };
  }
  if (pathname.includes("/corrective-actions")) {
    return {
      message: `Corrective actions${name} — track follow-ups from inspections with owners and due dates.`,
      suggestions: ["How do I assign an owner?", "Open saved forms", "HSE dashboard"],
    };
  }

  const roleHint = caps.canAccessSettings
    ? "HSE console, dashboard, staff, AI forms, and field inspections"
    : caps.canCreateForms
      ? "forms, categories, saved reports, and PDF export"
      : "filling forms, saved submissions, and offline field work";

  return {
    message: `Hi — I'm **Deep Control**, your ISO Grid guide${name}. I know ${roleHint}. What would you like to do first?`,
    suggestions: caps.canCreateForms
      ? ["Give me a quick product tour", "Create a form with AI", "Where are saved forms?"]
      : ["What can I do here?", "Fill a form", "Where are saved forms?"],
  };
}
