import { getSessionUser } from "@/lib/etr-auth-db";
import { parseSessionCookie } from "@/lib/etr-auth";
import { getCloudflareEnv } from "@/lib/cloudflare-env";

export async function requireAdmin(request: Request) {
  const env = await getCloudflareEnv();
  const token = parseSessionCookie(request.headers.get("cookie"));
  const user = await getSessionUser(env, token);
  const isAdmin = user?.role === "admin";
  return { env, user, isAdmin };
}
