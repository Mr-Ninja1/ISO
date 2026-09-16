# Customer-Owned Storage and Retention

## Problem

ISO is a multitenant application. Customers may pay a once-off fee while the application owner continues paying the hosting and database costs indefinitely. Customer data must therefore have a bounded storage footprint and a clear lifecycle.

The goal is not to remove the database or make the app offline-only. The goal is to prevent unlimited accumulation of customer records, photos, drafts, logs, and generated artifacts in the application owner's infrastructure.

The application should continue working for the current customer without requiring manual storage management or an open-ended storage commitment from the owner.

## Product Direction

Use a bounded working set in Supabase and make long-term storage customer-controlled where practical.

```text
Supabase
  Recent submissions, templates, permissions, indexes, sync state

Customer-owned storage
  Older submissions, photos, source documents, and optional archive files

Device storage
  Temporary drafts, offline queues, cached templates, and cached reports
```

Google Drive should be considered an optional customer-owned archive destination. It should not replace the relational database used for active form operations, filtering, permissions, reporting, and synchronization.

The customer should be able to continue using the app if Drive is disconnected. In that state, archiving pauses and the tenant receives a clear warning; the app must not silently lose data.

## Current Risks in This Repository

- Submitted audits store the full form payload in `audit_logs`.
- Photo evidence is uploaded to Supabase Storage, but database deletion does not currently guarantee deletion of the related Storage objects.
- If photo upload is unavailable, the original base64 image can remain in the database payload.
- Storage estimation currently focuses on database row sizes and does not represent all bucket object usage.
- The maintenance endpoint only runs if an external scheduler calls it.
- Retention cleanup currently targets activity logs and AI memory, not the complete lifecycle of drafts, submissions, photos, shared links, or snapshots.
- Generated PDF exports should remain downloads unless the user explicitly archives them.

## Required Storage Rules

### Active data

Keep only the data needed for normal recent operations in Supabase:

- Form templates and schema
- Tenant and membership data
- Recent submitted form metadata and payloads
- Open corrective actions
- Recent photo references
- Archive manifests and synchronization state

### Temporary data

Automatically remove temporary data after a short configurable period:

- Draft submissions
- Offline outbox items after successful synchronization
- Activity logs
- AI memory entries
- Expired shared links and their link items
- Old storage usage snapshots

### Evidence files

Photo evidence and signatures must be treated as object-storage files, not database content:

- Resize and compress images before upload.
- Store an object path or file ID in the submission payload, not base64 data.
- Use a private bucket where possible.
- Generate signed URLs for authorized viewing.
- Delete objects when their owning submission or corrective action is deleted.
- Periodically remove orphaned objects.
- Do not silently fall back to storing large base64 images in Postgres. Fail clearly or keep the item in the device outbox until the upload succeeds.

## Tenant Retention Model

Each tenant should have explicit retention settings with sensible defaults. The exact defaults are a product decision, but the system should support at least:

- Draft retention in days
- Active submission retention in days or maximum active submissions
- Closed corrective-action retention
- Photo retention
- Activity-log retention
- AI-memory retention
- Archive destination and archive status

A practical initial policy for a free/legacy tenant could be:

- Drafts: 14 days
- Activity logs: 30 days
- AI memory: 7 days
- Recent submissions: 12 months or a configurable active-record limit
- Closed corrective actions: 12 months after closure
- Storage snapshots: retain the latest 90 days

Submitted records must never be deleted without following the tenant's configured policy and, where applicable, creating an archive first.

## Customer-Owned Archive

### Preferred behavior

When a submission becomes old according to the tenant policy:

1. Build an archive containing the submission data and its evidence files.
2. Upload the archive to the tenant's connected Google Drive folder.
3. Verify the upload and record the Drive file ID, checksum, date range, and item count.
4. Mark the source records as archived.
5. Delete the active database rows and Supabase Storage objects.
6. Keep only a small archive manifest in Supabase.

An archive may use a structure such as:

```text
2026-09-iso-archive.zip
  manifest.json
  submissions.json
  submissions.csv
  photos/
```

### Google integration constraints

- Google sign-in and Google Drive storage are separate concerns.
- Request the narrowest practical OAuth scope, preferably `drive.file`.
- Store refresh tokens securely and never expose them to the browser.
- Handle revoked permissions, deleted files, moved folders, full Drive storage, and expired credentials.
- Do not assume every Google account has available free space.
- Do not make Drive a prerequisite for normal active use.
- Provide a disconnect and export flow.

Dropbox, OneDrive, or customer-owned S3/Azure Blob can be considered later using the same archive-provider interface. The first implementation should avoid supporting several providers at once.

## Storage Budget and Safety Behavior

Every tenant should have a bounded storage policy. The system should:

- Estimate database and object-storage usage.
- Show the tenant's usage and policy in Settings.
- Warn at approximately 80% and 95% of the configured limit.
- Stop accepting new photo evidence before uncontrolled growth occurs.
- Continue allowing text-only submissions where possible.
- Start archival or cleanup jobs automatically.
- Clearly report when archiving is paused or unavailable.
- Never delete data silently because a limit was reached.

The owner should also receive a platform-level alert if total storage or a tenant's usage grows unexpectedly.

## Delete and Handover Requirements

Implement a tenant-level export and deletion operation that:

- Exports templates, submissions, corrective actions, metadata, and evidence references.
- Includes downloadable evidence files or an archive manifest.
- Deletes database rows and related Storage objects.
- Removes expired share links and cached server artifacts.
- Leaves only a minimal deletion receipt if an audit trail is required.

The customer should be able to disconnect from the service without being permanently dependent on the application owner for access to their data.

## Implementation Backlog

1. Add a centralized evidence-file manifest with object paths, content type, byte size, and owner record.
2. Change photo persistence to reject or queue failed uploads instead of retaining base64 in Postgres.
3. Make audit and corrective-action deletion remove related Storage objects.
4. Add bucket usage to tenant storage estimation.
5. Add orphan-object detection and cleanup.
6. Add retention settings for drafts, active submissions, corrective actions, links, and snapshots.
7. Make the daily maintenance job externally scheduled and expose last-run health status.
8. Add tenant storage warnings and policy controls.
9. Add tenant export and complete deletion.
10. Introduce a provider interface for archives.
11. Implement Google Drive as the first optional archive provider.
12. Add archive verification, retry, disconnect, and recovery flows.
13. Add tests for retention, failed uploads, deletion, orphan cleanup, and revoked Drive access.

## Non-Goals

- Do not make Google Drive the primary query database.
- Do not store generated PDFs permanently by default.
- Do not rely on browser storage as the only permanent source of truth.
- Do not assume free Google Drive storage is an unlimited service guarantee.
- Do not add multiple external storage providers before the archive lifecycle is reliable.

## Success Criteria

This work is successful when:

- A tenant's active Supabase footprint has a known upper bound.
- Photos cannot silently inflate database rows.
- Deleting a record deletes its owned evidence files.
- Old data can be archived to customer-controlled storage or removed according to policy.
- Maintenance runs automatically without manual intervention.
- A disconnected archive provider does not corrupt active app behavior.
- A customer can export and take ownership of their data.
- The application owner is not responsible for indefinite unlimited customer storage.
