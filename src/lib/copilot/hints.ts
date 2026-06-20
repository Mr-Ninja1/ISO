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
    id: "general",
    text: "Stuck? Ask me anything — forms, categories, staff, saved reports.",
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
  const name = brandName ? ` for ${brandName}` : "";

  if (pathname.includes("/templates/new")) {
    return {
      message: `You're in the form builder${name}. I can help you use **Create with AI**, add table columns, or find saved templates.`,
      suggestions: [
        "How does AI form creation work?",
        "What's the column limit?",
        "Take me to saved forms",
      ],
    };
  }
  if (pathname.includes("/audits")) {
    return {
      message: `You're viewing saved forms${name}. I can help you find submissions, export PDFs, or jump back to fill a new form.`,
      suggestions: ["How do I export PDF?", "Open workspace", "Create a new form"],
    };
  }
  if (pathname.includes("/settings")) {
    return {
      message: `Settings${name} — I can guide you to staff, categories, brand profile, or check your plan usage.`,
      suggestions: ["Add a staff member", "Show storage usage", "Manage categories"],
    };
  }
  if (pathname.includes("/categories")) {
    return {
      message: `Categories keep your workspace organised${name}. Ask me how to add one or reorder forms.`,
      suggestions: ["How do I add a category?", "Create a form", "Back to workspace"],
    };
  }
  if (pathname.includes("/workspace")) {
    return {
      message: `Welcome to your workspace${name}. I can help you open forms, create new ones with AI, or find what you submitted today.`,
      suggestions: ["Create a form with AI", "Where are saved forms?", "Add a category"],
    };
  }
  if (pathname.includes("/dashboard")) {
    return {
      message: `Dashboard${name} — ask me about trends, today's submissions, or where to manage templates.`,
      suggestions: ["Forms submitted today?", "Open saved forms", "Create a form"],
    };
  }

  return {
    message: `Hi — I'm your brand assistant${name}. I know this app inside out: forms, categories, staff, saved reports, PDF export, and more. What should we do?`,
    suggestions: ["Create a form", "Where are saved forms?", "Help me find settings"],
  };
}
