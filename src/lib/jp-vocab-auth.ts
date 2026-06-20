import { getSessionUserFromRequest } from "@/lib/etr-auth-db";
import { canUserOperateJpVocab } from "@/lib/etr-auth";
import { getCloudflareEnv } from "@/lib/cloudflare-env";

export async function requireJpVocabAccess(request: Request) {
  const env = await getCloudflareEnv();
  const user = await getSessionUserFromRequest(env, request.headers.get("cookie"));
  const allowed = canUserOperateJpVocab(user);
  return { env, user, allowed };
}
