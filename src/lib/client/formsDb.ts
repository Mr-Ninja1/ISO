"use client";

import Dexie, { type Table } from "dexie";
import type { FormSchemaV1 } from "@/types/forms";

export type DbTemplateRow = {
  tenantSlug: string;
  templateId: string;
  updatedAt: string;
  title: string;
  schema: FormSchemaV1;
  tenantName: string;
  tenantLogoUrl: string | null;
  cachedAt: number;
};

export type DbDraftRow = {
  tenantSlug: string;
  templateId: string;
  /** Server audit id if known (draft row id). */
  auditId: string | null;
  payload: Record<string, unknown>;
  updatedAtLocal: number;
};

export type DbOutboxRow = {
  id: string;
  tenantSlug: string;
  templateId: string;
  mode: "draft" | "submit";
  auditId?: string | null;
  payload: Record<string, unknown>;
  createdAt: number;
  tries: number;
  lastError?: string | null;
};

class IsoFormsDb extends Dexie {
  templates!: Table<DbTemplateRow, string>;
  drafts!: Table<DbDraftRow, string>;
  outbox!: Table<DbOutboxRow, string>;

  constructor() {
    super("iso_forms_v1");
    this.version(1).stores({
      templates: "&key, tenantSlug, templateId, updatedAt, cachedAt",
      drafts: "&key, tenantSlug, templateId, updatedAtLocal",
      outbox: "&id, tenantSlug, templateId, createdAt",
    });

    this.templates.mapToClass(class {});
    this.drafts.mapToClass(class {});
    this.outbox.mapToClass(class {});
  }
}

let dbSingleton: IsoFormsDb | null = null;

function getDb(): IsoFormsDb | null {
  if (typeof window === "undefined") return null;
  if (dbSingleton) return dbSingleton;
  dbSingleton = new IsoFormsDb();
  return dbSingleton;
}

function templateKey(tenantSlug: string, templateId: string) {
  return `${tenantSlug}:${templateId}`;
}

function draftKey(tenantSlug: string, templateId: string) {
  return `${tenantSlug}:${templateId}`;
}

export async function dbGetTemplate(tenantSlug: string, templateId: string): Promise<DbTemplateRow | null> {
  const db = getDb();
  if (!db) return null;
  return (await db.templates.get({ key: templateKey(tenantSlug, templateId) } as any)) ?? null;
}

export async function dbPutTemplate(row: Omit<DbTemplateRow, "cachedAt">): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db.templates.put({ ...row, cachedAt: Date.now(), key: templateKey(row.tenantSlug, row.templateId) } as any);
}

export async function dbGetDraft(tenantSlug: string, templateId: string): Promise<DbDraftRow | null> {
  const db = getDb();
  if (!db) return null;
  return (await db.drafts.get({ key: draftKey(tenantSlug, templateId) } as any)) ?? null;
}

export async function dbPutDraft(row: Omit<DbDraftRow, "updatedAtLocal"> & { updatedAtLocal?: number }): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db.drafts.put({
    ...row,
    updatedAtLocal: typeof row.updatedAtLocal === "number" ? row.updatedAtLocal : Date.now(),
    key: draftKey(row.tenantSlug, row.templateId),
  } as any);
}

export async function dbClearDraft(tenantSlug: string, templateId: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db.drafts.delete(draftKey(tenantSlug, templateId));
}

export async function dbEnqueueOutbox(row: Omit<DbOutboxRow, "id" | "createdAt" | "tries">): Promise<DbOutboxRow | null> {
  const db = getDb();
  if (!db) return null;
  const item: DbOutboxRow = {
    id: `ob_${Math.random().toString(16).slice(2)}_${Date.now()}`,
    createdAt: Date.now(),
    tries: 0,
    lastError: null,
    ...row,
  };
  await db.outbox.put(item);
  return item;
}

export async function dbListOutbox(tenantSlug: string): Promise<DbOutboxRow[]> {
  const db = getDb();
  if (!db) return [];
  return await db.outbox.where("tenantSlug").equals(tenantSlug).sortBy("createdAt");
}

export async function dbListOutboxAll(): Promise<DbOutboxRow[]> {
  const db = getDb();
  if (!db) return [];
  return await db.outbox.orderBy("createdAt").toArray();
}

export async function dbMarkOutboxFailed(id: string, message: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  const existing = await db.outbox.get(id);
  if (!existing) return;
  await db.outbox.put({
    ...existing,
    tries: (existing.tries || 0) + 1,
    lastError: message || "sync failed",
  });
}

export async function dbDeleteOutbox(id: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db.outbox.delete(id);
}

