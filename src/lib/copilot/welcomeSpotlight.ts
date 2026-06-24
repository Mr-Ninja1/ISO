import type { CopilotCapabilities } from "@/lib/copilot/intents";
import { DC_AI_NAME } from "@/lib/ai/deepControl";

export type SpotlightAction = {
  id: string;
  label: string;
  description: string;
  href?: string;
  prompt?: string;
};

export type SpotlightWelcome = {
  title: string;
  subtitle: string;
  pitch: string;
  actions: SpotlightAction[];
};

function workspaceHref(tenantSlug: string) {
  return `/workspace/forms?tenantSlug=${encodeURIComponent(tenantSlug)}`;
}

function auditsHref(tenantSlug: string) {
  return `/${tenantSlug}/audits`;
}

/** Role-aware quick actions for the first-run spotlight (max 4). */
export function buildSpotlightWelcome(opts: {
  tenantSlug: string;
  pathname: string;
  caps: CopilotCapabilities;
  brandName?: string;
}): SpotlightWelcome {
  const { tenantSlug, pathname, caps, brandName } = opts;
  const brand = brandName?.trim() || "your brand";
  const onWorkspace = pathname.includes("/workspace");
  const onDashboard = pathname.includes("/dashboard");

  const pool: SpotlightAction[] = [];

  pool.push({
    id: "fill-form",
    label: "Fill a form",
    description: "Open live checklists and inspections",
    href: workspaceHref(tenantSlug),
  });

  pool.push({
    id: "saved-forms",
    label: "Saved submissions",
    description: "Review completed HSE records",
    href: auditsHref(tenantSlug),
  });

  if (caps.canCreateForms) {
    pool.push({
      id: "ai-form",
      label: "Create with AI",
      description: "Describe a checklist — I'll guide you",
      href: `/${tenantSlug}/templates/new`,
      prompt: "Walk me through creating a form with AI step by step",
    });
  }

  if (caps.canAccessSettings) {
    pool.push({
      id: "dashboard",
      label: "HSE dashboard",
      description: "Submissions, trends, and compliance",
      href: `/${tenantSlug}/dashboard`,
    });
    pool.push({
      id: "hse-console",
      label: "HSE console tour",
      description: "Staff, settings, activity & more",
      prompt: "Give me a quick tour of everything I can do in the HSE console",
      href: onWorkspace ? `/workspace?tenantSlug=${encodeURIComponent(tenantSlug)}` : undefined,
    });
  }

  if (caps.canManageCategories) {
    pool.push({
      id: "categories",
      label: "Organise categories",
      description: "Group forms on the workspace",
      href: `/${tenantSlug}/categories`,
    });
  }

  if (caps.canManageStaff) {
    pool.push({
      id: "staff",
      label: "Invite staff",
      description: "Add auditors and managers",
      href: `/${tenantSlug}/settings?focus=staff`,
    });
  }

  pool.push({
    id: "offline",
    label: "Offline & mobile",
    description: "Field work without signal",
    prompt: "How does offline mode and the Android app work?",
  });

  pool.push({
    id: "capabilities",
    label: "What can I do?",
    description: "Personalised guide for your role",
    prompt: "What are all the things I can do in ISO Grid with my current permissions?",
  });

  // De-dupe by id and cap at 4, prioritising role-specific actions first
  const priority = [
    "ai-form",
    "hse-console",
    "dashboard",
    "fill-form",
    "saved-forms",
    "staff",
    "categories",
    "offline",
    "capabilities",
  ];

  const byId = new Map(pool.map((a) => [a.id, a]));
  const actions: SpotlightAction[] = [];
  for (const id of priority) {
    const action = byId.get(id);
    if (!action) continue;
    actions.push(action);
    if (actions.length >= 4) break;
  }

  let title = `Meet ${DC_AI_NAME}`;
  let subtitle = `Your guide to ${brand}`;
  let pitch =
    "I know ISO Grid inside out — forms, inspections, PDF export, staff, categories, offline sync, and more. Pick a shortcut or ask me anything.";

  if (onWorkspace && caps.canAccessSettings) {
    title = `Welcome to ${brand}`;
    subtitle = `${DC_AI_NAME} · HSE workspace guide`;
    pitch =
      "You're in the command centre. I can walk you through the HSE console, create AI-powered forms, or jump straight to field inspections.";
  } else if (onWorkspace) {
    title = `Ready to inspect`;
    subtitle = `${DC_AI_NAME} for ${brand}`;
    pitch =
      "Open a checklist, resume a draft, or find what you submitted — I'll take you there in one tap.";
  } else if (onDashboard) {
    title = `Compliance at a glance`;
    subtitle = `${DC_AI_NAME} · ${brand}`;
    pitch =
      "Ask about today's submissions, trends, or where to manage templates and corrective actions.";
  }

  return { title, subtitle, pitch, actions };
}
