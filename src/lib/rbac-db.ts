import type { EtrUserRole, EtrSessionUser } from "@/lib/etr-auth";
import { listEtrUsers } from "@/lib/etr-auth-db";
import {
  RBAC_ALL_PERMISSION_KEYS,
  RBAC_DEFAULT_ROLE_PERMISSIONS,
  RBAC_JP_TEACHER_EXCLUDED_PERMISSIONS,
  RBAC_EN_TEACHER_EXCLUDED_PERMISSIONS,
  RBAC_KO_TEACHER_EXCLUDED_PERMISSIONS,
  RBAC_USER_EXCLUDED_PERMISSIONS,
  RBAC_MANAGEABLE_ROLES,
  RBAC_PERMISSION_CATALOG,
  detectTeacherModules,
  isAdminSuperuser,
  type RbacPermissionDef,
  type RbacTeacherModules,
} from "@/lib/rbac";

let devRbacEnabled = false;
const devRolePermissions = new Map<EtrUserRole, Set<string>>();
/** user_id → extra permission keys */
const devUserExtraPermissions = new Map<number, Set<string>>();
let rbacSeededDone = false;
/** 同一 Worker isolate 内缓存角色权限，避免高频 API 轮询重复查 D1 */
const rolePermissionsCache = new Map<EtrUserRole, string[]>();
let userExtraSchemaEnsured = false;

export function enableRbacDevStore() {
  devRbacEnabled = true;
  if (devRolePermissions.size === 0) {
    seedDevRolePermissions();
  }
}

function seedDevRolePermissions() {
  for (const role of Object.keys(RBAC_DEFAULT_ROLE_PERMISSIONS) as EtrUserRole[]) {
    devRolePermissions.set(
      role,
      new Set(RBAC_DEFAULT_ROLE_PERMISSIONS[role])
    );
  }
}

function nowIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

async function ensureRbacSchema(db: D1Database): Promise<void> {
  if (devRbacEnabled) return;
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS etr_role_permissions (
         role           TEXT NOT NULL,
         permission_key TEXT NOT NULL,
         created_at     TEXT NOT NULL DEFAULT (datetime('now')),
         PRIMARY KEY (role, permission_key)
       )`
    )
    .run();
  await db
    .prepare(
      `CREATE INDEX IF NOT EXISTS idx_etr_role_permissions_role
       ON etr_role_permissions (role)`
    )
    .run();
}

async function ensureUserExtraPermissionsSchema(db: D1Database): Promise<void> {
  if (devRbacEnabled || userExtraSchemaEnsured) return;
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS etr_user_extra_permissions (
         user_id        INTEGER NOT NULL,
         permission_key TEXT NOT NULL,
         created_at     TEXT NOT NULL DEFAULT (datetime('now')),
         PRIMARY KEY (user_id, permission_key),
         FOREIGN KEY (user_id) REFERENCES etr_users(id) ON DELETE CASCADE
       )`
    )
    .run();
  await db
    .prepare(
      `CREATE INDEX IF NOT EXISTS idx_etr_user_extra_permissions_user
       ON etr_user_extra_permissions (user_id)`
    )
    .run();
  userExtraSchemaEnsured = true;
}

/** 用户额外权限（叠加在角色默认之上；用于「日语老师 + 韩语老师」等） */
export async function listUserExtraPermissions(
  db: D1Database,
  userId: number
): Promise<string[]> {
  if (!Number.isInteger(userId) || userId <= 0) return [];
  if (devRbacEnabled) {
    return [...(devUserExtraPermissions.get(userId) ?? [])].sort();
  }
  await ensureUserExtraPermissionsSchema(db);
  const result = await db
    .prepare(
      `SELECT permission_key FROM etr_user_extra_permissions
       WHERE user_id = ?1 ORDER BY permission_key ASC`
    )
    .bind(userId)
    .all<{ permission_key: string }>();
  return (result.results ?? []).map((r) => r.permission_key);
}

export async function setUserExtraPermissions(
  db: D1Database,
  userId: number,
  permissions: readonly string[]
): Promise<void> {
  if (!Number.isInteger(userId) || userId <= 0) return;
  const cleaned = [
    ...new Set(
      permissions
        .map((p) => String(p ?? "").trim())
        .filter((p) => p && RBAC_ALL_PERMISSION_KEYS.includes(p))
    ),
  ].sort();

  if (devRbacEnabled) {
    if (!cleaned.length) {
      devUserExtraPermissions.delete(userId);
    } else {
      devUserExtraPermissions.set(userId, new Set(cleaned));
    }
    return;
  }

  await ensureUserExtraPermissionsSchema(db);
  const ts = nowIso();
  const statements: D1PreparedStatement[] = [
    db
      .prepare(`DELETE FROM etr_user_extra_permissions WHERE user_id = ?1`)
      .bind(userId),
  ];
  for (const permission of cleaned) {
    statements.push(
      db
        .prepare(
          `INSERT INTO etr_user_extra_permissions (user_id, permission_key, created_at)
           VALUES (?1, ?2, ?3)`
        )
        .bind(userId, permission, ts)
    );
  }
  await db.batch(statements);
}

export async function listUserExtraPermissionsMap(
  db: D1Database
): Promise<Map<number, string[]>> {
  const map = new Map<number, string[]>();
  if (devRbacEnabled) {
    for (const [userId, set] of devUserExtraPermissions) {
      map.set(userId, [...set].sort());
    }
    return map;
  }
  await ensureUserExtraPermissionsSchema(db);
  const result = await db
    .prepare(
      `SELECT user_id, permission_key FROM etr_user_extra_permissions
       ORDER BY user_id ASC, permission_key ASC`
    )
    .all<{ user_id: number; permission_key: string }>();
  for (const row of result.results ?? []) {
    const userId = Number(row.user_id);
    if (!Number.isInteger(userId) || userId <= 0) continue;
    const list = map.get(userId) ?? [];
    list.push(String(row.permission_key));
    map.set(userId, list);
  }
  return map;
}

export async function getTeacherModulesForUser(
  db: D1Database,
  user: Pick<EtrSessionUser, "id" | "role">
): Promise<RbacTeacherModules> {
  const extras = await listUserExtraPermissions(db, user.id);
  return detectTeacherModules(user.role, extras);
}

/**
 * 表已有数据时只补「新增默认键」（禁止全量 INSERT OR IGNORE → 冷 isolate 1102）。
 * 增权限时往这里追加一行即可。
 */
const RBAC_INCREMENTAL_DEFAULTS: Array<{
  role: EtrUserRole;
  permission: string;
}> = [
  /** newest sentinel first — 表已有数据时用首项探测是否还需补缺 */
  { role: "ko_pron", permission: "ko_pron:teacher" },
  { role: "ko_pron", permission: "ko_pron:read" },
  { role: "ko_pron", permission: "ko_pron:operate" },
  { role: "ko_pron", permission: "nav:ko_teacher" },
  { role: "en_vocab", permission: "en_vocab:teacher" },
  { role: "jp_vocab", permission: "jp_vocab:teacher" },
];

/**
 * 普通用户 / 日语老师默认不得持有韩语学生端（曾误写入需清掉）。
 * 需要时由管理员在「角色权限」里单独勾选 ko_pron:study。
 */
async function revokeDefaultKoPronStudyFromPublicRoles(
  db: D1Database
): Promise<void> {
  await db
    .prepare(
      `DELETE FROM etr_role_permissions
       WHERE permission_key = 'ko_pron:study'
         AND role IN ('user', 'jp_vocab', 'en_vocab')`
    )
    .run();
}

/**
 * 「关于与反馈」仅管理员可见：清掉非 admin 角色默认与个人额外权限里的 about:view。
 */
async function revokeAboutViewFromNonAdminRoles(
  db: D1Database
): Promise<void> {
  await db
    .prepare(
      `DELETE FROM etr_role_permissions
       WHERE permission_key = 'about:view'
         AND role IN ('user', 'jp_vocab', 'en_vocab', 'ko_pron')`
    )
    .run();
  await db
    .prepare(
      `DELETE FROM etr_user_extra_permissions
       WHERE permission_key = 'about:view'`
    )
    .run();
}

export async function ensureRbacSeeded(db: D1Database): Promise<void> {
  if (devRbacEnabled) {
    if (devRolePermissions.size === 0) seedDevRolePermissions();
    return;
  }

  if (rbacSeededDone) return;

  await ensureRbacSchema(db);

  const row = await db
    .prepare(`SELECT COUNT(*) AS c FROM etr_role_permissions`)
    .first<{ c: number }>();
  if ((row?.c ?? 0) === 0) {
    // 空表：一次性写入默认矩阵
    const ts = nowIso();
    const inserts: D1PreparedStatement[] = [];
    for (const role of Object.keys(RBAC_DEFAULT_ROLE_PERMISSIONS) as EtrUserRole[]) {
      for (const permission of RBAC_DEFAULT_ROLE_PERMISSIONS[role]) {
        inserts.push(
          db
            .prepare(
              `INSERT OR IGNORE INTO etr_role_permissions (role, permission_key, created_at)
               VALUES (?1, ?2, ?3)`
            )
            .bind(role, permission, ts)
        );
      }
    }
    if (inserts.length) await db.batch(inserts);
  } else {
    // 已有数据：只补缺新增键（1 次 SELECT + 至多几条 INSERT）
    await backfillIncrementalDefaultPermissions(db);
  }

  // 普通用户 / 日语·英语老师默认看不到韩语学生端
  await revokeDefaultKoPronStudyFromPublicRoles(db);
  // 关于页仅管理员
  await revokeAboutViewFromNonAdminRoles(db);
  rolePermissionsCache.clear();

  rbacSeededDone = true;
}

async function backfillIncrementalDefaultPermissions(
  db: D1Database
): Promise<void> {
  if (devRbacEnabled || RBAC_INCREMENTAL_DEFAULTS.length === 0) return;

  const sentinel = RBAC_INCREMENTAL_DEFAULTS[0];
  const exists = await db
    .prepare(
      `SELECT 1 AS ok FROM etr_role_permissions
       WHERE role = ?1 AND permission_key = ?2 LIMIT 1`
    )
    .bind(sentinel.role, sentinel.permission)
    .first<{ ok: number }>();
  if (exists) return;

  const ts = nowIso();
  const inserts = RBAC_INCREMENTAL_DEFAULTS.map(({ role, permission }) =>
    db
      .prepare(
        `INSERT OR IGNORE INTO etr_role_permissions (role, permission_key, created_at)
         VALUES (?1, ?2, ?3)`
      )
      .bind(role, permission, ts)
  );
  if (inserts.length) await db.batch(inserts);
  rolePermissionsCache.clear();
}

export async function getPermissionsForRole(
  db: D1Database,
  role: EtrUserRole
): Promise<string[]> {
  if (isAdminSuperuser(role)) return [...RBAC_ALL_PERMISSION_KEYS];

  const cached = rolePermissionsCache.get(role);
  if (cached) return cached;

  await ensureRbacSeeded(db);

  if (devRbacEnabled) {
    const perms = [...(devRolePermissions.get(role) ?? new Set())];
    rolePermissionsCache.set(role, perms);
    return perms;
  }

  const result = await db
    .prepare(
      `SELECT permission_key FROM etr_role_permissions WHERE role = ?1 ORDER BY permission_key ASC`
    )
    .bind(role)
    .all<{ permission_key: string }>();

  const perms = (result.results ?? []).map((r) => r.permission_key);
  rolePermissionsCache.set(role, perms);
  return perms;
}

export async function getUserPermissions(
  db: D1Database,
  user: Pick<EtrSessionUser, "role" | "id"> | null | undefined
): Promise<string[]> {
  if (!user) return [];
  if (isAdminSuperuser(user.role)) {
    return getPermissionsForRole(db, user.role as EtrUserRole);
  }
  const rolePerms = await getPermissionsForRole(db, user.role as EtrUserRole);
  const userId = Number(user.id);
  if (!Number.isInteger(userId) || userId <= 0) return rolePerms;
  const extras = await listUserExtraPermissions(db, userId);
  if (!extras.length) return rolePerms;
  return [...new Set([...rolePerms, ...extras])].sort();
}

export async function userHasPermission(
  db: D1Database,
  user: Pick<EtrSessionUser, "role" | "id"> | null | undefined,
  permissionKey: string
): Promise<boolean> {
  if (!user) return false;
  if (isAdminSuperuser(user.role)) return true;
  const perms = await getUserPermissions(db, user);
  return perms.includes(permissionKey);
}

export type RbacUserRow = {
  id: number;
  username: string;
  role: EtrUserRole;
  created_at: string;
  permissions: string[];
};

export async function listUsersWithPermissions(
  db: D1Database
): Promise<RbacUserRow[]> {
  await ensureRbacSeeded(db);
  const users = await listEtrUsers(db);
  const rows: RbacUserRow[] = [];
  for (const user of users) {
    const permissions = await getUserPermissions(db, user);
    rows.push({
      id: user.id,
      username: user.username,
      role: user.role as EtrUserRole,
      created_at: user.created_at,
      permissions,
    });
  }
  return rows;
}

export type RbacRoleMatrix = {
  role: EtrUserRole;
  permissions: string[];
  manageable: boolean;
};

export async function listRbacMatrix(db: D1Database): Promise<RbacRoleMatrix[]> {
  await ensureRbacSeeded(db);
  const roles: EtrUserRole[] = ["admin", "jp_vocab", "en_vocab", "ko_pron", "user"];
  const matrix: RbacRoleMatrix[] = [];
  for (const role of roles) {
    matrix.push({
      role,
      permissions: await getPermissionsForRole(db, role),
      manageable: RBAC_MANAGEABLE_ROLES.includes(role),
    });
  }
  return matrix;
}

export type UpdateRbacRoleResult =
  | { ok: true; role: EtrUserRole; permissions: string[] }
  | { ok: false; error: string };

export async function updateRolePermissions(
  db: D1Database,
  role: EtrUserRole,
  permissionKeys: string[]
): Promise<UpdateRbacRoleResult> {
  if (role === "admin") {
    return { ok: false, error: "admin_role_locked" };
  }
  if (!RBAC_MANAGEABLE_ROLES.includes(role)) {
    return { ok: false, error: "role_not_manageable" };
  }

  const allowed = new Set(RBAC_ALL_PERMISSION_KEYS);
  let cleaned = [...new Set(permissionKeys.filter((k) => allowed.has(k)))];
  if (role === "jp_vocab") {
    const excluded = new Set<string>(RBAC_JP_TEACHER_EXCLUDED_PERMISSIONS);
    cleaned = cleaned.filter((k) => !excluded.has(k));
  }
  if (role === "en_vocab") {
    const excluded = new Set<string>(RBAC_EN_TEACHER_EXCLUDED_PERMISSIONS);
    cleaned = cleaned.filter((k) => !excluded.has(k));
  }
  if (role === "ko_pron") {
    const excluded = new Set<string>(RBAC_KO_TEACHER_EXCLUDED_PERMISSIONS);
    cleaned = cleaned.filter((k) => !excluded.has(k));
  }
  if (role === "user") {
    const excluded = new Set<string>(RBAC_USER_EXCLUDED_PERMISSIONS);
    cleaned = cleaned.filter((k) => !excluded.has(k));
  }
  cleaned.sort();

  if (devRbacEnabled) {
    devRolePermissions.set(role, new Set(cleaned));
    rolePermissionsCache.set(role, cleaned);
    return { ok: true, role, permissions: cleaned };
  }

  const ts = nowIso();
  const statements: D1PreparedStatement[] = [
    db.prepare(`DELETE FROM etr_role_permissions WHERE role = ?1`).bind(role),
  ];

  for (const permission of cleaned) {
    statements.push(
      db
        .prepare(
          `INSERT INTO etr_role_permissions (role, permission_key, created_at)
           VALUES (?1, ?2, ?3)`
        )
        .bind(role, permission, ts)
    );
  }

  if (statements.length) await db.batch(statements);

  rolePermissionsCache.set(role, cleaned);
  return { ok: true, role, permissions: cleaned };
}

export function catalogForClient(): RbacPermissionDef[] {
  return RBAC_PERMISSION_CATALOG;
}

/** 会话用户 + 权限列表（供 API / 客户端） */
export type SessionUserWithPermissions = EtrSessionUser & {
  permissions: string[];
  can_operate_jp_vocab: boolean;
  can_operate_en_vocab: boolean;
  can_operate_ko_pron: boolean;
};

export async function enrichSessionUser(
  db: D1Database,
  user: EtrSessionUser
): Promise<SessionUserWithPermissions> {
  const permissions = await getUserPermissions(db, user);
  const can_operate_jp_vocab =
    isAdminSuperuser(user.role) ||
    permissions.includes("jp_vocab:operate") ||
    permissions.includes("jp_vocab:teacher");
  const can_operate_en_vocab =
    isAdminSuperuser(user.role) ||
    permissions.includes("en_vocab:operate") ||
    permissions.includes("en_vocab:teacher") ||
    permissions.includes("en_lesson:operate");
  const can_operate_ko_pron =
    isAdminSuperuser(user.role) ||
    permissions.includes("ko_pron:operate") ||
    permissions.includes("ko_pron:teacher");
  return {
    ...user,
    permissions,
    can_operate_jp_vocab,
    can_operate_en_vocab,
    can_operate_ko_pron,
  };
}
