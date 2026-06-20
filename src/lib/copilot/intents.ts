import { resolvePlaybook } from "@/lib/copilot/playbooks";
import {
  classifyCopilotMessage,
  buildOffTopicResponse,
  buildUnsupportedResponse,
  buildUnclearResponse,
} from "@/lib/copilot/guardrails";

export type CopilotAction = {
  type: "navigate" | "open_url";
  label: string;
  href: string;
};

export type CopilotResponse = {
  message: string;
  actions: CopilotAction[];
  suggestions?: string[];
};

export type CopilotCapabilities = {
  canCreateForms: boolean;
  canManageCategories: boolean;
  canManageStaff: boolean;
  canAccessSettings: boolean;
};

type IntentMatch = {
  patterns: RegExp[];
  build: (ctx: {
    tenantSlug: string;
    pathname: string;
    caps: CopilotCapabilities;
  }) => CopilotResponse;
};

const INTENTS: IntentMatch[] = [
  {
    patterns: [
      /forms?.*(saved|submitted).*today/i,
      /today.*(saved|submitted).*forms?/i,
      /forms? that were (saved|submitted).*today/i,
      /(saved|submitted).*today/i,
      /forms?.*today/i,
      /today.*forms?/i,
    ],
    build: ({ tenantSlug }) => ({
      message:
        "Saved forms hold completed submissions. Tap **Saved forms** below — today's entries are near the top.",
      actions: [{ type: "navigate", label: "Saved forms", href: `/${tenantSlug}/audits` }],
    }),
  },
  {
    patterns: [
      /want to see.*forms.*(saved|submitted)/i,
      /like to see.*forms.*(saved|submitted)/i,
      /need to see.*forms.*(saved|submitted)/i,
      /see.*(saved|submitted).*forms/i,
      /view.*(saved|submitted).*forms/i,
      /show.*(saved|submitted).*forms/i,
      /forms that were (saved|submitted)/i,
      /recent submissions/i,
      /completed forms/i,
    ],
    build: ({ tenantSlug }) => ({
      message: "Saved forms are your submitted entries. Choose **Saved forms** below to open the list.",
      actions: [{ type: "navigate", label: "Saved forms", href: `/${tenantSlug}/audits` }],
    }),
  },
  {
    patterns: [
      /^(saved forms?|submitted forms?|stored forms?)[.?!]*$/i,
      /\bopen saved forms?\b/i,
      /\bgo to saved forms?\b/i,
    ],
    build: ({ tenantSlug }) => ({
      message: "Opening **Saved forms** — tap below if you'd like to go there now.",
      actions: [{ type: "navigate", label: "Saved forms", href: `/${tenantSlug}/audits` }],
    }),
  },
  {
    patterns: [/forms?.*(saved|submitted)/i, /(saved|submitted).*forms?/i],
    build: ({ tenantSlug }) => ({
      message:
        "Do you mean **saved submissions** (already filled in) or **templates** (forms to fill in)? Pick below:",
      actions: [
        { type: "navigate", label: "Saved forms (submissions)", href: `/${tenantSlug}/audits` },
        { type: "navigate", label: "Workspace (forms to fill)", href: `/workspace/forms?tenantSlug=${encodeURIComponent(tenantSlug)}` },
        { type: "navigate", label: "Templates", href: `/${tenantSlug}/templates` },
      ],
      suggestions: ["How do I create a form?", "How do I export a PDF?"],
    }),
  },
  {
    patterns: [/create (a )?form/i, /new form/i, /build (a )?form/i, /make (a )?form/i, /ai form/i],
    build: ({ tenantSlug, caps }) => ({
      message: caps.canCreateForms
        ? "I can take you to the form builder. Use **Create with AI** to describe your form, or build manually from a blank canvas."
        : "Form creation needs manager or admin access. Ask your brand admin to create forms, or request a higher role.",
      actions: caps.canCreateForms
        ? [
            {
              type: "navigate",
              label: "Open form builder",
              href: `/${tenantSlug}/templates/new`,
            },
          ]
        : [],
      suggestions: [
        "Daily fridge temperature log with 12 rows",
        "Kitchen closing checklist with photo evidence",
      ],
    }),
  },
  {
    patterns: [/add (a )?categor/i, /create (a )?categor/i, /new categor/i],
    build: ({ tenantSlug, caps }) => ({
      message: caps.canManageCategories
        ? "Categories group forms on your workspace. Open Categories, then click **Add category** and name it (e.g. Cold storage, Cleaning)."
        : "Only managers and admins can manage categories.",
      actions: caps.canManageCategories
        ? [{ type: "navigate", label: "Open categories", href: `/${tenantSlug}/categories` }]
        : [],
    }),
  },
  {
    patterns: [/add staff/i, /new staff/i, /invite staff/i, /add (a )?user/i, /team member/i],
    build: ({ tenantSlug, caps }) => ({
      message: caps.canManageStaff
        ? "Staff accounts are added in **Settings → Staff**. You’ll set name, email, password, and role (Manager, Auditor, etc.)."
        : "Only brand admins can add staff. Ask your admin to invite you or add team members.",
      actions: caps.canManageStaff
        ? [
            {
              type: "navigate",
              label: "Open staff settings",
              href: `/${tenantSlug}/settings?focus=staff`,
            },
          ]
        : [],
    }),
  },
  {
    patterns: [/saved forms/i, /submitted forms/i, /form submissions/i, /stored forms/i, /audit reports?/i],
    build: ({ tenantSlug }) => ({
      message:
        "Saved forms (submissions) live under **Saved forms**. Open any entry to view the report or export PDF.",
      actions: [{ type: "navigate", label: "View saved forms", href: `/${tenantSlug}/audits` }],
    }),
  },
  {
    patterns: [/how many.*today/i, /forms today/i, /submitted today/i],
    build: ({ tenantSlug }) => ({
      message:
        "For today's submissions, open **Saved forms** — the newest are listed first.",
      actions: [{ type: "navigate", label: "Saved forms", href: `/${tenantSlug}/audits` }],
    }),
  },
  {
    patterns: [/templates/i, /my forms/i, /form list/i],
    build: ({ tenantSlug }) => ({
      message: "Templates are the forms your team fills in. Manage them from the workspace or Templates page.",
      actions: [
        { type: "navigate", label: "Workspace", href: `/workspace/forms?tenantSlug=${encodeURIComponent(tenantSlug)}` },
        { type: "navigate", label: "Templates", href: `/${tenantSlug}/templates` },
      ],
    }),
  },
  {
    patterns: [/settings/i, /brand settings/i, /logo/i],
    build: ({ tenantSlug, caps }) => ({
      message: caps.canAccessSettings
        ? "Brand settings include logo, staff, templates, and storage usage."
        : "Settings are available to managers and admins.",
      actions: caps.canAccessSettings
        ? [{ type: "navigate", label: "Open settings", href: `/${tenantSlug}/settings` }]
        : [],
    }),
  },
  {
    patterns: [/storage/i, /quota/i, /limit/i, /upgrade/i],
    build: ({ tenantSlug, caps }) => ({
      message: caps.canAccessSettings
        ? "Each brand has a storage allowance and monthly AI form credits. Check **Settings → Plan & usage** for details, or contact your platform developer to upgrade."
        : "Storage and AI limits are managed by your brand admin.",
      actions: caps.canAccessSettings
        ? [{ type: "navigate", label: "Settings & usage", href: `/${tenantSlug}/settings?focus=usage` }]
        : [],
    }),
  },
  {
    patterns: [/pdf/i, /export/i, /download/i],
    build: () => ({
      message:
        "Open a saved form report, then use **Download PDF** (landscape works best for wide tables). The export shrinks columns so everything fits on the page.",
      actions: [],
    }),
  },
  {
    patterns: [/help/i, /what can you do/i, /how do i/i, /show me how/i, /where (is|are)/i],
    build: (ctx) => {
      const screen = screenContextLabel(ctx.pathname);
      return {
        message: `You're on **${screen}**. Tell me what you're trying to do — I'll give step-by-step help or point you to the right place.\n\nExamples: *How do I create a form?* · *Where are saved forms?*`,
        actions: [],
        suggestions: ctx.caps.canCreateForms
          ? ["How do I create a form?", "Where are saved forms?", "How do I add a category?"]
          : ["Where are saved forms?", "How do I export a PDF?", "What can you help with?"],
      };
    },
  },
  {
    patterns: [/corrective/i, /action plan/i, /follow.?up/i],
    build: ({ tenantSlug, caps }) => ({
      message: caps.canAccessSettings
        ? "Corrective actions track follow-ups from inspections. Open the corrective actions board to assign owners and due dates."
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
    }),
  },
  {
    patterns: [/activity/i, /audit trail/i, /who changed/i, /history/i],
    build: ({ tenantSlug, caps }) => ({
      message: caps.canAccessSettings
        ? "The activity log shows who changed forms, staff, and settings. Handy for compliance reviews."
        : "Activity history is available to managers and admins.",
      actions: caps.canAccessSettings
        ? [{ type: "navigate", label: "Activity log", href: `/${tenantSlug}/activity` }]
        : [],
    }),
  },
  {
    patterns: [/workspace/i, /home/i, /main page/i, /form list/i],
    build: ({ tenantSlug }) => ({
      message:
        "Your workspace lists every form your team can fill in, grouped by category. Pin favourites and open forms with one tap.",
      actions: [
        {
          type: "navigate",
          label: "Open workspace",
          href: `/workspace/forms?tenantSlug=${encodeURIComponent(tenantSlug)}`,
        },
      ],
    }),
  },
  {
    patterns: [/library/i, /import/i, /template library/i],
    build: ({ tenantSlug, caps }) => ({
      message: caps.canCreateForms
        ? "Import ready-made forms from the library, then customise fields in the builder."
        : "The template library is available to managers and admins.",
      actions: caps.canCreateForms
        ? [
            {
              type: "navigate",
              label: "Template library",
              href: `/${tenantSlug}/templates/library`,
            },
          ]
        : [],
    }),
  },
  {
    patterns: [/column/i, /table/i, /how many columns/i, /grid/i],
    build: ({ tenantSlug, caps }) => ({
      message:
        "Table forms support up to **8 columns**. For PDF export, landscape mode fits wide tables best — columns auto-shrink so nothing gets clipped.",
      actions: caps.canCreateForms
        ? [{ type: "navigate", label: "Create a table form", href: `/${tenantSlug}/templates/new` }]
        : [],
      suggestions: ["Daily fridge log with 12 rows", "Kitchen checklist with photo column"],
    }),
  },
  {
    patterns: [/photo/i, /picture/i, /evidence/i, /attach/i],
    build: ({ tenantSlug, caps }) => ({
      message:
        "Add **photo evidence** fields in the builder, or attach a photo/PDF when using AI form creation — I'll read the layout and draft columns for you.",
      actions: caps.canCreateForms
        ? [{ type: "navigate", label: "Create with AI", href: `/${tenantSlug}/templates/new` }]
        : [],
    }),
  },
  {
    patterns: [/checklist/i, /questionnaire/i, /inspection/i, /temperature/i, /temp log/i, /fridge/i, /haccp/i],
    build: ({ tenantSlug, caps }) => ({
      message:
        "Describe your form in detail — form type, rows, columns, signatures, photo evidence. Example: *Daily fridge log: 12 rows, columns Date | Temp °C | Initials | Signature*.",
      actions: caps.canCreateForms
        ? [{ type: "navigate", label: "Create with AI", href: `/${tenantSlug}/templates/new` }]
        : [],
      suggestions: [
        "Kitchen opening checklist: 15 rows, OK? | Notes | Photo",
        "Staff feedback questionnaire: 8 yes/no and text questions",
      ],
    }),
  },
];

const HELP_TOPICS: Array<{ keywords: string[]; title: string; body: string }> = [
  {
    keywords: ["offline", "internet", "sync"],
    title: "Offline mode",
    body: "Some actions need internet once (loading workspace, creating forms). Submitted forms can sync when connection returns.",
  },
  {
    keywords: ["column", "table", "wide", "pdf clip"],
    title: "Wide tables in PDF",
    body: "Tables support up to 8 columns. PDF export auto-shrinks text so columns stay visible. Use landscape for best results.",
  },
  {
    keywords: ["role", "permission", "admin", "manager"],
    title: "Roles",
    body: "Admins manage staff and all settings. Managers create forms and categories. Auditors fill and submit forms.",
  },
  {
    keywords: ["ai", "gemini", "generate"],
    title: "AI form creation",
    body: "Describe your form or attach a photo — AI drafts the layout in seconds. You get free credits every month; upgrade for unlimited generations.",
  },
];

export function resolveCopilotIntent(
  message: string,
  ctx: { tenantSlug: string; pathname: string; caps: CopilotCapabilities },
): CopilotResponse {
  const trimmed = message.trim();

  if (!trimmed) {
    return buildUnclearResponse(ctx.tenantSlug, ctx.caps, "What would you like help with?");
  }

  const guard = classifyCopilotMessage(trimmed);
  if (guard.kind === "off_topic") {
    return buildOffTopicResponse(ctx.caps);
  }
  if (guard.kind === "unsupported" && guard.reason) {
    return buildUnsupportedResponse(guard.reason, ctx.caps);
  }

  const playbook = resolvePlaybook(trimmed, ctx);
  if (playbook) return playbook;

  for (const intent of INTENTS) {
    if (intent.patterns.some((p) => p.test(trimmed))) {
      const response = intent.build(ctx);
      if (guard.kind === "unclear" && response.actions.length !== 1) {
        return buildUnclearResponse(ctx.tenantSlug, ctx.caps);
      }
      return response;
    }
  }

  const lower = trimmed.toLowerCase();
  for (const topic of HELP_TOPICS) {
    if (topic.keywords.some((k) => lower.includes(k))) {
      return {
        message: `**${topic.title}**\n\n${topic.body}`,
        actions: [],
        suggestions: ["How do I create a form?", "Where are saved forms?", "How do I export a PDF?"],
      };
    }
  }

  if (guard.kind === "unclear" || !IN_SCOPE_FALLBACK.test(trimmed)) {
    return buildUnclearResponse(
      ctx.tenantSlug,
      ctx.caps,
      `I'm not sure what you mean yet. I only help with **this brand's workspace** — forms, submissions, staff, and settings.`,
    );
  }

  return buildUnclearResponse(
    ctx.tenantSlug,
    ctx.caps,
    `I didn't quite match that to a feature. Try being more specific about forms, saved submissions, staff, or settings.`,
  );
}

/** Loose in-scope check for fallback (mirrors guardrails). */
const IN_SCOPE_FALLBACK =
  /\b(form|template|audit|saved|submitted|category|staff|setting|workspace|dashboard|pdf|export|brand|inspection|checklist|corrective|storage|usage|plan|offline|sync|logo|library|report|share|role|admin|manager)\b/i;

export function screenContextLabel(pathname: string): string {
  if (pathname.includes("/templates/new")) return "Form builder";
  if (pathname.includes("/templates")) return "Templates";
  if (pathname.includes("/audits")) return "Saved forms";
  if (pathname.includes("/categories")) return "Categories";
  if (pathname.includes("/settings")) return "Settings";
  if (pathname.includes("/dashboard")) return "Dashboard";
  if (pathname.includes("/workspace")) return "Workspace";
  return "App";
}
