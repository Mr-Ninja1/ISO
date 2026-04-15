import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/roleGate";
import { collectTemperatureAlerts, collectTemperatureSeries } from "@/lib/temperatureMonitoring";

function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

function dayKey(value: string) {
  return new Date(value).toISOString().slice(0, 10);
}

function toDayRange(daysBack: number) {
  const range: string[] = [];
  for (let offset = daysBack - 1; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - offset);
    range.push(date.toISOString().slice(0, 10));
  }
  return range;
}

function schemaHasTemperatureInputs(schema: unknown): boolean {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return false;
  const obj = schema as Record<string, unknown>;
  const sections = Array.isArray(obj.sections) && obj.sections.length
    ? (obj.sections as Array<Record<string, unknown>>)
    : Array.isArray(obj.fields)
      ? [{ type: "fields", fields: obj.fields } as Record<string, unknown>]
      : [];

  for (const section of sections) {
    if (section.type === "fields" && Array.isArray(section.fields)) {
      if (section.fields.some((field) => field && typeof field === "object" && !Array.isArray(field) && (field as Record<string, unknown>).type === "temp" && (field as Record<string, unknown>).isActive !== false)) {
        return true;
      }
    }

    if (section.type === "grid" && Array.isArray(section.columns)) {
      if (section.columns.some((col) => col && typeof col === "object" && !Array.isArray(col) && (col as Record<string, unknown>).type === "temp" && (col as Record<string, unknown>).isActive !== false)) {
        return true;
      }
    }
  }

  return false;
}

function templateSettings(schema: unknown) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    return { dueDays: undefined as number | undefined, temperatureAlertBelow: undefined as number | undefined, temperatureAlertAbove: undefined as number | undefined };
  }

  const meta = (schema as Record<string, unknown>).meta;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    return { dueDays: undefined as number | undefined, temperatureAlertBelow: undefined as number | undefined, temperatureAlertAbove: undefined as number | undefined };
  }

  const metaRecord = meta as Record<string, unknown>;
  return {
    dueDays: typeof metaRecord.dueDays === "number" && Number.isFinite(metaRecord.dueDays) ? metaRecord.dueDays : undefined,
    temperatureAlertBelow: typeof metaRecord.temperatureAlertBelow === "number" && Number.isFinite(metaRecord.temperatureAlertBelow) ? metaRecord.temperatureAlertBelow : undefined,
    temperatureAlertAbove: typeof metaRecord.temperatureAlertAbove === "number" && Number.isFinite(metaRecord.temperatureAlertAbove) ? metaRecord.temperatureAlertAbove : undefined,
  };
}

function templateIsLive(schema: unknown) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return true;
  const meta = (schema as Record<string, unknown>).meta;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return true;
  return (meta as Record<string, unknown>).isLive !== false;
}

export async function GET(req: Request) {
  const token = getBearerToken(req);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser(token);

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const tenantSlug = (searchParams.get("tenantSlug") || "").trim();
  if (!tenantSlug) return NextResponse.json({ error: "Missing tenantSlug" }, { status: 400 });

  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true, name: true, slug: true },
  });
  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

  const membership = await prisma.tenantMember.findFirst({
    where: { tenantId: tenant.id, userId: user.id },
    select: { role: true },
  });

  if (!membership || !hasPermission(membership.role, "audit.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [submittedCount, draftCount, staffCount, submittedAudits, liveTemplates, draftAudits] = await Promise.all([
    prisma.auditLog.count({ where: { tenantId: tenant.id, status: "SUBMITTED" } }),
    prisma.auditLog.count({ where: { tenantId: tenant.id, status: "DRAFT" } }),
    prisma.tenantMember.count({ where: { tenantId: tenant.id } }),
    prisma.auditLog.findMany({
      where: { tenantId: tenant.id, status: "SUBMITTED" },
      orderBy: [{ updatedAt: "desc" }],
      take: 500,
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        payload: true,
        template: {
          select: {
            id: true,
            title: true,
            schema: true,
          },
        },
      },
    }),
    prisma.formTemplate.findMany({
      where: { tenantId: tenant.id },
      select: {
        id: true,
        schema: true,
      },
    }),
    prisma.auditLog.findMany({
      where: { tenantId: tenant.id, status: "DRAFT" },
      orderBy: [{ updatedAt: "desc" }],
      select: {
        id: true,
        updatedAt: true,
        template: {
          select: {
            id: true,
            schema: true,
          },
        },
      },
    }),
  ]);

  const liveOnlyTemplates = liveTemplates.filter((template) => templateIsLive(template.schema));
  const dueRuleTemplates = liveOnlyTemplates.filter((template) => templateSettings(template.schema).dueDays !== undefined).length;
  const tempRuleTemplates = liveOnlyTemplates.filter((template) => {
    const settings = templateSettings(template.schema);
    return schemaHasTemperatureInputs(template.schema) && (typeof settings.temperatureAlertBelow === "number" || typeof settings.temperatureAlertAbove === "number");
  }).length;
  const overdueDrafts = draftAudits.filter((audit) => {
    const settings = templateSettings(audit.template?.schema);
    if (typeof settings.dueDays !== "number" || settings.dueDays <= 0) return false;
    const ageMs = Date.now() - new Date(audit.updatedAt).getTime();
    return ageMs > settings.dueDays * 24 * 60 * 60 * 1000;
  }).length;

  const days = toDayRange(7);
  const seriesByDay = new Map(days.map((day) => [day, { day, readings: 0, alerts: 0, average: null as number | null }]));
  const latestAlerts: Array<{
    auditId: string;
    templateTitle: string;
    createdAt: string;
    key: string;
    label: string;
    value: number;
    unit?: "C" | "F";
    alertBelow?: number;
    alertAbove?: number;
  }> = [];

  let totalReadings = 0;
  let totalAlerts = 0;
  const allValues: number[] = [];

  for (const audit of submittedAudits) {
    const payload = (audit.payload as Record<string, unknown>) || {};
    const schema = audit.template.schema as any;
    const alerts = collectTemperatureAlerts(schema, payload);
    const series = collectTemperatureSeries(schema, payload);

    const day = dayKey(audit.createdAt.toISOString());
    const bucket = seriesByDay.get(day);
    if (bucket) {
      const dayValues = series.flatMap((entry) => entry.values);
      bucket.readings += dayValues.length;
      bucket.alerts += alerts.length;
      if (dayValues.length > 0) {
        const sum = dayValues.reduce((acc, value) => acc + value, 0);
        allValues.push(...dayValues);
        bucket.average = Number((sum / dayValues.length).toFixed(2));
      }
    }

    totalReadings += series.reduce((acc, entry) => acc + entry.values.length, 0);
    totalAlerts += alerts.length;

    for (const alert of alerts) {
      latestAlerts.push({
        auditId: audit.id,
        templateTitle: audit.template.title,
        createdAt: audit.createdAt.toISOString(),
        key: alert.key,
        label: alert.label,
        value: alert.value,
        unit: alert.unit,
        alertBelow: alert.alertBelow,
        alertAbove: alert.alertAbove,
      });
    }
  }

  latestAlerts.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  const averageTemperature = allValues.length > 0 ? Number((allValues.reduce((acc, value) => acc + value, 0) / allValues.length).toFixed(2)) : null;
  const minTemperature = allValues.length > 0 ? Math.min(...allValues) : null;
  const maxTemperature = allValues.length > 0 ? Math.max(...allValues) : null;

  return NextResponse.json(
    {
      tenant,
      summary: {
        submittedCount,
        draftCount,
        staffCount,
        dueRuleTemplates,
        tempRuleTemplates,
        overdueDrafts,
        complianceRate: submittedCount + draftCount > 0 ? (submittedCount / (submittedCount + draftCount)) * 100 : 0,
      },
      temperature: {
        totalReadings,
        totalAlerts,
        averageTemperature,
        minTemperature,
        maxTemperature,
        recentAlerts: latestAlerts.slice(0, 10),
        daily: Array.from(seriesByDay.values()),
      },
    },
    {
      headers: {
        "Cache-Control": "private, max-age=10, stale-while-revalidate=30",
      },
    }
  );
}