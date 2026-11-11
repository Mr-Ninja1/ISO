ALTER TABLE public.tenant_storage_plans
  ADD COLUMN IF NOT EXISTS audit_archive_after_days integer NOT NULL DEFAULT 365
    CHECK (audit_archive_after_days BETWEEN 30 AND 3650);

CREATE TABLE IF NOT EXISTS public.tenant_google_drive_archives (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  google_email text,
  refresh_token_encrypted text NOT NULL,
  connected_at timestamptz NOT NULL DEFAULT now(),
  last_archived_at timestamptz,
  last_error text
);

CREATE TABLE IF NOT EXISTS public.audit_archives (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  template_id uuid NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  submitted_at timestamptz,
  template_title text NOT NULL DEFAULT 'Form',
  drive_file_id text NOT NULL,
  checksum_sha256 text NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now(),
  restored_at timestamptz
);
CREATE INDEX IF NOT EXISTS audit_archives_tenant_date_idx
  ON public.audit_archives (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_archives_drive_file_idx
  ON public.audit_archives (drive_file_id);

ALTER TABLE public.tenant_google_drive_archives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_archives ENABLE ROW LEVEL SECURITY;
-- OAuth credentials are only accessed by service-role server code.
CREATE POLICY audit_archives_member_read ON public.audit_archives
  FOR SELECT TO authenticated USING (public.iso_tenant_membership_exists(tenant_id));

COMMENT ON TABLE public.audit_archives IS 'Small index for submissions safely moved to a connected tenant Google Drive.';
