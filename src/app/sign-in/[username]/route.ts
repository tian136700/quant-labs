import { handleLoginLinkHandoff } from "@/lib/login-link-handoff";
import { normalizeLoginLinkToken } from "@/lib/login-link-slug";

type RouteParams = { params: Promise<{ username: string }> };

/**
 * 旧链接 `/sign-in/{slug}`：单段路径。
 * 段名必须与 `/sign-in/[username]/[slug]` 第一段同名（Next 禁止 slug !== username）。
 * 此处 param 实际是 slug，仅鉴权用。
 */
export async function GET(request: Request, { params }: RouteParams) {
  const { username: slug } = await params;
  return handleLoginLinkHandoff(request, normalizeLoginLinkToken(slug));
}
