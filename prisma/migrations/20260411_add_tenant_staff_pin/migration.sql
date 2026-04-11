CREATE TABLE IF NOT EXISTS tenant_staff_pin (
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL,
  email TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tenant_staff_pin_pkey PRIMARY KEY (tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS tenant_staff_pin_user_id_idx ON tenant_staff_pin (user_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'tenant_staff_pin_tenant_id_fkey'
      AND table_name = 'tenant_staff_pin'
  ) THEN
    ALTER TABLE tenant_staff_pin
      ADD CONSTRAINT tenant_staff_pin_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE;
  END IF;
END$$;
