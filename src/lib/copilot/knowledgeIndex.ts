import type { CopilotCapabilities } from "@/lib/copilot/intents";

/**
 * Searchable product documentation for ISO Grid AI.
 * Add a chunk when you ship a feature — retrieval picks the top matches per question.
 */
export type KnowledgeChunk = {
  id: string;
  title: string;
  /** Grep targets — words users might say */
  tags: string[];
  body: string;
  hrefs?: Array<{ label: string; href: string }>;
  /** Hide unless user has this capability */
  requires?: keyof CopilotCapabilities;
};

function h(label: string, path: string) {
  return { label, href: path };
}

/** Paths use {tenantSlug} — replaced at runtime */
export const COPILOT_KNOWLEDGE_CHUNKS: KnowledgeChunk[] = [
  {
    id: "workspace-overview",
    title: "Workspace & field inspections",
    tags: ["workspace", "forms", "field", "inspection", "fill", "open form", "categories"],
    body: "The **field workspace** lists live forms by category. Staff search, open a form, complete fields, and **Submit**. Path: /workspace/forms?tenantSlug={tenantSlug}. HSE managers also have a **workspace home** with the HSE console at /workspace?tenantSlug={tenantSlug}.",
    hrefs: [h("Open forms workspace", "/workspace/forms?tenantSlug={tenantSlug}")],
  },
  {
    id: "hse-console",
    title: "HSE console (managers/admins)",
    tags: ["hse", "console", "admin", "manager", "control panel", "home"],
    requires: "canAccessSettings",
    body: "The **HSE console** on workspace home shows shortcuts: View forms (saved submissions), Activity monitor, Brand settings, Admin dashboard, Staff management, and Open forms workspace.",
    hrefs: [h("HSE console", "/workspace?tenantSlug={tenantSlug}")],
  },
  {
    id: "cache-stale",
    title: "Stale UI / workspace cache",
    tags: [
      "cache",
      "stale",
      "not showing",
      "missing",
      "refresh",
      "out of date",
      "old data",
      "cannot see",
      "can't see",
      "invisible",
      "sync",
    ],
    body: "ISO Grid caches workspace data in the browser (localStorage) for speed and offline use. After creating a form or category, the list may lag. Fix: (1) add ?refresh=1 to the workspace URL, (2) confirm the form has a **category**, (3) check Settings → Template management, (4) **sign out and sign in**, (5) hard refresh (Ctrl+Shift+R), (6) on Android force-close the app.",
    hrefs: [h("Refresh workspace", "/workspace/forms?tenantSlug={tenantSlug}&refresh=1")],
  },
  {
    id: "create-category",
    title: "Create a category",
    tags: ["create", "add", "new", "category", "categories", "group", "organize"],
    requires: "canManageCategories",
    body: "Go to **Categories** → **Add category** → enter a name → Save. When creating/editing a form, assign this category so it appears grouped on the workspace. Use **Move forms** on the Categories page to reorganise.",
    hrefs: [h("Categories", "/{tenantSlug}/categories")],
  },
  {
    id: "delete-category",
    title: "Delete a category",
    tags: ["delete", "remove", "category", "categories"],
    requires: "canManageCategories",
    body: "Open **Categories** → **Delete** on the category (move forms out first if needed). Managers and admins only. After delete, refresh workspace if the UI looks stale (?refresh=1).",
    hrefs: [h("Categories", "/{tenantSlug}/categories")],
  },
  {
    id: "create-form",
    title: "Create a form / template",
    tags: ["create", "new", "form", "template", "builder", "checklist", "design"],
    requires: "canCreateForms",
    body: "Open **Create form** (/templates/new). Pick a form type, use **Create with AI** or build manually, assign a **category**, then **Save**. The form appears on the workspace. AI builder uses monthly credits; ISO Grid AI chat does not.",
    hrefs: [
      h("Form builder", "/{tenantSlug}/templates/new"),
      h("Templates", "/{tenantSlug}/templates"),
    ],
  },
  {
    id: "delete-form",
    title: "Delete a form (template)",
    tags: ["delete", "remove", "form", "template"],
    requires: "canCreateForms",
    body: "**Admins only** can delete forms, and only if there are **no submissions**. Settings → **Template management** → Delete. If submissions exist, deletion is blocked — hide fields in the builder instead (compliance).",
    hrefs: [h("Settings", "/{tenantSlug}/settings"), h("Templates", "/{tenantSlug}/templates")],
  },
  {
    id: "edit-form",
    title: "Edit a form",
    tags: ["edit", "update", "change", "form", "template", "hide field"],
    requires: "canCreateForms",
    body: "Templates → **Edit** on a form. Submitted forms are immutable — you cannot delete fields that have data; **hide** them instead. Saving creates a new version; old submissions keep their layout.",
    hrefs: [h("Templates", "/{tenantSlug}/templates")],
  },
  {
    id: "ai-form-builder",
    title: "Create with AI (form builder)",
    tags: ["ai", "gemini", "generate", "describe", "photo", "ocr", "import", "paper"],
    requires: "canCreateForms",
    body: "In the **form builder**, tap **Create with AI** (not the ISO Grid AI chat button). Describe rows/columns/signatures/photos or attach a picture of a paper form. Answer follow-ups, review fields, save. Uses **monthly AI credits** (Settings → Plan & usage). Needs internet.",
    hrefs: [h("Form builder", "/{tenantSlug}/templates/new")],
  },
  {
    id: "fill-submit",
    title: "Fill and submit a form",
    tags: ["fill", "submit", "complete", "inspection", "audit", "draft", "save"],
    body: "Workspace → open form → complete fields → tap **Submit** (not only Save draft). Submitted records appear in **Saved forms** with a timestamp. Drafts can sync offline; submit when online if possible.",
    hrefs: [h("Workspace", "/workspace/forms?tenantSlug={tenantSlug}")],
  },
  {
    id: "saved-forms",
    title: "Saved forms / submissions",
    tags: ["saved", "submitted", "submission", "audit", "audits", "records", "history", "reports"],
    body: "**Saved forms** hold completed submissions. Open a record for details, **Download PDF**, or use **Select mode** to share or bulk-delete (managers/admins).",
    hrefs: [h("Saved forms", "/{tenantSlug}/audits")],
  },
  {
    id: "delete-submission",
    title: "Delete saved submissions",
    tags: ["delete", "remove", "submission", "saved", "bulk", "storage"],
    requires: "canAccessSettings",
    body: "Managers/admins: **Saved forms** → **Select** → tick items → **Delete**. Frees storage on limited plans.",
    hrefs: [h("Saved forms", "/{tenantSlug}/audits")],
  },
  {
    id: "pdf-export",
    title: "Export PDF",
    tags: ["pdf", "export", "download", "print", "landscape", "table"],
    body: "Saved forms → open submission → **Download PDF**. Use **landscape** for wide tables (up to ~8 columns auto-shrink).",
    hrefs: [h("Saved forms", "/{tenantSlug}/audits")],
  },
  {
    id: "share-link",
    title: "Share submissions (read-only link)",
    tags: ["share", "link", "send", "read-only", "without pdf"],
    body: "Saved forms → **Select** → tick submissions → **Share link**. Recipients open a read-only browser view (no login). Links can expire or be disabled.",
    hrefs: [h("Saved forms", "/{tenantSlug}/audits")],
  },
  {
    id: "staff-add",
    title: "Add staff",
    tags: ["staff", "invite", "add user", "team", "member", "employee"],
    requires: "canManageStaff",
    body: "Settings → **Staff** → Add staff: name, email, temporary password, **role** (Admin/Manager/Auditor/Viewer). Optional **PIN** for shared tablets.",
    hrefs: [h("Staff settings", "/{tenantSlug}/settings?focus=staff")],
  },
  {
    id: "staff-pin",
    title: "Staff PIN (shared tablets)",
    tags: ["pin", "shared", "tablet", "switch", "profile", "logged in staff"],
    requires: "canManageStaff",
    body: "Admins set optional **PIN** per staff member in Settings → Staff. Field teams on one device switch profile without full sign-out.",
    hrefs: [h("Staff settings", "/{tenantSlug}/settings?focus=staff")],
  },
  {
    id: "roles",
    title: "Roles & permissions",
    tags: ["role", "permission", "admin", "manager", "auditor", "viewer", "access"],
    body: "**Admin** — all access, delete forms/submissions, staff. **Manager** — create forms/categories, settings, activity, delete submissions. **Auditor** — fill & submit, view saved. **Viewer** — read-only saved forms.",
  },
  {
    id: "password-reset",
    title: "Change / reset password",
    tags: ["password", "reset", "forgot", "credentials", "login"],
    body: "Use **Forgot password** on the login screen. ISO Grid AI cannot reset passwords from chat. After reset, sign in with the new password.",
    hrefs: [h("Forgot password", "/forgot-password")],
  },
  {
    id: "email-change",
    title: "Change login email",
    tags: ["email", "change email", "wrong email", "credentials", "account"],
    body: "Login email is updated by a **brand admin** under Settings → Staff. There is no self-service email change in the app today.",
    hrefs: [h("Staff settings", "/{tenantSlug}/settings?focus=staff")],
  },
  {
    id: "signup-verify",
    title: "Sign up & email verification",
    tags: ["signup", "sign up", "register", "verify", "email", "confirm"],
    body: "Create account at /signup → verify email via link → sign in at /login. If email not confirmed, use **Verify email** on the login page.",
    hrefs: [h("Sign up", "/signup"), h("Login", "/login")],
  },
  {
    id: "activity-log",
    title: "Activity log",
    tags: ["activity", "log", "logs", "audit trail", "who", "history", "today", "system"],
    requires: "canAccessSettings",
    body: "**Activity log** (managers/admins) records brand actions: forms created/updated, submissions, staff changes, categories. Not every browser login — **staff PIN** switches may log as auth.login. Open Activity for full detail.",
    hrefs: [
      h("Activity log", "/{tenantSlug}/activity"),
      h("Dashboard", "/{tenantSlug}/dashboard"),
    ],
  },
  {
    id: "dashboard",
    title: "Admin dashboard",
    tags: ["dashboard", "metrics", "compliance", "submissions", "trends", "alerts"],
    requires: "canAccessSettings",
    body: "Dashboard shows submission counts, drafts, temperature alerts, staff activity, and compliance metrics. Requires internet (not in offline cache).",
    hrefs: [h("Dashboard", "/{tenantSlug}/dashboard")],
  },
  {
    id: "corrective-actions",
    title: "Corrective actions",
    tags: ["corrective", "action", "follow-up", "followup", "issue", "nonconformance"],
    requires: "canAccessSettings",
    body: "Track inspection follow-ups with owners, due dates, and status. Managers/admins open the corrective actions board from the HSE console or nav.",
    hrefs: [h("Corrective actions", "/{tenantSlug}/corrective-actions")],
  },
  {
    id: "settings-usage",
    title: "Plan, storage & AI credits",
    tags: ["plan", "usage", "storage", "quota", "limit", "upgrade", "credits", "trial"],
    requires: "canAccessSettings",
    body: "Settings → **Plan & usage**: storage used/limit, monthly **AI form credits**, ISO Grid AI trial status. Contact platform developer to upgrade.",
    hrefs: [h("Plan & usage", "/{tenantSlug}/settings?focus=usage")],
  },
  {
    id: "settings-brand",
    title: "Brand settings",
    tags: ["settings", "logo", "brand", "profile", "name"],
    requires: "canAccessSettings",
    body: "Settings: brand **name** and **logo**, staff, template management, categories seed, plan usage. Live-sync features need internet.",
    hrefs: [h("Settings", "/{tenantSlug}/settings")],
  },
  {
    id: "template-library",
    title: "Template library",
    tags: ["library", "import", "starter", "template library"],
    requires: "canCreateForms",
    body: "Import ready-made HSE forms from the **Template library**, then customise in the builder.",
    hrefs: [h("Template library", "/{tenantSlug}/templates/library")],
  },
  {
    id: "offline-android",
    title: "Offline mode & Android app",
    tags: ["offline", "android", "apk", "app", "sync", "field", "no internet"],
    body: "Android app (APK from login link) works **offline** for drafts and workspace. Submit syncs when online. Admin screens need internet once to load. Web caches workspace locally — use ?refresh=1 if stale.",
    hrefs: [h("Login / download app", "/login")],
  },
  {
    id: "messages-inbox",
    title: "Messages & announcements",
    tags: ["message", "inbox", "announcement", "bell", "alert", "notification"],
    body: "Workspace header **bell** = brand message inbox. Push notifications on Android where enabled. Due **reminders** fire per form rules when configured.",
    hrefs: [h("Workspace", "/workspace?tenantSlug={tenantSlug}")],
  },
  {
    id: "multi-brand",
    title: "Multiple brands",
    tags: ["brand", "switch", "choose", "tenant", "organisation"],
    body: "Users in multiple brands see **Choose a Brand** at /workspace. lastTenantSlug is remembered in the browser.",
    hrefs: [h("Choose brand", "/workspace")],
  },
  {
    id: "deep-control-vs-ai",
    title: "ISO Grid AI vs Create with AI",
    tags: ["deep control", "dc", "copilot", "chat", "assistant", "difference"],
    body: "**ISO Grid AI** (assistant chat) = navigation and how-to for the app. **Create with AI** = inside the form builder only; drafts form layouts and uses monthly credits.",
  },
  {
    id: "form-field-types",
    title: "Form field types",
    tags: ["field", "text", "number", "signature", "photo", "temperature", "table", "dropdown", "checkbox"],
    requires: "canCreateForms",
    body: "Builder supports: text, number, yes/no, dropdown, checkbox, date/time, temperature, signature, photo evidence, table sections (rows × columns), display-only instructions.",
    hrefs: [h("Form builder", "/{tenantSlug}/templates/new")],
  },
  {
    id: "temperature-alerts",
    title: "Temperature alerts",
    tags: ["temperature", "temp", "fridge", "haccp", "alert", "cold"],
    requires: "canAccessSettings",
    body: "Templates with temperature fields can set **alert above/below** thresholds. Dashboard flags breaches. Common for fridge logs.",
    hrefs: [h("Dashboard", "/{tenantSlug}/dashboard")],
  },
  {
    id: "deactivated-brand",
    title: "Brand deactivated",
    tags: ["deactivated", "suspended", "blocked", "cannot access"],
    body: "If a brand is deactivated by the platform developer, workspace shows a deactivation screen. Contact your platform developer or support — not fixable from ISO Grid AI chat.",
  },
  {
    id: "unknown-fallback",
    title: "When unsure",
    tags: ["help", "support", "don't know", "unknown"],
    body: "If the answer is not in ISO Grid docs: say honestly, suggest the closest screen, try cache refresh for data issues, and recommend contacting the brand admin or platform support.",
  },
];
