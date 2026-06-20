import { getSessionUserFromRequest } from "@/lib/etr-auth-db";
import { getCloudflareEnv } from "@/lib/cloudflare-env";

export async function requireAdmin(request: Request) {
  const env = await getCloudflareEnv();
  const user = await getSessionUserFromRequest(env, request.headers.get("cookie"));
  const isAdmin = user?.role === "admin";
  return { env, user, isAdmin };
}
