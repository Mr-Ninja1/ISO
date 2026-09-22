import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseWithBearer } from "@/lib/supabase/routeClient";
import { hasPermission } from "@/lib/roleGate";
import { recordActivity } from "@/lib/activityTracker";
import { scheduleBrandSyncChange } from "@/lib/brandSync";
import { getBearerToken } from "@/lib/supabase/routeAuth";
import type { FormSchemaV1, GridSection } from "@/types/forms";
import { isStaticColumn } from "@/lib/formFieldConstants";

const seedCellSchema = z.union([z.string(), z.number(), z.boolean()]);
const bodySchema = z.object({
  tenantSlug: z.string().min(1),
  templateId: z.string().uuid(),
  sections: z
    .array(
      z.object({
        sectionId: z.string().min(1),
        seedRows: z.array(z.record(z.string(), seedCellSchema)).optional(),
      }),
    )
    .min(1),
});

function isActiveField(field: { isActive?: boolean }) {
  return field.isActive !== false;
}

function sanitizeSeedRows(
  grid: GridSection,
  seedRows: Array<Record<string, string | number | boolean>> | undefined,
): GridSection["seedRows"] | undefined {
  const staticCols = grid.columns.filter((col) => isActiveField(col) && isStaticColumn(col));
  if (!staticCols.length) return grid.seedRows;
  if (!Array.isArray(seedRows) || seedRows.length === 0) return undefined;

  const next = seedRows.map((row) => {
    const out: Record<string, string | number | boolean> = {};
    for (const col of staticCols) {
      const value = row?.[col.id];
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        out[col.id] = value;
      }
    }
    return out;
  });

  while (
    next.length &&
    staticCols.every((col) => {
      const value = next[next.length - 1]?.[col.id];
      return value == null || value === "";
    })
  ) {
    next.pop();
  }

  return next.length ? next : undefined;
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabaseAuth = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );

    const {
      data: { user },
    } = await supabaseAuth.auth.getUser(token);

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

    const { tenantSlug, templateId, sections: patches } = parsed.data;
    const sb = createSupabaseWithBearer(token);

    const { data: tenant, error: te } = await sb.from("tenants").select("id").eq("slug", tenantSlug).maybeSingle();
    if (te || !tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

    const { data: membership, error: me } = await sb
      .from("tenant_members")
      .select("role")
      .eq("tenant_id", tenant.id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (me || !membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    // Prepared static text is template-owned content; anyone who can fill the form may update it.
    if (!hasPermission(membership.role, "audit.submit")) {
      return NextResponse.json({ error: "Insufficient role permissions" }, { status: 403 });
    }

    const { data: current, error: curErr } = await sb
      .from("form_templates")
      .select("id, title, schema")
      .eq("id", templateId)
      .eq("tenant_id", tenant.id)
      .maybeSingle();

    if (curErr || !current) return NextResponse.json({ error: "Template not found" }, { status: 404 });

    const schema = (current.schema || {}) as FormSchemaV1;
    const schemaSections = Array.isArray(schema.sections) ? schema.sections : [];
    if (!schemaSections.length) {
      return NextResponse.json({ error: "Template has no sections" }, { status: 400 });
    }

    const patchById = new Map(patches.map((patch) => [patch.sectionId, patch.seedRows]));
    let changed = false;

    const nextSections = schemaSections.map((section) => {
      if (section.type !== "grid") return section;
      const key = section.id || "form_data";
      if (!patchById.has(key)) return section;
      if (!section.columns.some((col) => isActiveField(col) && isStaticColumn(col))) return section;

      const seedRows = sanitizeSeedRows(section, patchById.get(key));
      changed = true;
      return {
        ...section,
        rows: seedRows?.length || section.columns.some((col) => isStaticColumn(col)) ? "dynamic" : section.rows,
        seedRows,
      } as GridSection;
    });

    if (!changed) {
      return NextResponse.json({ ok: true, unchanged: true, schema });
    }

    const nextSchema: FormSchemaV1 = {
      ...schema,
      sections: nextSections,
    };

    const { error: upErr } = await sb
      .from("form_templates")
      .update({
        schema: nextSchema,
        updated_at: new Date().toISOString(),
      })
      .eq("id", current.id as string);

    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    await recordActivity(sb, {
      tenantId: tenant.id,
      userId: user.id,
      action: "template.update.seedRows",
      entityType: "FormTemplate",
      entityId: current.id as string,
      details: { title: current.title, sectionIds: patches.map((p) => p.sectionId) },
    });

    scheduleBrandSyncChange({
      sourceTenantId: tenant.id as string,
      entityType: "form_template",
      entityId: current.id as string,
      changeType: "update",
    });

    return NextResponse.json({ ok: true, schema: nextSchema });
  } catch (error: unknown) {
    console.error("/api/templates/update-seed-rows POST error", error);
    const msg = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
