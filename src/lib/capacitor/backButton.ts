"use client";

import { isCapacitorNativeApp } from "@/lib/capacitor/runtime";

export const NAV_STACK_STORAGE_KEY = "iso-nav-stack:v1";

export function buildAppPath(pathname: string, search = "") {
  const path = pathname || "/";
  if (!search || search === "?") return path;
  return search.startsWith("?") ? `${path}${search}` : `${path}?${search}`;
}

/** Sync React route changes into the sessionStorage stack used by hardware back. */
export function recordCapacitorNavigation(path: string) {
  if (typeof window === "undefined" || !isCapacitorNativeApp()) return;
  const recorder = (window as Window & { __ISO_RECORD_NAV__?: (path: string) => void }).__ISO_RECORD_NAV__;
  if (recorder) {
    recorder(path);
    return;
  }

  try {
    const raw = sessionStorage.getItem(NAV_STACK_STORAGE_KEY);
    const stack: string[] = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(stack)) return;

    if (!stack.length) {
      sessionStorage.setItem(NAV_STACK_STORAGE_KEY, JSON.stringify([path]));
      return;
    }
    if (stack[stack.length - 1] === path) return;
    if (stack.length >= 2 && stack[stack.length - 2] === path) {
      stack.pop();
      sessionStorage.setItem(NAV_STACK_STORAGE_KEY, JSON.stringify(stack));
      return;
    }
    stack.push(path);
    sessionStorage.setItem(NAV_STACK_STORAGE_KEY, JSON.stringify(stack));
  } catch {
    // ignore
  }
}

/** In-app navigation stack (pathname + query) for React-only flows. */
export class AppNavigationStack {
  private stack: string[] = [];

  record(path: string) {
    recordCapacitorNavigation(path);
    if (this.stack.length === 0) {
      this.stack = [path];
      return;
    }
    const top = this.stack[this.stack.length - 1];
    if (top === path) return;
    if (this.stack.length >= 2 && this.stack[this.stack.length - 2] === path) {
      this.stack.pop();
      return;
    }
    this.stack.push(path);
  }

  previous(): string | null {
    if (this.stack.length < 2) return null;
    return this.stack[this.stack.length - 2];
  }
}
