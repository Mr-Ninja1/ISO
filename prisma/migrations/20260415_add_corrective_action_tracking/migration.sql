CREATE TYPE "CorrectiveActionStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'CLOSED');

CREATE TABLE "CorrectiveAction" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "sourceType" TEXT,
  "sourceId" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "ownerName" TEXT NOT NULL,
  "ownerEmail" TEXT,
  "dueDate" TIMESTAMP(3),
  "status" "CorrectiveActionStatus" NOT NULL DEFAULT 'OPEN',
  "evidence" JSONB,
  "closedAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CorrectiveAction_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CorrectiveAction"
ADD CONSTRAINT "CorrectiveAction_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "CorrectiveAction_tenantId_idx" ON "CorrectiveAction"("tenantId");
CREATE INDEX "CorrectiveAction_tenantId_status_idx" ON "CorrectiveAction"("tenantId", "status");
CREATE INDEX "CorrectiveAction_tenantId_dueDate_idx" ON "CorrectiveAction"("tenantId", "dueDate");
CREATE INDEX "CorrectiveAction_tenantId_sourceType_sourceId_idx" ON "CorrectiveAction"("tenantId", "sourceType", "sourceId");
