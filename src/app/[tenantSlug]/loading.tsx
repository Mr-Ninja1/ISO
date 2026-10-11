/**
 * Avoid skeleton flashes on tenant route changes.
 * Cache-first clients paint immediately; a pulse placeholder made online nav feel slower
 * than offline even when data was already local.
 */
export default function TenantLoading() {
  return null;
}
