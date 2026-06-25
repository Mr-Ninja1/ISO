/** Product name for the brand assistant (navigation + guidance). */
export const DC_AI_NAME = "ISO Grid AI";
export const DC_AI_SHORT = "AI";
export const DC_AI_TAGLINE = "Forms · categories · staff · reports";

/** Default seeded in tenant_ai_profiles.assistant_name */
export const DC_AI_PROFILE_NAME = "ISO Grid AI";

export function dcAiDisplayTitle(_brandName?: string | null) {
  return DC_AI_NAME;
}

export function dcAiHeaderSubtitle(brandName?: string | null) {
  if (brandName?.trim()) {
    return `${DC_AI_SHORT} · for ${brandName.trim()}`;
  }
  return `${DC_AI_SHORT} · your brand co-pilot`;
}

export function dcAiHintLabel() {
  return DC_AI_SHORT;
}
