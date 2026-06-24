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
    } else if (await userHasPermission(env.DB, user, "jp_lesson:operate")) {
      allowed = true;
    } else {
      allowed = canUserOperateJpVocab(user);
    }
  }

  return { env, user, allowed };
}

export async function requireJpLessonOperate(request: Request) {
  const env = await getCloudflareEnv();
  const user = await getSessionUserFromRequest(env, request.headers.get("cookie"));
  const allowed = user
    ? (await userHasPermission(env.DB, user, "jp_lesson:operate")) ||
      canUserOperateJpVocab(user)
    : false;
  return { env, user, allowed };
}
