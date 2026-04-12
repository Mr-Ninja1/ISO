import { prisma } from "@/lib/prisma";

type ActivityEvent = {
  tenantId?: string | null;
  userId: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: Record<string, unknown> | null;
};

export async function recordActivity(event: ActivityEvent) {
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "ActivityLog" ("id", "tenantId", "userId", "action", "entityType", "entityId", "details", "createdAt")
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3, $4, $5, $6::jsonb, NOW())`,
      event.tenantId || null,
      event.userId,
      event.action,
      event.entityType,
      event.entityId || null,
      event.details ? JSON.stringify(event.details) : null
    );
  } catch {
    // Activity logging should not block core workflows.
  }
}
