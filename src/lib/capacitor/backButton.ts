"use client";

import { isCapacitorNativeApp } from "@/lib/capacitor/runtime";

let unsubscribeBackButton: (() => void) | null = null;
let navigationStack: string[] = [];

/**
 * Initialize Capacitor back button handler.
 * When back button is pressed, tries to go back in history first.
 * Only exits app if there's nowhere left to go.
 */
export function initCapacitorBackButton() {
  if (typeof window === "undefined") return;
  if (!isCapacitorNativeApp()) return;

  // Dynamically import Capacitor App plugin
  import("@capacitor/app").then(({ App }) => {
    if (!App) return;

    void App.addListener("backButton", () => {
      if (navigationStack.length > 1) {
        navigationStack.pop();
        window.history.back();
      } else {
        App.minimizeApp();
      }
    }).then((handle) => {
      unsubscribeBackButton = () => {
        void handle.remove();
      };
    });
  }).catch(() => {
    // Capacitor not available, ignore
  });
}

/**
 * Track page navigation for back button handler.
 * Call this whenever the page/route changes.
 */
export function trackPageNavigation(path: string) {
  if (!isCapacitorNativeApp()) return;
  if (navigationStack.length === 0 || navigationStack[navigationStack.length - 1] !== path) {
    navigationStack.push(path);
  }
}

/**
 * Cleanup back button handler (call on unmount if needed).
 */
export function cleanupCapacitorBackButton() {
  if (unsubscribeBackButton) {
    unsubscribeBackButton();
    unsubscribeBackButton = null;
  }
  navigationStack = [];
}
