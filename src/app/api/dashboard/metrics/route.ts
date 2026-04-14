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

  const [submittedCount, draftCount, staffCount, submittedAudits] = await Promise.all([
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
  ]);

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