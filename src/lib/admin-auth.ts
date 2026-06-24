import { getSessionUserFromRequest } from "@/lib/etr-auth-db";
import { getCloudflareEnv } from "@/lib/cloudflare-env";
import { userHasPermission } from "@/lib/rbac-db";
import { isAdminSuperuser } from "@/lib/rbac";

export async function requireAdmin(request: Request) {
  const env = await getCloudflareEnv();
  const user = await getSessionUserFromRequest(env, request.headers.get("cookie"));
  const isAdmin = isAdminSuperuser(user?.role);
  return { env, user, isAdmin };
}

export async function requirePermission(
  request: Request,
  permissionKey: string
) {
  const env = await getCloudflareEnv();
  const user = await getSessionUserFromRequest(env, request.headers.get("cookie"));
  const allowed = await userHasPermission(env.DB, user, permissionKey);
  return { env, user, allowed };
}

/** 管理后台任意入口：admin 角色或 admin:dashboard 权限 */
export async function requireAdminArea(request: Request) {
  const env = await getCloudflareEnv();
  const user = await getSessionUserFromRequest(env, request.headers.get("cookie"));
  if (!user) return { env, user, allowed: false };
  if (isAdminSuperuser(user.role)) {
    return { env, user, allowed: true };
  }
  const allowed = await userHasPermission(env.DB, user, "admin:dashboard");
  return { env, user, allowed };
}
