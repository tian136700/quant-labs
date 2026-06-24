import { handleLoginLinkHandoff } from "@/lib/login-link-handoff";

/** 兼容旧版 ?t= 链接；新生成链接请使用 /sign-in/{slug} */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("t")?.trim() ?? "";
  return handleLoginLinkHandoff(request, token);
}
