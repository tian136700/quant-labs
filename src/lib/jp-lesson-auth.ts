import { getSessionUserFromRequest } from "@/lib/etr-auth-db";
import { isAdminSuperuser } from "@/lib/rbac";
import { getCloudflareEnv } from "@/lib/cloudflare-env";
import { userHasPermission } from "@/lib/rbac-db";

/** 访客可浏览；已登录用户须具备 jp_lesson:read 或 jp_lesson:operate */
export async function requireJpLessonRead(request: Request) {
  const env = await getCloudflareEnv();
  const user = await getSessionUserFromRequest(env, request.headers.get("cookie"));

  if (!user) {
    return { env, user: null, allowed: true };
  }
  if (isAdminSuperuser(user.role)) {
    return { env, user, allowed: true };
  }

  const allowed =
    (await userHasPermission(env.DB, user, "jp_lesson:read")) ||
    (await userHasPermission(env.DB, user, "jp_lesson:operate"));

  return { env, user, allowed };
}

/** 编辑新课：仅 admin 或 jp_lesson:operate（日语教师角色本身不隐含此权限） */
export async function requireJpLessonOperate(request: Request) {
  const env = await getCloudflareEnv();
  const user = await getSessionUserFromRequest(env, request.headers.get("cookie"));

  if (!user) {
    return { env, user: null, allowed: false };
  }
  if (isAdminSuperuser(user.role)) {
    return { env, user, allowed: true };
  }

  const allowed = await userHasPermission(env.DB, user, "jp_lesson:operate");
  return { env, user, allowed };
}
