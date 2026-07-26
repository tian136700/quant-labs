import { handleLoginLinkHandoff } from "@/lib/login-link-handoff";

/** 兼容旧版 ?t= 链接；新生成链接为 /sign-in/{username}/{slug}（旧 /sign-in/{slug} 仍可用） */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("t")?.trim() ?? "";
  return handleLoginLinkHandoff(request, token);
}
