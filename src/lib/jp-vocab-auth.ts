import { getSessionUser } from "@/lib/etr-auth-db";
import { canAccessJpVocab, parseSessionCookie } from "@/lib/etr-auth";
import { getCloudflareEnv } from "@/lib/cloudflare-env";

export async function requireJpVocabAccess(request: Request) {
  const env = await getCloudflareEnv();
  const token = parseSessionCookie(request.headers.get("cookie"));
  const user = await getSessionUser(env, token);
  const allowed = canAccessJpVocab(user?.role);
  return { env, user, allowed };
}
