import type { CopilotAction, CopilotCapabilities, CopilotResponse } from "@/lib/copilot/intents";

export type PlaybookContext = {
  tenantSlug: string;
  pathname: string;
  caps: CopilotCapabilities;
};

type Playbook = {
  triggers: RegExp[];
  build: (ctx: PlaybookContext) => CopilotResponse | null;
};

function steps(lines: string[]) {
  return lines.map((line, i) => `${i + 1}. ${line}`).join("\n");
}

const PLAYBOOKS: Playbook[] = [
  {
    triggers: [
      /how (do|can|should) i (create|make|build|design).*(form|template)/i,
      /step.*create.*form/i,
      /walk me through.*form/i,
    ],
    build: ({ tenantSlug, caps }) => {
      if (!caps.canCreateForms) {
        return {
          message:
            "Form creation needs **Manager** or **Admin** access. Ask your brand admin to create forms, or request a higher role.",
          actions: [],
        };
      }
      return {
        message: `**Create a form — step by step**\n\n${steps([
          "Open **Workspace → Forms** (or Templates) and tap **Create form**.",
          "Pick a form type (checklist, table, questionnaire, etc.) — this sets the starting layout.",
          "Tap **Create with AI**, describe what you need (rows, columns, signatures, photos), or build manually.",
          "If using AI: answer any follow-up questions, then review the generated fields in the builder.",
          "Rename the form, assign a **category**, tweak fields, then tap **Save form**.",
          "The form appears on your workspace — staff can open it and submit.",
        ])}\n\nTip: For table forms, mention column names in your AI prompt (e.g. *Date | Temp °C | Initials*).`,
        actions: [
          { type: "navigate", label: "Open form builder", href: `/${tenantSlug}/templates/new` },
        ],
        suggestions: ["How do I add a category?", "How do I export a PDF?", "How do staff submit a form?"],
      };
    },
  },
  {
    triggers: [
      /how (do|can|should) i (add|create|make).*(categor)/i,
      /step.*categor/i,
      /organize.*forms/i,
    ],
    build: ({ tenantSlug, caps }) => {
      if (!caps.canManageCategories) {
        return {
          message: "Only **managers and admins** can manage categories.",
          actions: [],
        };
      }
      return {
        message: `**Add a category — step by step**\n\n${steps([
          "Go to **Categories** from the workspace menu.",
          "Tap **Add category** and enter a clear name (e.g. *Cold storage*, *Cleaning*, *Opening checks*).",
          "Save — the category appears in the list.",
          "When creating or editing a form, pick this category so it groups correctly on the workspace.",
          "Use **Move forms** on the Categories page to reorganise existing templates.",
        ])}`,
        actions: [{ type: "navigate", label: "Open categories", href: `/${tenantSlug}/categories` }],
        suggestions: ["Create a form", "How do I move a form to another category?"],
      };
    },
  },
  {
    triggers: [
      /how (do|can|should) i (add|invite|create).*(staff|user|team|member)/i,
      /step.*staff/i,
    ],
    build: ({ tenantSlug, caps }) => {
      if (!caps.canManageStaff) {
        return {
          message: "Only **brand admins** can add staff. Ask your admin to invite you or add team members.",
          actions: [],
        };
      }
      return {
        message: `**Add a staff member — step by step**\n\n${steps([
          "Open **Settings → Staff**.",
          "Tap **Add staff** and fill in name, email, and a temporary password.",
          "Choose a **role**: Admin (full access), Manager (forms + categories), Auditor (fill & submit), or Viewer (read-only).",
          "Save — they can sign in with that email and password.",
          "Optional: set a **PIN** for quick staff switching on shared tablets.",
        ])}`,
        actions: [
          { type: "navigate", label: "Open staff settings", href: `/${tenantSlug}/settings?focus=staff` },
        ],
        suggestions: ["What do the roles mean?", "How do I create a form?"],
      };
    },
  },
  {
    triggers: [
      /how (do|can|should) i (fill|submit|complete).*(form|checklist|audit)/i,
      /step.*submit/i,
      /staff.*fill/i,
    ],
    build: ({ tenantSlug }) => ({
      message: `**Fill and submit a form — step by step**\n\n${steps([
        "Open **Workspace** and find the form under its category (or search).",
        "Tap the form card to open it.",
        "Complete each field — required ones are marked. Add photos where evidence is needed.",
        "Review entries, then tap **Submit** (not just Save draft).",
        "After submit, the form appears under **Saved forms** with a timestamp.",
        "Managers can open the report and **Download PDF** for records.",
      ])}`,
      actions: [
        {
          type: "navigate",
          label: "Open workspace",
          href: `/workspace/forms?tenantSlug=${encodeURIComponent(tenantSlug)}`,
        },
        { type: "navigate", label: "Saved forms", href: `/${tenantSlug}/audits` },
      ],
      suggestions: ["How do I export PDF?", "Where are saved forms?"],
    }),
  },
  {
    triggers: [
      /how (do|can|should) i (export|download|print|pdf)/i,
      /step.*pdf/i,
      /get a pdf/i,
    ],
    build: ({ tenantSlug }) => ({
      message: `**Export a PDF — step by step**\n\n${steps([
        "Go to **Saved forms** and open the submission you need.",
        "On the report page, tap **Download PDF**.",
        "For wide table forms, choose **Landscape** — columns auto-shrink so nothing is clipped.",
        "Save or share the PDF from your device.",
      ])}\n\nTip: If text looks small, the form may have many columns — consider splitting into two table sections in the builder.`,
      actions: [{ type: "navigate", label: "Saved forms", href: `/${tenantSlug}/audits` }],
      suggestions: ["Create a table form", "How do I share a form without PDF?"],
    }),
  },
  {
    triggers: [
      /how (do|can|should) i (share|send).*(form|report|submission)/i,
      /share.*saved/i,
      /link.*form/i,
    ],
    build: ({ tenantSlug }) => ({
      message: `**Share saved forms — step by step**\n\n${steps([
        "Open **Saved forms**.",
        "Tap **Select** (share mode), tick the submissions you want.",
        "Use **Share link** to generate a read-only link — no PDF export needed.",
        "Recipients open the link in a browser to view the reports.",
      ])}`,
      actions: [{ type: "navigate", label: "Saved forms", href: `/${tenantSlug}/audits` }],
      suggestions: ["How do I export PDF?", "Where is the workspace?"],
    }),
  },
  {
    triggers: [
      /how (do|can|should) i (edit|change|update).*(form|template)/i,
      /step.*edit.*form/i,
      /hide.*field/i,
    ],
    build: ({ tenantSlug, caps }) => {
      if (!caps.canCreateForms) {
        return { message: "Form editing needs manager or admin access.", actions: [] };
      }
      return {
        message: `**Edit an existing form — step by step**\n\n${steps([
          "Go to **Templates** (or Workspace → manage forms).",
          "Find the form and tap **Edit**.",
          "Change title, fields, or table columns in the builder.",
          "If the form already has submissions, existing fields **cannot be deleted** — hide them instead (compliance).",
          "Save — a new version is created; old submissions stay linked to their original layout.",
        ])}`,
        actions: [{ type: "navigate", label: "Templates", href: `/${tenantSlug}/templates` }],
        suggestions: ["Create a new form", "How do I add a category?"],
      };
    },
  },
  {
    triggers: [
      /how (do|can|should) i (use|work with).*(ai|create with ai)/i,
      /ai form.*how/i,
      /describe.*form.*ai/i,
    ],
    build: ({ tenantSlug, caps }) => {
      if (!caps.canCreateForms) {
        return { message: "AI form creation needs manager or admin access.", actions: [] };
      }
      return {
        message: `**Create with AI — step by step**\n\n${steps([
          "Open the **form builder** (Create form) — AI needs an internet connection.",
          "Tap **Create with AI** (not the DC chat button — that's for navigation elsewhere).",
          "Describe the form: type, number of rows, column names, signatures, photo fields.",
          "Optional: attach a photo of a paper form — AI reads the layout.",
          "Answer any clarifying questions, then review and edit the draft.",
          "Save the form when you're happy — each generation uses one monthly AI credit.",
        ])}\n\nExample prompt: *Daily fridge temperature log — 12 rows, columns: Date, Unit, Temp °C, Corrective action, Initials, Signature*`,
        actions: [
          { type: "navigate", label: "Open form builder", href: `/${tenantSlug}/templates/new` },
        ],
        suggestions: ["How do I create a checklist?", "How many AI credits do I have?"],
      };
    },
  },
  {
    triggers: [
      /role/i,
      /permission/i,
      /what can (a )?manager/i,
      /what can (an )?admin/i,
    ],
    build: () => ({
      message: `**Roles at a glance**\n\n${steps([
        "**Admin** — staff, all settings, delete forms & submissions, full control.",
        "**Manager** — create/edit forms, categories, view settings & activity, delete submissions.",
        "**Auditor** — fill in and submit forms; view saved forms.",
        "**Viewer** — read-only access to saved forms and reports.",
      ])}\n\nNeed a higher role? Ask your brand admin under Settings → Staff.`,
      actions: [],
      suggestions: ["Add a staff member", "Create a form"],
    }),
  },
];

const HOW_TO_PATTERN = /how (do|can|should|to)|step by step|walk me through|explain how|show me how|what('s| is) the process/i;

export function resolvePlaybook(message: string, ctx: PlaybookContext): CopilotResponse | null {
  const trimmed = message.trim();
  if (!trimmed) return null;

  const looksHowTo = HOW_TO_PATTERN.test(trimmed);
  if (!looksHowTo) return null;

  for (const playbook of PLAYBOOKS) {
    if (playbook.triggers.some((p) => p.test(trimmed))) {
      return playbook.build(ctx);
    }
  }

  return null;
}

export function playbookSuggestions(caps: CopilotCapabilities): string[] {
  const items = ["How do I create a form?", "How do I export a PDF?", "Where are saved forms?"];
  if (caps.canManageCategories) items.push("How do I add a category?");
  if (caps.canManageStaff) items.push("How do I add staff?");
  return items.slice(0, 4);
}
