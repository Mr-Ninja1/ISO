export const WORKSPACE_THEMES = ["mint-soft", "lavender", "rose", "hacker", "hse-pro", "warm-paper"] as const;

export type WorkspaceTheme = (typeof WORKSPACE_THEMES)[number];

const LEGACY_THEME_MAP: Record<string, WorkspaceTheme> = {
  default: "mint-soft",
  "slate-soft": "mint-soft",
  "ota-lavender": "lavender",
  spotify: "hacker",
};

export function normalizeWorkspaceTheme(stored: string | null | undefined): WorkspaceTheme | null {
  if (!stored) return null;
  if (LEGACY_THEME_MAP[stored]) return LEGACY_THEME_MAP[stored];
  if ((WORKSPACE_THEMES as readonly string[]).includes(stored)) return stored as WorkspaceTheme;
  return null;
}

export function applyWorkspaceThemeToDocument(theme: WorkspaceTheme) {
  const root = document.documentElement;
  if (theme === "hse-pro") {
    root.setAttribute("data-theme", "hse-pro");
    root.style.colorScheme = "light";
  } else {
    root.setAttribute("data-theme", theme);
    root.style.colorScheme = theme === "hacker" ? "dark" : "light";
  }
}
