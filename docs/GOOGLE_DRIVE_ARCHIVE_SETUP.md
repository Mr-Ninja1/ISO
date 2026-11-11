# Google Drive form archive setup

Google Drive is an optional, tenant-owned archive for old submitted forms. The active list keeps a compact database index; opening an archived report fetches the JSON record from Drive and verifies its SHA-256 checksum. Drafts are not archived.

## Google OAuth configuration

Create a Google OAuth web client and register this exact redirect URI:

```text
https://<app-host>/api/archive/google/callback
```

Set these server environment variables:

```text
GOOGLE_DRIVE_CLIENT_ID=...
GOOGLE_DRIVE_CLIENT_SECRET=...
GOOGLE_DRIVE_REDIRECT_URI=https://<app-host>/api/archive/google/callback
GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY=<base64 for 32 random bytes>
GOOGLE_DRIVE_STATE_SECRET=<long random secret>
NEXT_PUBLIC_APP_URL=https://<app-host>
```

Generate the encryption key with Node: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Keep all secrets server-side. The app requests `drive.file` plus basic email identity; each tenant's Google refresh token is encrypted with AES-256-GCM before it is stored.

Apply `supabase/migrations/20261110090000_google_drive_audit_archive.sql` before enabling the feature. A tenant admin connects Drive under **Brand Settings → Data archive** and chooses an age from 30 to 3650 days (default 365). The admin can also run **Archive eligible forms now**. Automatic archival runs from the existing `/api/cron/storage-maintenance` endpoint, so configure the existing daily scheduler with `Authorization: Bearer <CRON_SECRET>`.

Each scheduled run processes at most ten eligible forms per tenant. Upload and checksum metadata are verified and the small database manifest is written before the source `audit_logs` row is deleted. Failures leave the source form in place and appear in Settings and the cron response. Reconnecting is required to open Drive archives after disconnecting. Do not delete the configured OAuth client or encryption key while archive connections are active.

This first version archives the submitted form JSON. Photo evidence that is already stored as a Supabase Storage object remains there; evidence referenced by URL is not copied into Drive. The system does not archive templates, drafts, or generated PDFs.
