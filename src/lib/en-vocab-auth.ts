import { getSessionUserFromRequest } from "@/lib/etr-auth-db";
import { canUserOperateEnVocab } from "@/lib/etr-auth";
import { getCloudflareEnv } from "@/lib/cloudflare-env";
import { userHasPermission } from "@/lib/rbac-db";

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

/** 今日背英语单词：仅 Admin / 英语老师（en_vocab 角色） */
export async function requireEnVocabStudyAccess(request: Request) {
  const env = await getCloudflareEnv();
  const user = await getSessionUserFromRequest(env, request.headers.get("cookie"));

  let allowed = false;
  if (user) {
    if (await userHasPermission(env.DB, user, "en_vocab:operate")) {
      allowed = true;
    } else {
      allowed = canUserOperateEnVocab(user);
    }
  }

  return { env, user, allowed };
}

export async function requireEnLessonOperate(request: Request) {
  const env = await getCloudflareEnv();
  const user = await getSessionUserFromRequest(env, request.headers.get("cookie"));
  const allowed = user
    ? (await userHasPermission(env.DB, user, "en_lesson:operate")) ||
      canUserOperateEnVocab(user)
    : false;
  return { env, user, allowed };
}
