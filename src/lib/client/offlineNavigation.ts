/** Routes that work from local cache without a live API round-trip. */
const OFFLINE_SAFE_PATH_PATTERNS: RegExp[] = [
  /^\/login\/?$/,
  /^\/offline\/?$/,
  /^\/workspace\/?$/,
  /^\/workspace\/forms\/?$/,
  /^\/workspace\/training\/?$/,
  /^\/_\/audits\/?$/,
  /^\/_\/audits\/local\/?$/,
  /^\/_\/audits\/offline-last\/?$/,
  /^\/_\/audits\/new\/?$/,
  /^\/_\/audits\/[^/]+\/?$/,
  /^\/_\/settings\/?$/,
  /^\/_\/categories\/?$/,
  /^\/_\/templates(\/|$)/,
  /^\/_\/activity\/?$/,
  /^\/_\/dashboard\/?$/,
  /^\/_\/corrective-actions\/?$/,
  /^\/[^/]+\/audits\/?$/,
  /^\/[^/]+\/audits\/local\/?$/,
  /^\/[^/]+\/audits\/offline-last\/?$/,
  /^\/[^/]+\/audits\/new\/?$/,
  /^\/[^/]+\/audits\/[^/]+\/?$/, // report / resume form (cache-backed)
  /^\/[^/]+\/settings\/?$/,
  /^\/[^/]+\/categories\/?$/,
  /^\/[^/]+\/templates(\/|$)/,
  /^\/[^/]+\/activity\/?$/,
  /^\/[^/]+\/dashboard\/?$/,
  /^\/[^/]+\/corrective-actions\/?$/,
];

export function isOfflineSafePath(pathname: string) {
  const path = pathname.split("?")[0].replace(/\/+$/, "") || "/";
  return OFFLINE_SAFE_PATH_PATTERNS.some((pattern) => pattern.test(path));
}

export function defaultOfflineBackHref(tenantSlug?: string | null) {
  if (tenantSlug) {
    return `/workspace?tenantSlug=${encodeURIComponent(tenantSlug)}&view=forms`;
  }
  return "/workspace";
}
