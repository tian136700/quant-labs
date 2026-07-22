import { requirePermission } from "@/lib/admin-auth";
import {
  catalogForClient,
  ensureRbacSeeded,
  listRbacMatrix,
  listUsersWithPermissions,
  updateRolePermissions,
} from "@/lib/rbac-db";
import type { EtrUserRole } from "@/lib/etr-auth";
import { getCloudflareEnv, jsonResponse, localeFromRequest } from "@/lib/cloudflare-env";

const ERR: Record<string, Record<"en" | "zh", string>> = {
  forbidden: {
    en: "Admin permission required.",
    zh: "需要管理员权限。",
  },
  admin_role_locked: {
    en: "Admin role always has full access and cannot be edited.",
    zh: "管理员角色始终拥有全部权限，不可编辑。",
  },
  role_not_manageable: {
    en: "This role cannot be managed.",
    zh: "该角色不可配置。",
  },
  role_invalid: {
    en: "Invalid role.",
    zh: "无效的角色。",
  },
  permissions_invalid: {
    en: "Invalid permissions payload.",
    zh: "权限数据无效。",
  },
};

function errMsg(key: string, locale: "en" | "zh"): string {
  return ERR[key]?.[locale] ?? ERR[key]?.en ?? key;
}

export async function GET(request: Request) {
  const locale = localeFromRequest(request);
  try {
    const { allowed } = await requirePermission(request, "admin:rbac");
    if (!allowed) {
      return jsonResponse({ ok: false, error: errMsg("forbidden", locale) }, 403);
    }

    const env = await getCloudflareEnv();
    await ensureRbacSeeded(env.DB);
    const [matrix, catalog, users] = await Promise.all([
      listRbacMatrix(env.DB),
      Promise.resolve(catalogForClient()),
      listUsersWithPermissions(env.DB),
    ]);

    return jsonResponse({ ok: true, matrix, catalog, users });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}

export async function PUT(request: Request) {
  const locale = localeFromRequest(request);
  try {
    const { env, allowed } = await requirePermission(request, "admin:rbac");
    if (!allowed) {
      return jsonResponse({ ok: false, error: errMsg("forbidden", locale) }, 403);
    }

    let body: { role?: string; permissions?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return jsonResponse(
        { ok: false, error: errMsg("permissions_invalid", locale) },
        400
      );
    }

    const role = String(body.role || "").trim() as EtrUserRole;
    if (role !== "jp_vocab" && role !== "en_vocab" && role !== "ko_pron" && role !== "user") {
      return jsonResponse({ ok: false, error: errMsg("role_invalid", locale) }, 400);
    }

    if (!Array.isArray(body.permissions)) {
      return jsonResponse(
        { ok: false, error: errMsg("permissions_invalid", locale) },
        400
      );
    }

    const permissionKeys = body.permissions.filter(
      (p): p is string => typeof p === "string"
    );

    const result = await updateRolePermissions(env.DB, role, permissionKeys);
    if (!result.ok) {
      const status = result.error === "admin_role_locked" ? 400 : 400;
      return jsonResponse(
        { ok: false, error: errMsg(result.error, locale) },
        status
      );
    }

    return jsonResponse({
      ok: true,
      role: result.role,
      permissions: result.permissions,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
