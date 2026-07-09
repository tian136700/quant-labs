import { getSessionUserFromRequest } from "@/lib/etr-auth-db";
import { canUserOperateJpVocab } from "@/lib/etr-auth";
import { getCloudflareEnv } from "@/lib/cloudflare-env";
import { userHasPermission } from "@/lib/rbac-db";

export async function requireJpVocabAccess(request: Request) {
  const env = await getCloudflareEnv();
  const user = await getSessionUserFromRequest(env, request.headers.get("cookie"));

  let allowed = false;
  if (user) {
    if (await userHasPermission(env.DB, user, "jp_vocab:operate")) {
      allowed = true;
    } else {
      allowed = canUserOperateJpVocab(user);
    }
  }

  return { env, user, allowed };
}

export async function requireJpVocabRead(request: Request) {
  const env = await getCloudflareEnv();
  const user = await getSessionUserFromRequest(env, request.headers.get("cookie"));

  let allowed = false;
  if (user) {
    if (await userHasPermission(env.DB, user, "jp_vocab:read")) {
      allowed = true;
    } else if (await userHasPermission(env.DB, user, "jp_vocab:operate")) {
      allowed = true;
    } else {
      allowed = canUserOperateJpVocab(user);
    }
  }

  return { env, user, allowed };
}

/** 今日日语单词：老师/管理员，或持有 jp_vocab:study 的学生 */
export async function requireJpVocabStudyAccess(request: Request) {
  const env = await getCloudflareEnv();
  const user = await getSessionUserFromRequest(env, request.headers.get("cookie"));

  let allowed = false;
  if (user) {
    if (await userHasPermission(env.DB, user, "jp_vocab:operate")) {
      allowed = true;
    } else if (await userHasPermission(env.DB, user, "jp_vocab:study")) {
      allowed = true;
    } else {
      allowed = canUserOperateJpVocab(user);
    }
  }

  return { env, user, allowed };
}

/** 学生请求老师发送单词 */
export async function requireJpVocabShareRequestCreate(request: Request) {
  const env = await getCloudflareEnv();
  const user = await getSessionUserFromRequest(env, request.headers.get("cookie"));

  let allowed = false;
  if (user) {
    if (await userHasPermission(env.DB, user, "jp_vocab:study")) {
      allowed = true;
    }
  }

  return { env, user, allowed };
}

/** 老师查看/处理学生发送请求 */
export async function requireJpVocabShareRequestTeacher(request: Request) {
  return requireJpVocabAccess(request);
}
