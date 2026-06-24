import { handleLoginLinkHandoff } from "@/lib/login-link-handoff";
import { normalizeLoginLinkToken } from "@/lib/login-link-slug";

type RouteParams = { params: Promise<{ slug: string }> };

export async function GET(request: Request, { params }: RouteParams) {
  const { slug } = await params;
  return handleLoginLinkHandoff(request, normalizeLoginLinkToken(slug));
}
