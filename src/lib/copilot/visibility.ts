/** When to show Deep Control navigation chat (not form-builder Gemini AI). */
export function shouldShowBrandCopilot(pathname: string, offline: boolean): boolean {
  if (offline) return false;
  if (pathname.includes("/templates/new")) return false;
  return true;
}
