import type { CopilotCapabilities, CopilotResponse } from "@/lib/copilot/intents";
import { screenContextLabel } from "@/lib/copilot/intents";

type FuzzyTopic = {
  id: string;
  keywords: string[];
  patterns?: RegExp[];
  minScore: number;
  build: (ctx: {
    tenantSlug: string;
    pathname: string;
    caps: CopilotCapabilities;
  }) => CopilotResponse;
};

function tokenize(message: string): string[] {
  return message
    .toLowerCase()
    .replace(/['']/g, "")
    .split(/[\s,.!?;:()\-–—]+/)
    .filter((t) => t.length > 1);
}

function scoreTopic(message: string, topic: FuzzyTopic): number {
  const lower = message.toLowerCase();
  const tokens = new Set(tokenize(message));
  let score = 0;

  for (const kw of topic.keywords) {
    const kwLower = kw.toLowerCase();
    if (lower.includes(kwLower)) {
      score += kwLower.includes(" ") ? 3 : kwLower.length >= 6 ? 2 : 1;
    } else if (tokens.has(kwLower)) {
      score += 2;
    }
  }

  for (const pattern of topic.patterns ?? []) {
    if (pattern.test(message)) score += 4;
  }

  return score;
}

const FUZZY_TOPICS: FuzzyTopic[] = [
  {
    id: "saved_submissions",
    keywords: [
      "saved",
      "submitted",
      "submission",
      "submissions",
      "completed",
      "filled",
      "reports",
      "audit",
      "audits",
      "yesterday",
      "today",
      "week",
      "recent",
      "history",
      "entries",
      "records",
    ],
    patterns: [
      /looking for.*(saved|submitted|completed)/i,
      /find.*(saved|submitted|completed)/i,
      /where.*(saved|submitted|reports?)/i,
      /check.*(saved|submitted|forms?)/i,
      /see.*(saved|submitted|completed)/i,
      /list.*(saved|submitted)/i,
    ],
    minScore: 2,
    build: ({ tenantSlug }) => ({
      message:
        "Sounds like you want **saved submissions** — completed forms your team has filled in. I can take you there or explain how to filter by date.",
      actions: [
        { type: "navigate", label: "Open saved forms", href: `/${tenantSlug}/audits` },
        {
          type: "navigate",
          label: "Workspace (forms to fill)",
          href: `/workspace/forms?tenantSlug=${encodeURIComponent(tenantSlug)}`,
        },
      ],
      suggestions: ["Forms submitted today?", "How do I export a PDF?", "How do I share saved forms?"],
    }),
  },
  {
    id: "create_form",
    keywords: [
      "create",
      "new",
      "build",
      "make",
      "design",
      "draft",
      "generate",
      "checklist",
      "questionnaire",
      "inspection",
      "log",
      "sheet",
      "template",
    ],
    patterns: [
      /want to (create|make|build|design)/i,
      /need (a |an )?(new )?(form|checklist|template)/i,
      /set up (a )?(form|checklist)/i,
      /start (a )?(new )?form/i,
    ],
    minScore: 2,
    build: ({ tenantSlug, caps }) => ({
      message: caps.canCreateForms
        ? "It sounds like you want to **create a form**. Open the builder and use **Create with AI** to describe it, or start from a blank canvas."
        : "Form creation needs manager or admin access. Ask your brand admin, or I can show you where to view existing forms.",
      actions: caps.canCreateForms
        ? [
            {
              type: "navigate",
              label: "Open form builder",
              href: `/${tenantSlug}/templates/new`,
            },
            { type: "navigate", label: "Template library", href: `/${tenantSlug}/templates/library` },
          ]
        : [
            {
              type: "navigate",
              label: "Workspace",
              href: `/workspace/forms?tenantSlug=${encodeURIComponent(tenantSlug)}`,
            },
          ],
      suggestions: [
        "Daily fridge temperature log with 12 rows",
        "Kitchen closing checklist with photo evidence",
        "How do I add a category?",
      ],
    }),
  },
  {
    id: "categories",
    keywords: ["category", "categories", "group", "organize", "organise", "folder", "section"],
    patterns: [/group.*forms/i, /organize.*forms/i, /new (section|group)/i],
    minScore: 2,
    build: ({ tenantSlug, caps }) => ({
      message: caps.canManageCategories
        ? "You might be asking about **categories** — they group forms on your workspace. I can take you there and walk you through adding one."
        : "Category management is for managers and admins. I can still show you the workspace or saved forms.",
      actions: caps.canManageCategories
        ? [{ type: "navigate", label: "Open categories", href: `/${tenantSlug}/categories` }]
        : [],
      suggestions: ["How do I add a category?", "Create a form", "Open workspace"],
    }),
  },
  {
    id: "staff",
    keywords: ["staff", "user", "users", "team", "member", "members", "invite", "employee", "colleague", "access"],
    patterns: [
      /add.*(person|people|user|staff)/i,
      /invite.*(user|staff|team)/i,
      /new (user|staff|member)/i,
    ],
    minScore: 2,
    build: ({ tenantSlug, caps }) => ({
      message: caps.canManageStaff
        ? "Sounds like a **staff or access** question. Admins add team members in Settings → Staff with name, email, role, and password."
        : "Only brand admins can add staff. Ask your admin, or I can help with forms and workspace tasks.",
      actions: caps.canManageStaff
        ? [
            {
              type: "navigate",
              label: "Open staff settings",
              href: `/${tenantSlug}/settings?focus=staff`,
            },
          ]
        : [],
      suggestions: ["What do the roles mean?", "How do I create a form?", "Open settings"],
    }),
  },
  {
    id: "settings",
    keywords: ["settings", "setting", "config", "configure", "logo", "brand", "profile", "preferences"],
    patterns: [/change.*logo/i, /brand.*settings/i, /where.*settings/i],
    minScore: 2,
    build: ({ tenantSlug, caps }) => ({
      message: caps.canAccessSettings
        ? "You might need **brand settings** — logo, staff, templates, storage usage, and more."
        : "Settings are available to managers and admins on your brand.",
      actions: caps.canAccessSettings
        ? [
            { type: "navigate", label: "Open settings", href: `/${tenantSlug}/settings` },
            {
              type: "navigate",
              label: "Plan & usage",
              href: `/${tenantSlug}/settings?focus=usage`,
            },
          ]
        : [],
      suggestions: ["Show storage usage", "Add a staff member", "Manage categories"],
    }),
  },
  {
    id: "pdf_export",
    keywords: ["pdf", "export", "download", "print", "document", "report"],
    patterns: [/get (a )?pdf/i, /save as pdf/i, /print.*form/i],
    minScore: 2,
    build: ({ tenantSlug }) => ({
      message:
        "For **PDF export**, open a saved submission and tap **Download PDF**. Landscape works best for wide tables — columns auto-shrink to fit.",
      actions: [{ type: "navigate", label: "Saved forms", href: `/${tenantSlug}/audits` }],
      suggestions: ["How do I export a PDF?", "How do I share without PDF?", "Wide table tips"],
    }),
  },
  {
    id: "workspace",
    keywords: ["workspace", "home", "fill", "open", "start", "begin", "complete", "submit"],
    patterns: [
      /fill (in |out )?(a )?form/i,
      /submit (a )?form/i,
      /open (a )?form/i,
      /start (an )?audit/i,
    ],
    minScore: 2,
    build: ({ tenantSlug }) => ({
      message:
        "The **workspace** is where your team opens and fills in forms. Saved submissions appear separately under Saved forms.",
      actions: [
        {
          type: "navigate",
          label: "Open workspace",
          href: `/workspace/forms?tenantSlug=${encodeURIComponent(tenantSlug)}`,
        },
        { type: "navigate", label: "Saved forms", href: `/${tenantSlug}/audits` },
      ],
      suggestions: ["How do I submit a form?", "Where are saved forms?", "Create a new form"],
    }),
  },
  {
    id: "storage_plan",
    keywords: ["storage", "quota", "limit", "upgrade", "plan", "trial", "credits", "usage", "space"],
    patterns: [/running out/i, /how much.*left/i, /ai credits/i],
    minScore: 2,
    build: ({ tenantSlug, caps }) => ({
      message: caps.canAccessSettings
        ? "You're asking about **storage or AI limits**. Check Settings → Plan & usage for your allowance, or contact your platform developer to upgrade."
        : "Storage and AI limits are managed by your brand admin.",
      actions: caps.canAccessSettings
        ? [
            {
              type: "navigate",
              label: "Plan & usage",
              href: `/${tenantSlug}/settings?focus=usage`,
            },
          ]
        : [],
      suggestions: ["How does AI form creation work?", "Contact developer to upgrade"],
    }),
  },
  {
    id: "templates",
    keywords: ["templates", "template", "library", "import", "existing"],
    patterns: [/edit.*(form|template)/i, /change.*(form|template)/i],
    minScore: 2,
    build: ({ tenantSlug, caps }) => ({
      message: caps.canCreateForms
        ? "Sounds like a **templates** question — manage existing forms or import from the library."
        : "Templates are managed by managers and admins.",
      actions: caps.canCreateForms
        ? [
            { type: "navigate", label: "Templates", href: `/${tenantSlug}/templates` },
            { type: "navigate", label: "Template library", href: `/${tenantSlug}/templates/library` },
          ]
        : [],
      suggestions: ["How do I edit a form?", "Create a new form", "Open workspace"],
    }),
  },
  {
    id: "corrective",
    keywords: ["corrective", "action", "follow", "followup", "follow-up", "issue", "nonconformance"],
    minScore: 2,
    build: ({ tenantSlug, caps }) => ({
      message: caps.canAccessSettings
        ? "You might mean **corrective actions** — track follow-ups from inspections with owners and due dates."
        : "Corrective actions are managed by managers and admins.",
      actions: caps.canAccessSettings
        ? [
            {
              type: "navigate",
              label: "Corrective actions",
              href: `/${tenantSlug}/corrective-actions`,
            },
          ]
        : [],
      suggestions: ["How do I create a form?", "Open saved forms"],
    }),
  },
];

const TOPIC_LABELS: Record<string, string> = {
  saved_submissions: "saved submissions",
  create_form: "creating a form",
  categories: "categories",
  staff: "staff & access",
  settings: "settings",
  pdf_export: "PDF export",
  workspace: "the workspace",
  storage_plan: "storage & plan limits",
  templates: "templates",
  corrective: "corrective actions",
};

/**
 * Best-effort match when exact intents miss — returns ranked suggestions instead of a dead end.
 */
export function resolveFuzzyIntent(
  message: string,
  ctx: { tenantSlug: string; pathname: string; caps: CopilotCapabilities },
): CopilotResponse | null {
  const scored = FUZZY_TOPICS.map((topic) => ({
    topic,
    score: scoreTopic(message, topic),
  }))
    .filter((s) => s.score >= s.topic.minScore)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return null;

  const best = scored[0];
  const runnerUp = scored[1];

  // Two strong matches — offer both without guessing
  if (runnerUp && runnerUp.score >= best.score * 0.75 && runnerUp.score >= 3) {
    const labels = [best.topic.id, runnerUp.topic.id].map((id) => TOPIC_LABELS[id] || id);
    const primary = best.topic.build(ctx);
    const secondary = runnerUp.topic.build(ctx);
    const mergedActions = [...primary.actions, ...secondary.actions].filter(
      (action, index, arr) => arr.findIndex((a) => a.href === action.href) === index,
    );

    return {
      message: `I think you might be asking about **${labels[0]}** or **${labels[1]}**. Here are the most relevant places to go:`,
      actions: mergedActions.slice(0, 4),
      suggestions: [
        ...(primary.suggestions ?? []).slice(0, 2),
        ...(secondary.suggestions ?? []).slice(0, 1),
      ],
    };
  }

  const response = best.topic.build(ctx);
  const label = TOPIC_LABELS[best.topic.id] || "that";
  return {
    ...response,
    message: `Based on what you said, this looks related to **${label}**.\n\n${response.message}`,
  };
}

/** Screen-aware fallback when nothing else matches but message seems in-scope. */
export function buildContextualFallback(
  message: string,
  ctx: { tenantSlug: string; pathname: string; caps: CopilotCapabilities },
): CopilotResponse {
  const screen = screenContextLabel(ctx.pathname);
  const lower = message.toLowerCase();

  const screenActions = [];
  if (ctx.pathname.includes("/audits")) {
    screenActions.push({
      type: "navigate" as const,
      label: "Workspace",
      href: `/workspace/forms?tenantSlug=${encodeURIComponent(ctx.tenantSlug)}`,
    });
  } else if (ctx.pathname.includes("/templates")) {
    if (ctx.caps.canCreateForms) {
      screenActions.push({
        type: "navigate" as const,
        label: "Create form",
        href: `/${ctx.tenantSlug}/templates/new`,
      });
    }
  } else if (ctx.pathname.includes("/workspace")) {
    screenActions.push({
      type: "navigate" as const,
      label: "Saved forms",
      href: `/${ctx.tenantSlug}/audits`,
    });
  }

  const rephrase =
    lower.length > 20
      ? "I didn't catch the exact feature, but I can still help if you pick something close below."
      : "Could you say a bit more? For example: *show saved forms from today* or *how do I create a checklist*.";

  return {
    message: `You're on **${screen}**. ${rephrase}`,
    actions:
      screenActions.length > 0
        ? screenActions
        : [
            {
              type: "navigate" as const,
              label: "Saved forms",
              href: `/${ctx.tenantSlug}/audits`,
            },
            {
              type: "navigate" as const,
              label: "Workspace",
              href: `/workspace/forms?tenantSlug=${encodeURIComponent(ctx.tenantSlug)}`,
            },
          ],
    suggestions: ctx.caps.canCreateForms
      ? ["How do I create a form?", "Where are saved forms?", "How do I export a PDF?"]
      : ["Where are saved forms?", "How do I export a PDF?", "Open workspace"],
  };
}
