import { generateToolDotCode, normalizeToolDotCode } from "./code-gen";
import { toolMatchesCode } from "./tools";
import type {
  ClaimToolDotCodeResult,
  CreateToolDotCodesInput,
  CreateToolDotCodesResult,
  ToolDotCodeRecord,
  ToolDotType,
} from "./types";
import { TOOL_DOT_TYPES } from "./types";

let devStoreEnabled = false;
const devCodes: ToolDotCodeRecord[] = [];
let devCodeIdSeq = 1;

export function enableToolDotDevStore() {
  devStoreEnabled = true;
}

function nowIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function isToolType(value: string): value is ToolDotType {
  return (TOOL_DOT_TYPES as readonly string[]).includes(value);
}

async function ensureSchema(db: D1Database): Promise<void> {
  if (devStoreEnabled) return;
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS tool_dot_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE COLLATE NOCASE,
        tool_type TEXT NOT NULL,
        label TEXT,
        consumed_at TEXT,
        consumed_ip TEXT,
        consumed_filename TEXT,
        created_by_admin_id INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`
    )
    .run();
  await db
    .prepare(
      `CREATE INDEX IF NOT EXISTS idx_tool_dot_codes_consumed ON tool_dot_codes (consumed_at)`
    )
    .run();
}

function rowToRecord(row: Record<string, unknown>): ToolDotCodeRecord {
  return {
    id: Number(row.id),
    code: String(row.code),
    tool_type: String(row.tool_type) as ToolDotType,
    label: row.label != null ? String(row.label) : null,
    consumed_at: row.consumed_at != null ? String(row.consumed_at) : null,
    consumed_ip: row.consumed_ip != null ? String(row.consumed_ip) : null,
    consumed_filename:
      row.consumed_filename != null ? String(row.consumed_filename) : null,
    created_by_admin_id:
      row.created_by_admin_id != null ? Number(row.created_by_admin_id) : null,
    created_at: String(row.created_at),
  };
}

async function codeExists(db: D1Database, code: string): Promise<boolean> {
  if (devStoreEnabled) {
    return devCodes.some(
      (item) => item.code.toUpperCase() === code.toUpperCase()
    );
  }
  const row = await db
    .prepare(`SELECT code FROM tool_dot_codes WHERE code = ?1 COLLATE NOCASE LIMIT 1`)
    .bind(code)
    .first<{ code: string }>();
  return Boolean(row?.code);
}

export async function createToolDotCodes(
  db: D1Database,
  input: CreateToolDotCodesInput
): Promise<CreateToolDotCodesResult> {
  await ensureSchema(db);

  if (!isToolType(input.tool_type)) {
    return { ok: false, error: "invalid_tool_type" };
  }

  const count = Math.min(Math.max(Math.floor(input.count), 1), 50);
  const label = (input.label || "").trim() || null;
  const created: string[] = [];
  const ts = nowIso();

  for (let i = 0; i < count; i++) {
    let code = generateToolDotCode();
    let attempts = 0;
    while ((await codeExists(db, code)) && attempts < 8) {
      code = generateToolDotCode();
      attempts++;
    }
    if (attempts >= 8) {
      return { ok: false, error: "code_collision" };
    }

    if (devStoreEnabled) {
      devCodes.unshift({
        id: devCodeIdSeq++,
        code,
        tool_type: input.tool_type,
        label,
        consumed_at: null,
        consumed_ip: null,
        consumed_filename: null,
        created_by_admin_id: input.admin_id,
        created_at: ts,
      });
    } else {
      await db
        .prepare(
          `INSERT INTO tool_dot_codes (code, tool_type, label, created_by_admin_id, created_at)
           VALUES (?1, ?2, ?3, ?4, ?5)`
        )
        .bind(code, input.tool_type, label, input.admin_id, ts)
        .run();
    }
    created.push(code);
  }

  return { ok: true, codes: created };
}

export async function listToolDotCodes(
  db: D1Database,
  status: "all" | "unused" | "used" = "all",
  limit = 100
): Promise<ToolDotCodeRecord[]> {
  await ensureSchema(db);
  const safeLimit = Math.min(Math.max(limit, 1), 200);

  if (devStoreEnabled) {
    let rows = [...devCodes];
    if (status === "unused") rows = rows.filter((r) => !r.consumed_at);
    if (status === "used") rows = rows.filter((r) => r.consumed_at);
    return rows.slice(0, safeLimit);
  }

  let sql = `SELECT * FROM tool_dot_codes`;
  if (status === "unused") sql += ` WHERE consumed_at IS NULL`;
  if (status === "used") sql += ` WHERE consumed_at IS NOT NULL`;
  sql += ` ORDER BY id DESC LIMIT ?1`;

  const result = await db.prepare(sql).bind(safeLimit).all<Record<string, unknown>>();
  return (result.results ?? []).map(rowToRecord);
}

export async function deleteUnusedToolDotCode(
  db: D1Database,
  id: number
): Promise<{ ok: boolean; error?: string }> {
  await ensureSchema(db);

  if (devStoreEnabled) {
    const idx = devCodes.findIndex((r) => r.id === id && !r.consumed_at);
    if (idx < 0) return { ok: false, error: "not_found" };
    devCodes.splice(idx, 1);
    return { ok: true };
  }

  const result = await db
    .prepare(
      `DELETE FROM tool_dot_codes WHERE id = ?1 AND consumed_at IS NULL`
    )
    .bind(id)
    .run();

  if (!result.meta?.changes) return { ok: false, error: "not_found" };
  return { ok: true };
}

export async function claimToolDotCode(
  db: D1Database,
  rawCode: string,
  toolType: ToolDotType,
  ip: string | null,
  filename: string | null
): Promise<ClaimToolDotCodeResult> {
  await ensureSchema(db);

  const code = normalizeToolDotCode(rawCode);
  if (!code || code.length < 8) {
    return { ok: false, error: "code_invalid" };
  }
  if (!isToolType(toolType) || toolType === "any") {
    return { ok: false, error: "tool_invalid" };
  }

  if (devStoreEnabled) {
    const row = devCodes.find(
      (r) => r.code.toUpperCase() === code && !r.consumed_at
    );
    if (!row) return { ok: false, error: "code_not_found" };
    if (!toolMatchesCode(toolType, row.tool_type)) {
      return { ok: false, error: "tool_mismatch" };
    }
    row.consumed_at = nowIso();
    row.consumed_ip = ip;
    row.consumed_filename = filename;
    return { ok: true };
  }

  const existing = await db
    .prepare(`SELECT * FROM tool_dot_codes WHERE code = ?1 COLLATE NOCASE LIMIT 1`)
    .bind(code)
    .first<Record<string, unknown>>();

  if (!existing) return { ok: false, error: "code_not_found" };
  if (existing.consumed_at) return { ok: false, error: "code_used" };

  const codeToolType = String(existing.tool_type) as ToolDotType;
  if (!toolMatchesCode(toolType, codeToolType)) {
    return { ok: false, error: "tool_mismatch" };
  }

  const ts = nowIso();
  const result = await db
    .prepare(
      `UPDATE tool_dot_codes
       SET consumed_at = ?1, consumed_ip = ?2, consumed_filename = ?3
       WHERE id = ?4 AND consumed_at IS NULL`
    )
    .bind(ts, ip, filename, existing.id)
    .run();

  if (!result.meta?.changes) return { ok: false, error: "code_used" };
  return { ok: true };
}
