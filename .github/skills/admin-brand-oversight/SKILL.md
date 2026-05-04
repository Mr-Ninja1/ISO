---
name: admin-brand-oversight
description: "Use when working on the ISO Pro developer console, brand activation/deactivation, live brand alerts, email verification, password reset, or system-wide app oversight."
---

# Developer Console Oversight Skill

Use this skill when editing or extending the system-wide developer console for ISO Pro.

## What Exists

- The normal user login flow stays unchanged at `/login`.
- Approved developers sign in with the same auth flow as everyone else.
- After login, approved developers see a `Developer console` entry from the lobby page at `/dashboard`.
- The admin workspace is separated from brand workspaces:
  - Global developer console: `/admin`
  - Brand workspace: `/{tenantSlug}` and nested brand routes

## Access Rule

- Access to `/admin` and system-level APIs is controlled by an approved email allowlist.
- The allowlist comes from `NEXT_PUBLIC_ADMIN_OVERSIGHT_EMAILS` or `ADMIN_OVERSIGHT_EMAILS`.
- Developer console pages must reject non-approved users with a clear access message.

## Brand Oversight Behavior

- Brands have an `is_active` flag.
- When a brand is inactive, brand users should see a clear message telling them to ask an administrator to activate the brand.
- Deactivated brands must be blocked from normal brand workspace access.
- The developer console can:
  - Activate or deactivate a brand
  - View how long a brand has existed
  - View how many users are attached to the brand
  - Send live alert messages to a specific brand

## Live Brand Messages

- Admin messages are stored server-side in `tenant_announcements`.
- Brand workspaces poll for active alerts and show them as a modal popup.
- Keep the message flow simple: title, body, active flag, and timestamp.
- Supabase email verification and password reset are user-auth flows, not developer-console flows.
- Email sender branding is configured in Supabase Auth/SMTP settings, not in the app UI.
- See `.github/skills/admin-brand-oversight/SUPABASE_EMAIL_BRANDING.md` for the exact Supabase dashboard checklist.

## Auth Work In Scope

- Add email verification flows that are explicit and visible to the user.
- Add password reset flows that are clear, secure, and easy to resume.
- Ensure verification and reset states are reflected in the login and lobby screens.
- Keep auth feedback messages human-readable and tied to the current account state.

## Editing Rules

- Keep admin routes separate from brand routes.
- Use service-role Supabase access only on server routes that truly need it.
- Preserve existing RLS and tenant membership checks.
- Do not hardcode brand data into UI if it belongs in the database.
- When a milestone lands, append a short note to `.github/skills/admin-brand-oversight/PROGRESS.md` so another agent can see the current state immediately.

## Shared Progress Log

- Treat `PROGRESS.md` as the handoff board for parallel work.
- Add one bullet per completed milestone with the file or area touched and a short status note.
- Prefer short factual updates over long summaries.

## Agent-To-Agent Messages

- Use `AGENT_MESSAGES.md` for short messages between agents when working in parallel.
- Before starting a new slice, leave a brief note about the files you plan to touch.
- After finishing a slice, leave a brief note with the result and any follow-up needed.
- Keep each message to 1-3 bullets so another agent can scan it quickly.
- If you change a file another agent is likely to touch, mention it explicitly in the message board.

## Good Targets For Follow-Up Work

- Add search/filter/sort to the admin brand list.
- Add audit logging for activate/deactivate and message sends.
- Add unread-state handling for brand alerts.
- Add a more formal admin landing page if the console grows.
- Add explicit email verification and password reset pages or dialogs.