import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleSupabase } from "@/lib/supabase/serviceRole";
import { getTemplateSchemaMeta, withTemplateSchemaMeta } from "@/lib/templateVersioning";

export type SyncEntityType = "category" | "form_template";
export type SyncChangeType = "create" | "update" | "delete";
export type SyncApprovalMode = "manual" | "auto";

type CategoryRow = {
  id: string;
  tenant_id: string;
  name: string;
  sort_order: number;
  updated_at: string;
};

type TemplateRow = {
  id: string;
  tenant_id: string;
  category_id: string | null;
  title: string;
  schema: unknown;
  updated_at: string;
};

type EntityLinkRow = {
  id: string;
  sync_group_id: string;
  entity_type: SyncEntityType;
  sync_key: string;
  tenant_id: string;
  entity_id: string;
  source_updated_at: string;
};

type SyncGroupRow = {
  id: string;
  name: string;
  approval_mode: SyncApprovalMode;
};

type SyncMemberRow = {
  sync_group_id: string;
  tenant_id: string;
};

function normalizeName(value: string) {
  return value.trim().toLowerCase();
}

function requireSvc() {
  const svc = createServiceRoleSupabase();
  if (!svc) throw new Error("Service role is not configured");
  return svc;
}

export async function getSyncGroupForTenant(tenantId: string) {
  const svc = requireSvc();
  const { data: member, error } = await svc
    .from("tenant_sync_members")
    .select("sync_group_id, tenant_id, tenant_sync_groups(id,name,approval_mode)")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!member) return null;

  const groupRaw = member.tenant_sync_groups as SyncGroupRow | SyncGroupRow[] | null;
  const group = Array.isArray(groupRaw) ? groupRaw[0] : groupRaw;
  if (!group) return null;

  const { data: peers, error: peerErr } = await svc
    .from("tenant_sync_members")
    .select("tenant_id, tenants(id,name,slug)")
    .eq("sync_group_id", member.sync_group_id);

  if (peerErr) throw new Error(peerErr.message);

  const members = (peers || []).map((row) => {
    const tenantRaw = row.tenants as { id: string; name: string; slug: string } | { id: string; name: string; slug: string }[] | null;
    const tenant = Array.isArray(tenantRaw) ? tenantRaw[0] : tenantRaw;
    return {
      tenantId: String(row.tenant_id),
      name: tenant?.name || "Unknown",
      slug: tenant?.slug || "",
    };
  });

  return {
    groupId: group.id,
    name: group.name,
    approvalMode: group.approval_mode,
    members,
    peerTenantIds: members.filter((m) => m.tenantId !== tenantId).map((m) => m.tenantId),
  };
}

export async function listSyncGroups() {
  const svc = requireSvc();
  const { data: groups, error } = await svc
    .from("tenant_sync_groups")
    .select("id,name,approval_mode,created_at,updated_at")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  const groupIds = (groups || []).map((g) => g.id as string);
  if (groupIds.length === 0) return [];

  const { data: members, error: memberErr } = await svc
    .from("tenant_sync_members")
    .select("sync_group_id,tenant_id,tenants(id,name,slug)")
    .in("sync_group_id", groupIds);

  if (memberErr) throw new Error(memberErr.message);

  const membersByGroup = new Map<string, Array<{ tenantId: string; name: string; slug: string }>>();
  for (const row of members || []) {
    const groupId = String(row.sync_group_id);
    const tenantRaw = row.tenants as { id: string; name: string; slug: string } | { id: string; name: string; slug: string }[] | null;
    const tenant = Array.isArray(tenantRaw) ? tenantRaw[0] : tenantRaw;
    const list = membersByGroup.get(groupId) || [];
    list.push({
      tenantId: String(row.tenant_id),
      name: tenant?.name || "Unknown",
      slug: tenant?.slug || "",
    });
    membersByGroup.set(groupId, list);
  }

  return (groups || []).map((group) => ({
    id: group.id as string,
    name: group.name as string,
    approvalMode: group.approval_mode as SyncApprovalMode,
    createdAt: group.created_at as string,
    updatedAt: group.updated_at as string,
    members: membersByGroup.get(group.id as string) || [],
  }));
}

export async function createSyncGroup(input: {
  name: string;
  tenantIds: string[];
  approvalMode: SyncApprovalMode;
  createdBy?: string | null;
  runInitialMerge?: boolean;
}) {
  const svc = requireSvc();
  const uniqueTenantIds = [...new Set(input.tenantIds.filter(Boolean))];
  if (uniqueTenantIds.length < 2) {
    throw new Error("Select at least two brands to link");
  }

  const { data: existingMembers, error: existingErr } = await svc
    .from("tenant_sync_members")
    .select("tenant_id")
    .in("tenant_id", uniqueTenantIds);

  if (existingErr) throw new Error(existingErr.message);
  if ((existingMembers || []).length > 0) {
    throw new Error("One or more selected brands are already in a sync group");
  }

  const { data: group, error: groupErr } = await svc
    .from("tenant_sync_groups")
    .insert({
      name: input.name.trim(),
      approval_mode: input.approvalMode,
      created_by: input.createdBy ?? null,
    })
    .select("id,name,approval_mode")
    .single();

  if (groupErr || !group) throw new Error(groupErr?.message || "Failed to create sync group");

  const memberRows = uniqueTenantIds.map((tenantId) => ({
    sync_group_id: group.id as string,
    tenant_id: tenantId,
  }));

  const { error: memberErr } = await svc.from("tenant_sync_members").insert(memberRows);
  if (memberErr) throw new Error(memberErr.message);

  let mergeSummary = null;
  if (input.runInitialMerge !== false) {
    mergeSummary = await runInitialMerge(group.id as string);
  }

  return {
    groupId: group.id as string,
    name: group.name as string,
    approvalMode: group.approval_mode as SyncApprovalMode,
    memberCount: uniqueTenantIds.length,
    mergeSummary,
  };
}

export async function updateSyncGroup(groupId: string, patch: { name?: string; approvalMode?: SyncApprovalMode }) {
  const svc = requireSvc();
  const update: Record<string, unknown> = {};
  if (typeof patch.name === "string" && patch.name.trim()) update.name = patch.name.trim();
  if (patch.approvalMode) update.approval_mode = patch.approvalMode;
  if (Object.keys(update).length === 0) throw new Error("Nothing to update");

  const { data, error } = await svc
    .from("tenant_sync_groups")
    .update(update)
    .eq("id", groupId)
    .select("id,name,approval_mode")
    .single();

  if (error || !data) throw new Error(error?.message || "Update failed");
  return {
    id: data.id as string,
    name: data.name as string,
    approvalMode: data.approval_mode as SyncApprovalMode,
  };
}

export async function deleteSyncGroup(groupId: string) {
  const svc = requireSvc();
  const { error } = await svc.from("tenant_sync_groups").delete().eq("id", groupId);
  if (error) throw new Error(error.message);
}

async function getGroupMembers(svc: SupabaseClient, groupId: string) {
  const { data, error } = await svc.from("tenant_sync_members").select("tenant_id").eq("sync_group_id", groupId);
  if (error) throw new Error(error.message);
  return (data || []).map((row) => String(row.tenant_id));
}

async function getEntityLink(
  svc: SupabaseClient,
  groupId: string,
  tenantId: string,
  entityType: SyncEntityType,
  entityId: string
) {
  const { data, error } = await svc
    .from("tenant_sync_entity_links")
    .select("*")
    .eq("sync_group_id", groupId)
    .eq("tenant_id", tenantId)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as EntityLinkRow | null;
}

async function getEntityLinkByKey(
  svc: SupabaseClient,
  groupId: string,
  tenantId: string,
  entityType: SyncEntityType,
  syncKey: string
) {
  const { data, error } = await svc
    .from("tenant_sync_entity_links")
    .select("*")
    .eq("sync_group_id", groupId)
    .eq("tenant_id", tenantId)
    .eq("entity_type", entityType)
    .eq("sync_key", syncKey)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as EntityLinkRow | null;
}

async function upsertEntityLink(
  svc: SupabaseClient,
  input: {
    syncGroupId: string;
    entityType: SyncEntityType;
    syncKey: string;
    tenantId: string;
    entityId: string;
    sourceUpdatedAt: string;
  }
) {
  const { error } = await svc.from("tenant_sync_entity_links").upsert(
    {
      sync_group_id: input.syncGroupId,
      entity_type: input.entityType,
      sync_key: input.syncKey,
      tenant_id: input.tenantId,
      entity_id: input.entityId,
      source_updated_at: input.sourceUpdatedAt,
    },
    { onConflict: "sync_group_id,tenant_id,entity_type,sync_key" }
  );

  if (error) throw new Error(error.message);
}

async function resolveCategorySyncKey(
  svc: SupabaseClient,
  groupId: string,
  category: CategoryRow
) {
  const existing = await getEntityLink(svc, groupId, category.tenant_id, "category", category.id);
  if (existing) return existing.sync_key;

  const { data: sameNameLinks, error } = await svc
    .from("tenant_sync_entity_links")
    .select("sync_key, entity_id")
    .eq("sync_group_id", groupId)
    .eq("entity_type", "category");

  if (error) throw new Error(error.message);

  const normalized = normalizeName(category.name);
  for (const link of sameNameLinks || []) {
    const { data: peerCategory } = await svc
      .from("categories")
      .select("name")
      .eq("id", link.entity_id)
      .maybeSingle();
    if (peerCategory && normalizeName(String(peerCategory.name)) === normalized) {
      return link.sync_key as string;
    }
  }

  return crypto.randomUUID();
}

async function resolveTemplateSyncKey(
  svc: SupabaseClient,
  groupId: string,
  template: TemplateRow,
  categorySyncKey: string | null
) {
  const existing = await getEntityLink(svc, groupId, template.tenant_id, "form_template", template.id);
  if (existing) return existing.sync_key;

  const meta = getTemplateSchemaMeta(template.schema);
  if (meta.lineageId) {
    const { data: lineageLink } = await svc
      .from("tenant_sync_entity_links")
      .select("sync_key")
      .eq("sync_group_id", groupId)
      .eq("entity_type", "form_template")
      .eq("sync_key", meta.lineageId)
      .maybeSingle();
    if (lineageLink) return lineageLink.sync_key as string;
  }

  const { data: peerLinks, error } = await svc
    .from("tenant_sync_entity_links")
    .select("sync_key, entity_id")
    .eq("sync_group_id", groupId)
    .eq("entity_type", "form_template");

  if (error) throw new Error(error.message);

  const normalizedTitle = normalizeName(template.title);
  for (const link of peerLinks || []) {
    const { data: peerTemplate } = await svc
      .from("form_templates")
      .select("title, category_id, tenant_id")
      .eq("id", link.entity_id)
      .maybeSingle();
    if (!peerTemplate || normalizeName(String(peerTemplate.title)) !== normalizedTitle) continue;

    if (!categorySyncKey || !peerTemplate.category_id) {
      return link.sync_key as string;
    }

    const peerCategoryLink = await getEntityLink(
      svc,
      groupId,
      String(peerTemplate.tenant_id),
      "category",
      String(peerTemplate.category_id)
    );
    if (peerCategoryLink?.sync_key === categorySyncKey) {
      return link.sync_key as string;
    }
  }

  return meta.lineageId || crypto.randomUUID();
}

async function findPeerCategoryByName(
  svc: SupabaseClient,
  tenantId: string,
  name: string
) {
  const { data: categories, error } = await svc
    .from("categories")
    .select("id, tenant_id, name, sort_order, updated_at")
    .eq("tenant_id", tenantId);

  if (error) throw new Error(error.message);
  const normalized = normalizeName(name);
  return (categories || []).find((row) => normalizeName(String(row.name)) === normalized) as CategoryRow | undefined;
}

async function findPeerTemplateByTitle(
  svc: SupabaseClient,
  tenantId: string,
  title: string,
  categoryId: string | null
) {
  const { data: templates, error } = await svc
    .from("form_templates")
    .select("id, tenant_id, category_id, title, schema, updated_at")
    .eq("tenant_id", tenantId);

  if (error) throw new Error(error.message);
  const normalized = normalizeName(title);
  return (templates || []).find(
    (row) =>
      normalizeName(String(row.title)) === normalized &&
      (categoryId ? row.category_id === categoryId : !row.category_id)
  ) as TemplateRow | undefined;
}

async function mapCategoryIdForTenant(
  svc: SupabaseClient,
  groupId: string,
  targetTenantId: string,
  categorySyncKey: string | null
) {
  if (!categorySyncKey) return null;
  const link = await getEntityLinkByKey(svc, groupId, targetTenantId, "category", categorySyncKey);
  return link?.entity_id ?? null;
}

async function buildCategoryPayload(category: CategoryRow) {
  return {
    name: category.name,
    sortOrder: category.sort_order,
  };
}

async function buildTemplatePayload(template: TemplateRow, categorySyncKey: string | null) {
  return {
    title: template.title,
    categorySyncKey,
    schema: template.schema,
  };
}

export async function runInitialMerge(groupId: string) {
  const svc = requireSvc();
  const tenantIds = await getGroupMembers(svc, groupId);

  let categoriesLinked = 0;
  let templatesLinked = 0;
  let categoriesCopied = 0;
  let templatesCopied = 0;

  for (const tenantId of tenantIds) {
    const { data: categories, error: catErr } = await svc
      .from("categories")
      .select("id, tenant_id, name, sort_order, updated_at")
      .eq("tenant_id", tenantId)
      .order("sort_order", { ascending: true });

    if (catErr) throw new Error(catErr.message);

    for (const category of categories || []) {
      const syncKey = await resolveCategorySyncKey(svc, groupId, category as CategoryRow);
      const hadLink = Boolean(await getEntityLink(svc, groupId, tenantId, "category", category.id as string));

      await upsertEntityLink(svc, {
        syncGroupId: groupId,
        entityType: "category",
        syncKey,
        tenantId,
        entityId: category.id as string,
        sourceUpdatedAt: String(category.updated_at),
      });

      if (!hadLink) categoriesLinked += 1;

      for (const peerTenantId of tenantIds) {
        if (peerTenantId === tenantId) continue;
        const peerLink = await getEntityLinkByKey(svc, groupId, peerTenantId, "category", syncKey);
        if (peerLink) continue;

        const existingPeerCategory = await findPeerCategoryByName(
          svc,
          peerTenantId,
          String(category.name)
        );

        if (existingPeerCategory) {
          await upsertEntityLink(svc, {
            syncGroupId: groupId,
            entityType: "category",
            syncKey,
            tenantId: peerTenantId,
            entityId: existingPeerCategory.id,
            sourceUpdatedAt: String(existingPeerCategory.updated_at),
          });
          categoriesLinked += 1;
          continue;
        }

        const { data: created, error: createErr } = await svc
          .from("categories")
          .insert({
            tenant_id: peerTenantId,
            name: category.name,
            sort_order: category.sort_order,
          })
          .select("id, updated_at")
          .single();

        if (createErr || !created) throw new Error(createErr?.message || "Category copy failed");

        await upsertEntityLink(svc, {
          syncGroupId: groupId,
          entityType: "category",
          syncKey,
          tenantId: peerTenantId,
          entityId: created.id as string,
          sourceUpdatedAt: String(created.updated_at),
        });
        categoriesCopied += 1;
      }
    }
  }

  for (const tenantId of tenantIds) {
    const { data: templates, error: tplErr } = await svc
      .from("form_templates")
      .select("id, tenant_id, category_id, title, schema, updated_at")
      .eq("tenant_id", tenantId);

    if (tplErr) throw new Error(tplErr.message);

    for (const template of templates || []) {
      let categorySyncKey: string | null = null;
      if (template.category_id) {
        const catLink = await getEntityLink(svc, groupId, tenantId, "category", String(template.category_id));
        categorySyncKey = catLink?.sync_key ?? null;
      }

      const syncKey = await resolveTemplateSyncKey(svc, groupId, template as TemplateRow, categorySyncKey);
      const hadLink = Boolean(
        await getEntityLink(svc, groupId, tenantId, "form_template", template.id as string)
      );

      await upsertEntityLink(svc, {
        syncGroupId: groupId,
        entityType: "form_template",
        syncKey,
        tenantId,
        entityId: template.id as string,
        sourceUpdatedAt: String(template.updated_at),
      });

      if (!hadLink) templatesLinked += 1;

      for (const peerTenantId of tenantIds) {
        if (peerTenantId === tenantId) continue;
        const peerLink = await getEntityLinkByKey(svc, groupId, peerTenantId, "form_template", syncKey);
        if (peerLink) continue;

        const targetCategoryId = await mapCategoryIdForTenant(svc, groupId, peerTenantId, categorySyncKey);

        const existingPeerTemplate = await findPeerTemplateByTitle(
          svc,
          peerTenantId,
          String(template.title),
          targetCategoryId
        );

        if (existingPeerTemplate) {
          await upsertEntityLink(svc, {
            syncGroupId: groupId,
            entityType: "form_template",
            syncKey,
            tenantId: peerTenantId,
            entityId: existingPeerTemplate.id,
            sourceUpdatedAt: String(existingPeerTemplate.updated_at),
          });
          templatesLinked += 1;
          continue;
        }

        const schemaWithMeta = withTemplateSchemaMeta(
          template.schema,
          { lineageId: syncKey, templateVersion: 1, isLive: true },
          String(template.title)
        );

        const { data: created, error: createErr } = await svc
          .from("form_templates")
          .insert({
            tenant_id: peerTenantId,
            category_id: targetCategoryId,
            title: template.title,
            is_standard: false,
            schema: schemaWithMeta,
          })
          .select("id, updated_at")
          .single();

        if (createErr || !created) throw new Error(createErr?.message || "Template copy failed");

        await upsertEntityLink(svc, {
          syncGroupId: groupId,
          entityType: "form_template",
          syncKey,
          tenantId: peerTenantId,
          entityId: created.id as string,
          sourceUpdatedAt: String(created.updated_at),
        });
        templatesCopied += 1;
      }
    }
  }

  return {
    categoriesLinked,
    templatesLinked,
    categoriesCopied,
    templatesCopied,
  };
}

async function applyCategoryChange(
  svc: SupabaseClient,
  input: {
    syncGroupId: string;
    targetTenantId: string;
    syncKey: string;
    changeType: SyncChangeType;
    payload: Record<string, unknown>;
    sourceUpdatedAt: string;
  }
) {
  const link = await getEntityLinkByKey(svc, input.syncGroupId, input.targetTenantId, "category", input.syncKey);

  if (input.changeType === "delete") {
    if (link) {
      await svc.from("categories").delete().eq("id", link.entity_id);
      await svc
        .from("tenant_sync_entity_links")
        .delete()
        .eq("sync_group_id", input.syncGroupId)
        .eq("entity_type", "category")
        .eq("sync_key", input.syncKey)
        .eq("tenant_id", input.targetTenantId);
    }
    return { applied: true, entityId: link?.entity_id ?? null };
  }

  const name = typeof input.payload.name === "string" ? input.payload.name : "";
  const sortOrder =
    typeof input.payload.sortOrder === "number" ? input.payload.sortOrder : 0;

  if (link) {
    const { data: updated, error } = await svc
      .from("categories")
      .update({ name, sort_order: sortOrder, updated_at: input.sourceUpdatedAt })
      .eq("id", link.entity_id)
      .select("id, updated_at")
      .single();

    if (error || !updated) throw new Error(error?.message || "Category update failed");

    await upsertEntityLink(svc, {
      syncGroupId: input.syncGroupId,
      entityType: "category",
      syncKey: input.syncKey,
      tenantId: input.targetTenantId,
      entityId: updated.id as string,
      sourceUpdatedAt: String(updated.updated_at),
    });

    return { applied: true, entityId: updated.id as string };
  }

  const { data: created, error: createErr } = await svc
    .from("categories")
    .insert({
      tenant_id: input.targetTenantId,
      name,
      sort_order: sortOrder,
    })
    .select("id, updated_at")
    .single();

  if (createErr || !created) throw new Error(createErr?.message || "Category create failed");

  await upsertEntityLink(svc, {
    syncGroupId: input.syncGroupId,
    entityType: "category",
    syncKey: input.syncKey,
    tenantId: input.targetTenantId,
    entityId: created.id as string,
    sourceUpdatedAt: String(created.updated_at),
  });

  return { applied: true, entityId: created.id as string };
}

async function applyTemplateChange(
  svc: SupabaseClient,
  input: {
    syncGroupId: string;
    targetTenantId: string;
    syncKey: string;
    changeType: SyncChangeType;
    payload: Record<string, unknown>;
    sourceUpdatedAt: string;
  }
) {
  const link = await getEntityLinkByKey(
    svc,
    input.syncGroupId,
    input.targetTenantId,
    "form_template",
    input.syncKey
  );

  if (input.changeType === "delete") {
    if (link) {
      await svc.from("form_templates").delete().eq("id", link.entity_id);
      await svc
        .from("tenant_sync_entity_links")
        .delete()
        .eq("sync_group_id", input.syncGroupId)
        .eq("entity_type", "form_template")
        .eq("sync_key", input.syncKey)
        .eq("tenant_id", input.targetTenantId);
    }
    return { applied: true, entityId: link?.entity_id ?? null };
  }

  const title = typeof input.payload.title === "string" ? input.payload.title : "Form";
  const categorySyncKey =
    typeof input.payload.categorySyncKey === "string" ? input.payload.categorySyncKey : null;
  const schema = input.payload.schema ?? {};
  const targetCategoryId = await mapCategoryIdForTenant(
    svc,
    input.syncGroupId,
    input.targetTenantId,
    categorySyncKey
  );

  const schemaWithMeta = withTemplateSchemaMeta(
    schema,
    { lineageId: input.syncKey, templateVersion: 1, isLive: true },
    title
  );

  if (link) {
    const { data: updated, error } = await svc
      .from("form_templates")
      .update({
        title,
        category_id: targetCategoryId,
        schema: schemaWithMeta,
        updated_at: input.sourceUpdatedAt,
      })
      .eq("id", link.entity_id)
      .select("id, updated_at")
      .single();

    if (error || !updated) throw new Error(error?.message || "Template update failed");

    await upsertEntityLink(svc, {
      syncGroupId: input.syncGroupId,
      entityType: "form_template",
      syncKey: input.syncKey,
      tenantId: input.targetTenantId,
      entityId: updated.id as string,
      sourceUpdatedAt: String(updated.updated_at),
    });

    return { applied: true, entityId: updated.id as string };
  }

  const { data: created, error: createErr } = await svc
    .from("form_templates")
    .insert({
      tenant_id: input.targetTenantId,
      category_id: targetCategoryId,
      title,
      is_standard: false,
      schema: schemaWithMeta,
    })
    .select("id, updated_at")
    .single();

  if (createErr || !created) throw new Error(createErr?.message || "Template create failed");

  await upsertEntityLink(svc, {
    syncGroupId: input.syncGroupId,
    entityType: "form_template",
    syncKey: input.syncKey,
    tenantId: input.targetTenantId,
    entityId: created.id as string,
    sourceUpdatedAt: String(created.updated_at),
  });

  return { applied: true, entityId: created.id as string };
}

export async function applySyncChange(input: {
  syncGroupId: string;
  targetTenantId: string;
  entityType: SyncEntityType;
  syncKey: string;
  changeType: SyncChangeType;
  payload: Record<string, unknown>;
  sourceUpdatedAt: string;
}) {
  const svc = requireSvc();

  if (input.entityType === "category") {
    return applyCategoryChange(svc, input);
  }
  return applyTemplateChange(svc, input);
}

async function loadChangePayload(
  svc: SupabaseClient,
  groupId: string,
  entityType: SyncEntityType,
  entityId: string,
  tenantId: string
) {
  if (entityType === "category") {
    const { data, error } = await svc
      .from("categories")
      .select("id, tenant_id, name, sort_order, updated_at")
      .eq("id", entityId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (error || !data) throw new Error("Category not found for sync");
    return {
      payload: await buildCategoryPayload(data as CategoryRow),
      sourceUpdatedAt: String(data.updated_at),
    };
  }

  const { data, error } = await svc
    .from("form_templates")
    .select("id, tenant_id, category_id, title, schema, updated_at")
    .eq("id", entityId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error || !data) throw new Error("Template not found for sync");

  let categorySyncKey: string | null = null;
  if (data.category_id) {
    const catLink = await getEntityLink(svc, groupId, tenantId, "category", String(data.category_id));
    categorySyncKey = catLink?.sync_key ?? null;
  }

  return {
    payload: await buildTemplatePayload(data as TemplateRow, categorySyncKey),
    sourceUpdatedAt: String(data.updated_at),
  };
}

export async function notifyBrandSyncChange(input: {
  sourceTenantId: string;
  entityType: SyncEntityType;
  entityId: string;
  changeType: SyncChangeType;
}) {
  try {
    const svc = requireSvc();
    const context = await getSyncGroupForTenant(input.sourceTenantId);
    if (!context || context.peerTenantIds.length === 0) return { notified: 0 };

    const { data: group, error: groupErr } = await svc
      .from("tenant_sync_groups")
      .select("approval_mode")
      .eq("id", context.groupId)
      .maybeSingle();

    if (groupErr || !group) return { notified: 0 };

    let syncKey: string;
    let payload: Record<string, unknown>;
    let sourceUpdatedAt: string;

    if (input.changeType === "delete") {
      const link = await getEntityLink(
        svc,
        context.groupId,
        input.sourceTenantId,
        input.entityType,
        input.entityId
      );
      if (!link) return { notified: 0 };
      syncKey = link.sync_key;
      payload = {};
      sourceUpdatedAt = link.source_updated_at;
    } else {
      const loaded = await loadChangePayload(
        svc,
        context.groupId,
        input.entityType,
        input.entityId,
        input.sourceTenantId
      );
      payload = loaded.payload;
      sourceUpdatedAt = loaded.sourceUpdatedAt;

      if (input.entityType === "category") {
        const { data: category } = await svc
          .from("categories")
          .select("id, tenant_id, name, sort_order, updated_at")
          .eq("id", input.entityId)
          .maybeSingle();
        if (!category) return { notified: 0 };
        syncKey = await resolveCategorySyncKey(svc, context.groupId, category as CategoryRow);
        await upsertEntityLink(svc, {
          syncGroupId: context.groupId,
          entityType: "category",
          syncKey,
          tenantId: input.sourceTenantId,
          entityId: input.entityId,
          sourceUpdatedAt,
        });
      } else {
        const { data: template } = await svc
          .from("form_templates")
          .select("id, tenant_id, category_id, title, schema, updated_at")
          .eq("id", input.entityId)
          .maybeSingle();
        if (!template) return { notified: 0 };

        let categorySyncKey: string | null = null;
        if (template.category_id) {
          const catLink = await getEntityLink(
            svc,
            context.groupId,
            input.sourceTenantId,
            "category",
            String(template.category_id)
          );
          categorySyncKey = catLink?.sync_key ?? null;
        }

        syncKey = await resolveTemplateSyncKey(
          svc,
          context.groupId,
          template as TemplateRow,
          categorySyncKey
        );
        await upsertEntityLink(svc, {
          syncGroupId: context.groupId,
          entityType: "form_template",
          syncKey,
          tenantId: input.sourceTenantId,
          entityId: input.entityId,
          sourceUpdatedAt,
        });
      }
    }

    let notified = 0;
    for (const targetTenantId of context.peerTenantIds) {
      if (group.approval_mode === "auto") {
        await applySyncChange({
          syncGroupId: context.groupId,
          targetTenantId,
          entityType: input.entityType,
          syncKey,
          changeType: input.changeType,
          payload,
          sourceUpdatedAt,
        });
        notified += 1;
        continue;
      }

      await svc
        .from("tenant_sync_pending_changes")
        .delete()
        .eq("sync_group_id", context.groupId)
        .eq("target_tenant_id", targetTenantId)
        .eq("entity_type", input.entityType)
        .eq("sync_key", syncKey)
        .eq("status", "pending");

      const { error: pendingErr } = await svc.from("tenant_sync_pending_changes").insert({
        sync_group_id: context.groupId,
        source_tenant_id: input.sourceTenantId,
        target_tenant_id: targetTenantId,
        entity_type: input.entityType,
        sync_key: syncKey,
        change_type: input.changeType,
        payload,
        status: "pending",
        source_entity_id: input.entityId,
        source_updated_at: sourceUpdatedAt,
      });

      if (!pendingErr) notified += 1;
    }

    if (input.changeType === "delete") {
      await svc
        .from("tenant_sync_entity_links")
        .delete()
        .eq("sync_group_id", context.groupId)
        .eq("entity_type", input.entityType)
        .eq("tenant_id", input.sourceTenantId)
        .eq("entity_id", input.entityId);
    }

    return { notified };
  } catch (err) {
    console.error("notifyBrandSyncChange failed", err);
    return { notified: 0, error: err instanceof Error ? err.message : "Sync failed" };
  }
}

export async function listPendingChanges(targetTenantId: string) {
  const svc = requireSvc();
  const { data, error } = await svc
    .from("tenant_sync_pending_changes")
    .select(
      "id,sync_group_id,source_tenant_id,target_tenant_id,entity_type,sync_key,change_type,payload,status,source_entity_id,source_updated_at,created_at,tenants:source_tenant_id(name,slug)"
    )
    .eq("target_tenant_id", targetTenantId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  return (data || []).map((row) => {
    const sourceRaw = row.tenants as { name: string; slug: string } | { name: string; slug: string }[] | null;
    const source = Array.isArray(sourceRaw) ? sourceRaw[0] : sourceRaw;
    const payload = (row.payload || {}) as Record<string, unknown>;
    const label =
      row.entity_type === "category"
        ? String(payload.name || "Category")
        : String(payload.title || "Form");

    return {
      id: row.id as string,
      syncGroupId: row.sync_group_id as string,
      sourceTenantId: row.source_tenant_id as string,
      sourceBrandName: source?.name || "Linked brand",
      sourceBrandSlug: source?.slug || "",
      entityType: row.entity_type as SyncEntityType,
      syncKey: row.sync_key as string,
      changeType: row.change_type as SyncChangeType,
      label,
      payload,
      sourceUpdatedAt: row.source_updated_at as string,
      createdAt: row.created_at as string,
    };
  });
}

export async function resolvePendingChange(input: {
  changeId: string;
  targetTenantId: string;
  action: "approve" | "reject";
  resolvedBy: string;
}) {
  const svc = requireSvc();
  const { data: change, error } = await svc
    .from("tenant_sync_pending_changes")
    .select("*")
    .eq("id", input.changeId)
    .eq("target_tenant_id", input.targetTenantId)
    .eq("status", "pending")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!change) throw new Error("Pending change not found");

  if (input.action === "reject") {
    const { error: rejectErr } = await svc
      .from("tenant_sync_pending_changes")
      .update({
        status: "rejected",
        resolved_by: input.resolvedBy,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", input.changeId);

    if (rejectErr) throw new Error(rejectErr.message);
    return { status: "rejected" as const };
  }

  const result = await applySyncChange({
    syncGroupId: change.sync_group_id as string,
    targetTenantId: input.targetTenantId,
    entityType: change.entity_type as SyncEntityType,
    syncKey: change.sync_key as string,
    changeType: change.change_type as SyncChangeType,
    payload: (change.payload || {}) as Record<string, unknown>,
    sourceUpdatedAt: change.source_updated_at as string,
  });

  const { error: applyErr } = await svc
    .from("tenant_sync_pending_changes")
    .update({
      status: "applied",
      resolved_by: input.resolvedBy,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", input.changeId);

  if (applyErr) throw new Error(applyErr.message);
  return { status: "applied" as const, entityId: result.entityId };
}

export async function pullPendingChanges(targetTenantId: string, resolvedBy: string) {
  const pending = await listPendingChanges(targetTenantId);
  const results: Array<{ changeId: string; status: string; entityId?: string | null }> = [];

  for (const change of pending) {
    const result = await resolvePendingChange({
      changeId: change.id,
      targetTenantId,
      action: "approve",
      resolvedBy,
    });
    results.push({ changeId: change.id, status: result.status, entityId: result.entityId });
  }

  return { applied: results.length, results };
}

export function scheduleBrandSyncChange(input: {
  sourceTenantId: string;
  entityType: SyncEntityType;
  entityId: string;
  changeType: SyncChangeType;
}) {
  void notifyBrandSyncChange(input);
}
