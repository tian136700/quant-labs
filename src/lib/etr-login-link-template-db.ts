import "server-only";

import type { LoginLinkTemplate } from "@/lib/types";

let devStoreEnabled = false;
const devTemplates: LoginLinkTemplate[] = [];
let devNextId = 1;

export function enableLoginLinkTemplateDevStore() {
  devStoreEnabled = true;
}

function nowIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function mapRow(row: Record<string, unknown>): LoginLinkTemplate {
  return {
    id: Number(row.id),
    name: String(row.name),
    body: String(row.body),
    sort_order: Number(row.sort_order) || 0,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

const TEMPLATE_SELECT = `SELECT id, name, body, sort_order, created_at, updated_at FROM etr_login_link_templates`;

export async function listLoginLinkTemplates(db: D1Database): Promise<LoginLinkTemplate[]> {
  if (devStoreEnabled) {
    return [...devTemplates].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
  }

  const result = await db
    .prepare(`${TEMPLATE_SELECT} ORDER BY sort_order ASC, id ASC`)
    .all<Record<string, unknown>>();

  return (result.results || []).map(mapRow);
}

export async function getLoginLinkTemplateById(
  db: D1Database,
  templateId: number
): Promise<LoginLinkTemplate | null> {
  if (!Number.isInteger(templateId) || templateId <= 0) return null;

  if (devStoreEnabled) {
    return devTemplates.find((t) => t.id === templateId) ?? null;
  }

  const row = await db
    .prepare(`${TEMPLATE_SELECT} WHERE id = ?1`)
    .bind(templateId)
    .first<Record<string, unknown>>();

  return row ? mapRow(row) : null;
}

export type MutateLoginLinkTemplateResult =
  | { ok: true; template: LoginLinkTemplate }
  | { ok: false; error: string };

export async function createLoginLinkTemplate(
  db: D1Database,
  name: string,
  body: string,
  sortOrder = 0
): Promise<MutateLoginLinkTemplateResult> {
  const trimmedName = name.trim();
  const trimmedBody = body.trim();
  if (!trimmedName) return { ok: false, error: "name_empty" };
  if (!trimmedBody) return { ok: false, error: "body_empty" };

  const ts = nowIso();

  if (devStoreEnabled) {
    const template: LoginLinkTemplate = {
      id: devNextId++,
      name: trimmedName,
      body: trimmedBody,
      sort_order: sortOrder,
      created_at: ts,
      updated_at: ts,
    };
    devTemplates.push(template);
    return { ok: true, template };
  }

  const result = await db
    .prepare(
      `INSERT INTO etr_login_link_templates (name, body, sort_order, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?4)`
    )
    .bind(trimmedName, trimmedBody, sortOrder, ts)
    .run();

  const id = Number(result.meta?.last_row_id);
  if (!id) return { ok: false, error: "insert_failed" };

  const template = await getLoginLinkTemplateById(db, id);
  if (!template) return { ok: false, error: "insert_failed" };
  return { ok: true, template };
}

export async function updateLoginLinkTemplate(
  db: D1Database,
  templateId: number,
  input: { name?: string; body?: string; sort_order?: number }
): Promise<MutateLoginLinkTemplateResult> {
  if (!Number.isInteger(templateId) || templateId <= 0) {
    return { ok: false, error: "template_id_invalid" };
  }

  const existing = await getLoginLinkTemplateById(db, templateId);
  if (!existing) return { ok: false, error: "not_found" };

  const name = input.name !== undefined ? input.name.trim() : existing.name;
  const body = input.body !== undefined ? input.body.trim() : existing.body;
  if (!name) return { ok: false, error: "name_empty" };
  if (!body) return { ok: false, error: "body_empty" };

  const sortOrder =
    input.sort_order !== undefined ? input.sort_order : existing.sort_order;
  const ts = nowIso();

  if (devStoreEnabled) {
    const idx = devTemplates.findIndex((t) => t.id === templateId);
    devTemplates[idx] = {
      ...devTemplates[idx],
      name,
      body,
      sort_order: sortOrder,
      updated_at: ts,
    };
    return { ok: true, template: devTemplates[idx] };
  }

  const result = await db
    .prepare(
      `UPDATE etr_login_link_templates SET name = ?1, body = ?2, sort_order = ?3, updated_at = ?4 WHERE id = ?5`
    )
    .bind(name, body, sortOrder, ts, templateId)
    .run();

  if (!result.meta?.changes) return { ok: false, error: "not_found" };

  const template = await getLoginLinkTemplateById(db, templateId);
  if (!template) return { ok: false, error: "not_found" };
  return { ok: true, template };
}

export type DeleteLoginLinkTemplateResult =
  | { ok: true }
  | { ok: false; error: string };

export async function deleteLoginLinkTemplate(
  db: D1Database,
  templateId: number
): Promise<DeleteLoginLinkTemplateResult> {
  if (!Number.isInteger(templateId) || templateId <= 0) {
    return { ok: false, error: "template_id_invalid" };
  }

  if (devStoreEnabled) {
    const idx = devTemplates.findIndex((t) => t.id === templateId);
    if (idx < 0) return { ok: false, error: "not_found" };
    devTemplates.splice(idx, 1);
    return { ok: true };
  }

  const result = await db
    .prepare(`DELETE FROM etr_login_link_templates WHERE id = ?1`)
    .bind(templateId)
    .run();

  if (!result.meta?.changes) return { ok: false, error: "not_found" };
  return { ok: true };
}
