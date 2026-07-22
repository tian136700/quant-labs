import { getSessionUserFromRequest } from "@/lib/etr-auth-db";
import { canAccessKoPronStudy, canUserOperateKoPron } from "@/lib/etr-auth";
import { getCloudflareEnv } from "@/lib/cloudflare-env";
import { isAdminSuperuser } from "@/lib/rbac";
import { getUserPermissions, userHasPermission } from "@/lib/rbac-db";

export async function requireKoPronAccess(request: Request) {
  const env = await getCloudflareEnv();
  const user = await getSessionUserFromRequest(env, request.headers.get("cookie"));

  let allowed = false;
  if (user) {
    if (await userHasPermission(env.DB, user, "ko_pron:operate")) {
      allowed = true;
    } else if (await userHasPermission(env.DB, user, "ko_pron:teacher")) {
      allowed = true;
    } else {
      allowed = canUserOperateKoPron(user);
    }
  }

  return { env, user, allowed };
}

export async function requireKoPronRead(request: Request) {
  const env = await getCloudflareEnv();
  const user = await getSessionUserFromRequest(env, request.headers.get("cookie"));

  let allowed = false;
  if (user) {
    if (await userHasPermission(env.DB, user, "ko_pron:read")) {
      allowed = true;
    } else if (await userHasPermission(env.DB, user, "ko_pron:operate")) {
      allowed = true;
    } else if (await userHasPermission(env.DB, user, "ko_pron:teacher")) {
      allowed = true;
    } else if (await userHasPermission(env.DB, user, "ko_pron:admin")) {
      allowed = true;
    } else {
      allowed = canUserOperateKoPron(user);
    }
  }

  return { env, user, allowed };
}

/** 韩语发音勾选 / 抽问管理员端：admin 或 ko_pron:admin */
export async function requireKoPronAdmin(request: Request) {
  const env = await getCloudflareEnv();
  const user = await getSessionUserFromRequest(env, request.headers.get("cookie"));

  let allowed = false;
  if (user) {
    if (isAdminSuperuser(user.role)) {
      allowed = true;
    } else {
      allowed = await userHasPermission(env.DB, user, "ko_pron:admin");
    }
  }

  return { env, user, allowed };
}

/** 今日韩语发音学生端 */
export async function requireKoPronStudyAccess(request: Request) {
  const env = await getCloudflareEnv();
  const user = await getSessionUserFromRequest(env, request.headers.get("cookie"));

  let allowed = false;
  if (user) {
    if (isAdminSuperuser(user.role)) {
      allowed = true;
    } else {
      const perms = await getUserPermissions(env.DB, user);
      allowed = canAccessKoPronStudy({ ...user, permissions: perms });
    }
  }

  return { env, user, allowed };
}
