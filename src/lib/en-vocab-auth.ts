import { getSessionUserFromRequest } from "@/lib/etr-auth-db";
import { canUserOperateEnVocab } from "@/lib/etr-auth";
import { getCloudflareEnv } from "@/lib/cloudflare-env";
import { isAdminSuperuser } from "@/lib/rbac";
import { getUserPermissions, userHasPermission } from "@/lib/rbac-db";

export async function requireEnVocabAccess(request: Request) {
  const env = await getCloudflareEnv();
  const user = await getSessionUserFromRequest(env, request.headers.get("cookie"));

  let allowed = false;
  if (user) {
    if (await userHasPermission(env.DB, user, "en_vocab:operate")) {
      allowed = true;
    } else if (await userHasPermission(env.DB, user, "en_lesson:operate")) {
      allowed = true;
    } else {
      allowed = canUserOperateEnVocab(user);
    }
  }

  return { env, user, allowed };
}

export async function requireEnVocabRead(request: Request) {
  const env = await getCloudflareEnv();
  const user = await getSessionUserFromRequest(env, request.headers.get("cookie"));

  let allowed = false;
  if (user) {
    if (await userHasPermission(env.DB, user, "en_vocab:read")) {
      allowed = true;
    } else if (await userHasPermission(env.DB, user, "en_vocab:operate")) {
      allowed = true;
    } else if (await userHasPermission(env.DB, user, "en_lesson:operate")) {
      allowed = true;
    } else {
      allowed = canUserOperateEnVocab(user);
    }
  }

  return { env, user, allowed };
}

/**
 * 今日英语单词：管理员，或持有 en_vocab:study 的学生（英语老师不可访问）。
 * 对齐 requireJpVocabStudyAccess。
 */
export async function requireEnVocabStudyAccess(request: Request) {
  const env = await getCloudflareEnv();
  const user = await getSessionUserFromRequest(env, request.headers.get("cookie"));

  let allowed = false;
  if (user) {
    if (isAdminSuperuser(user.role)) {
      allowed = true;
    } else {
      const perms = await getUserPermissions(env.DB, user);
      allowed =
        perms.includes("en_vocab:study") &&
        !perms.includes("en_vocab:operate") &&
        !perms.includes("en_vocab:teacher") &&
        !canUserOperateEnVocab(user);
    }
  }

  return { env, user, allowed };
}

/** 英语新课写操作：须 en_lesson:operate（不再用英语抽背老师角色兜底） */
export async function requireEnLessonOperate(request: Request) {
  const env = await getCloudflareEnv();
  const user = await getSessionUserFromRequest(env, request.headers.get("cookie"));
  const allowed = user
    ? await userHasPermission(env.DB, user, "en_lesson:operate")
    : false;
  return { env, user, allowed };
}
