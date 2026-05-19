"use client";

import { useEffect } from "react";

const THEME_STORAGE_KEY = "iso-theme-v1";

export function ThemeBootstrap() {
  useEffect(() => {
    try {
      const value = localStorage.getItem(THEME_STORAGE_KEY) || "hse-pro";
      document.documentElement.setAttribute("data-theme", value);
      document.documentElement.style.colorScheme = "light";
    } catch {
      // ignore theme bootstrap failures
    }
  }, []);

  return null;
}