import { handleLoginLinkHandoff } from "@/lib/login-link-handoff";
import { normalizeLoginLinkToken } from "@/lib/login-link-slug";

type RouteParams = { params: Promise<{ username: string; slug: string }> };

/** `/sign-in/{username}/{slug}`：用户名仅便于辨认，鉴权只用 slug */
export async function GET(request: Request, { params }: RouteParams) {
  const { slug } = await params;
  return handleLoginLinkHandoff(request, normalizeLoginLinkToken(slug));
}
