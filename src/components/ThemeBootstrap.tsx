"use client";

import { useEffect } from "react";
import {
  applyWorkspaceThemeToDocument,
  normalizeWorkspaceTheme,
} from "@/lib/client/workspaceTheme";

const THEME_STORAGE_KEY = "iso-theme-v1";

export function ThemeBootstrap() {
  useEffect(() => {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      const theme = normalizeWorkspaceTheme(stored) || "mint-soft";
      applyWorkspaceThemeToDocument(theme);
    } catch {
      // ignore theme bootstrap failures
    }
  }, []);

  return null;
}