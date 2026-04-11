DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'TenantRole' AND e.enumlabel = 'MANAGER'
  ) THEN
    ALTER TYPE "TenantRole" ADD VALUE 'MANAGER';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'TenantRole' AND e.enumlabel = 'AUDITOR'
  ) THEN
    ALTER TYPE "TenantRole" ADD VALUE 'AUDITOR';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'TenantRole' AND e.enumlabel = 'VIEWER'
  ) THEN
    ALTER TYPE "TenantRole" ADD VALUE 'VIEWER';
  END IF;
END$$;
