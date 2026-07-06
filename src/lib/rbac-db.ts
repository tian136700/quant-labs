import type { EtrUserRole, EtrSessionUser } from "@/lib/etr-auth";
import { listEtrUsers } from "@/lib/etr-auth-db";
import {
  RBAC_ALL_PERMISSION_KEYS,
  RBAC_DEFAULT_ROLE_PERMISSIONS,
  RBAC_JP_TEACHER_EXCLUDED_PERMISSIONS,
  RBAC_MANAGEABLE_ROLES,
  RBAC_PERMISSION_CATALOG,
  isAdminSuperuser,
  type RbacPermissionDef,
} from "@/lib/rbac";

let devRbacEnabled = false;
const devRolePermissions = new Map<EtrUserRole, Set<string>>();
let rbacSeededDone = false;

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
  if ((row?.c ?? 0) > 0) {
    rbacSeededDone = true;
    return;
  }

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
  rbacSeededDone = true;
}

export async function getPermissionsForRole(
  db: D1Database,
  role: EtrUserRole
): Promise<string[]> {
  if (isAdminSuperuser(role)) return [...RBAC_ALL_PERMISSION_KEYS];

  await ensureRbacSeeded(db);

  if (devRbacEnabled) {
    return [...(devRolePermissions.get(role) ?? new Set())];
  }

  const result = await db
    .prepare(
      `SELECT permission_key FROM etr_role_permissions WHERE role = ?1 ORDER BY permission_key ASC`
    )
    .bind(role)
    .all<{ permission_key: string }>();

  return (result.results ?? []).map((r) => r.permission_key);
}

export async function getUserPermissions(
  db: D1Database,
  user: Pick<EtrSessionUser, "role"> | null | undefined
): Promise<string[]> {
  if (!user) return [];
  return getPermissionsForRole(db, user.role as EtrUserRole);
}

export async function userHasPermission(
  db: D1Database,
  user: Pick<{ role: EtrUserRole }, "role"> | null | undefined,
  permissionKey: string
): Promise<boolean> {
  if (!user) return false;
  if (isAdminSuperuser(user.role)) return true;
  const perms = await getPermissionsForRole(db, user.role as EtrUserRole);
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
    const permissions = await getPermissionsForRole(db, user.role as EtrUserRole);
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
  const roles: EtrUserRole[] = ["admin", "jp_vocab", "en_vocab", "user"];
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
  cleaned.sort();

  if (devRbacEnabled) {
    devRolePermissions.set(role, new Set(cleaned));
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
};

export async function enrichSessionUser(
  db: D1Database,
  user: EtrSessionUser
): Promise<SessionUserWithPermissions> {
  const permissions = await getUserPermissions(db, user);
  const can_operate_jp_vocab =
    isAdminSuperuser(user.role) || permissions.includes("jp_vocab:operate");
  const can_operate_en_vocab =
    isAdminSuperuser(user.role) ||
    permissions.includes("en_vocab:operate") ||
    permissions.includes("en_lesson:operate");
  return { ...user, permissions, can_operate_jp_vocab, can_operate_en_vocab };
}
