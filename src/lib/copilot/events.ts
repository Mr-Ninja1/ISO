export const COPILOT_OPEN_EVENT = "iso-copilot-open";

export function openBrandCopilot() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(COPILOT_OPEN_EVENT));
}
