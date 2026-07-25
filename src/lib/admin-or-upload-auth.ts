import { requireAdmin } from "@/lib/admin-auth";
import { verifyUploadAuth } from "@/lib/jp-review";
import type { EtrUser } from "@/lib/etr-auth";
import type { CloudflareEnv } from "@/lib/types";

/**
 * 管理员 Cookie，或 Mac/Telegram 用的 Bearer JP_REVIEW_UPLOAD_TOKEN。
 * upload token 视为等同 admin（仅限已接此 helper 的写接口）。
 */
export async function requireAdminOrUploadToken(request: Request): Promise<{
  env: CloudflareEnv;
  user: EtrUser | null;
  allowed: boolean;
  viaUploadToken: boolean;
}> {
  const { env, user, isAdmin } = await requireAdmin(request);
  if (isAdmin) {
    return { env, user, allowed: true, viaUploadToken: false };
  }
  if (verifyUploadAuth(request, env)) {
    return { env, user: null, allowed: true, viaUploadToken: true };
  }
  return { env, user, allowed: false, viaUploadToken: false };
}
