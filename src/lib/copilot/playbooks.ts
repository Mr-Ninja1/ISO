import type { CopilotAction, CopilotCapabilities, CopilotResponse } from "@/lib/copilot/intents";
import type { CopilotLiveSnapshot } from "@/lib/copilot/fetchLiveSnapshot";
import { DC_AI_NAME } from "@/lib/ai/deepControl";

export type PlaybookContext = {
  tenantSlug: string;
  pathname: string;
  caps: CopilotCapabilities;
  live?: CopilotLiveSnapshot | null;
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
  {
    triggers: [
      /how (do|can|should) i (delete|remove).*(categor)/i,
      /delete.*categor/i,
      /remove.*categor/i,
    ],
    build: ({ tenantSlug, caps }) => {
      if (!caps.canManageCategories) {
        return {
          message: "Only **managers and admins** can delete categories.",
          actions: [],
        };
      }
      return {
        message: `**Delete a category — step by step**\n\n${steps([
          "Open **Categories** from the workspace menu or HSE console.",
          "Move any forms out of the category first if you still need them (use **Move forms**).",
          "Tap **Delete** on the category and confirm.",
          "If the workspace still looks wrong, refresh with **?refresh=1** on the workspace URL or sign out and back in.",
        ])}`,
        actions: [{ type: "navigate", label: "Open categories", href: `/${tenantSlug}/categories` }],
        suggestions: ["How do I add a category?", "My new form is not showing"],
      };
    },
  },
  {
    triggers: [
      /how (do|can|should) i (delete|remove).*(form|template)/i,
      /delete.*(form|template)/i,
      /remove.*(form|template)/i,
    ],
    build: ({ tenantSlug, caps }) => {
      if (!caps.canCreateForms) {
        return {
          message: "Deleting forms is restricted to **admins** (forms with no submissions only). Ask your brand admin.",
          actions: [],
        };
      }
      return {
        message: `**Delete a form (template) — step by step**\n\n${steps([
          "Only **admins** can delete forms, and only if there are **no submissions** yet.",
          "Open **Settings → Template management** (or **Templates**).",
          "Find the form and tap **Delete**, then confirm.",
          "If the form has saved submissions, deletion is blocked — hide fields in the builder instead.",
          "After deleting, refresh the workspace (?refresh=1) if the card still appears.",
        ])}`,
        actions: [
          { type: "navigate", label: "Template management", href: `/${tenantSlug}/settings` },
          { type: "navigate", label: "Templates", href: `/${tenantSlug}/templates` },
        ],
        suggestions: ["How do I hide a field?", "Delete a saved submission"],
      };
    },
  },
  {
    triggers: [
      /(change|update|reset).*(password|credentials)/i,
      /forgot.*password/i,
      /new password/i,
    ],
    build: () => ({
      message: `**Change your password**\n\n${steps([
        "Sign out if you are still logged in.",
        "On the login page, tap **Forgot password**.",
        "Enter your email — you will receive a reset link (check spam).",
        "Open the link and set a new password, then sign in again.",
      ])}\n\n${DC_AI_NAME} cannot change passwords from chat.`,
      actions: [{ type: "navigate", label: "Forgot password", href: "/forgot-password" }],
      suggestions: ["How do I change my email?", "Verify my email"],
    }),
  },
  {
    triggers: [/(change|update).*(email)/i, /wrong email/i, /login email/i],
    build: ({ tenantSlug, caps }) => ({
      message: `**Change login email**\n\n${steps([
        "Your sign-in email is managed by your **brand admin** — there is no self-service email change in the app today.",
        "Ask an admin to open **Settings → Staff**, find your user, and update the email.",
        "Admins can also set a temporary password when inviting staff.",
        "For your own admin account, use the same Staff section or contact platform support.",
      ])}`,
      actions: caps.canManageStaff
        ? [{ type: "navigate", label: "Staff settings", href: `/${tenantSlug}/settings?focus=staff` }]
        : [],
      suggestions: ["Forgot password", "Add a staff member"],
    }),
  },
  {
    triggers: [
      /(not showing|don't see|cannot see|can't see|missing|stale|out of date|old data|cache|refresh)/i,
      /created.*(form|category).*(not|doesn't|don't)/i,
      /form.*(not appear|not visible|nowhere)/i,
    ],
    build: ({ tenantSlug, live }) => {
      const dbHint = live
        ? `\n\n**Live check:** this brand currently has **${live.templateCount}** form(s) and **${live.categoryCount}** categor${live.categoryCount === 1 ? "y" : "ies"} in the database.${
            live.recentTemplateTitles.length
              ? ` Latest updates: ${live.recentTemplateTitles.slice(0, 3).join(", ")}.`
              : ""
          }`
        : "";

      return {
        message: `**Form or category not showing?** This is usually **workspace cache** — the app keeps a snapshot for speed and offline use.${dbHint}\n\n${steps([
          "Open the workspace with a forced refresh: add **?refresh=1** to the URL.",
          "Confirm the form is assigned to a **category** (Settings → Templates or Categories).",
          "Try **sign out and sign in** again.",
          "Hard-refresh the browser (Ctrl+Shift+R) or clear site data once.",
          "On Android: force-close the app and reopen.",
        ])}`,
        actions: [
          {
            type: "navigate",
            label: "Refresh workspace",
            href: `/workspace/forms?tenantSlug=${encodeURIComponent(tenantSlug)}&refresh=1`,
          },
          { type: "navigate", label: "Categories", href: `/${tenantSlug}/categories` },
        ],
        suggestions: ["How do I create a category?", "How do I create a form?"],
      };
    },
  },
];

const HOW_TO_PATTERN = /how (do|can|should|to)|step by step|walk me through|explain how|show me how|what('s| is) the process/i;

/** Playbooks that should run without "how do I" phrasing */
const DIRECT_PLAYBOOK_PATTERN =
  /(not showing|don't see|cannot see|can't see|missing|stale|out of date|cache|forgot.*password|delete.*(categor|form|template)|remove.*(categor|form|template)|(change|update).*(password|email))/i;

export function resolvePlaybook(message: string, ctx: PlaybookContext): CopilotResponse | null {
  const trimmed = message.trim();
  if (!trimmed) return null;

  const looksHowTo = HOW_TO_PATTERN.test(trimmed);
  const directPlaybook = DIRECT_PLAYBOOK_PATTERN.test(trimmed);
  if (!looksHowTo && !directPlaybook) return null;

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
