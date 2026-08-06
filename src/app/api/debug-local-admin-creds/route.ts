import { jsonResponse } from "@/lib/cloudflare-env";

export const runtime = "nodejs";

function isLocalDebugRequest(request: Request): boolean {
  try {
    const url = new URL(request.url);
    return url.hostname === "127.0.0.1" || url.hostname === "localhost";
  } catch {
    return false;
  }
}

/**
 * 仅本机：返回 .env 里的 Admin 账号，供登录页自动填入（线上 403）。
 */
export async function GET(request: Request) {
  if (!isLocalDebugRequest(request)) {
    return jsonResponse({ ok: false, error: "forbidden" }, 403);
  }

  const username = String(process.env.ETR_ADMIN_USERNAME || "").trim();
  const password = String(process.env.ETR_ADMIN_PASSWORD || "").trim();
  if (!username || !password) {
    return jsonResponse(
      { ok: false, error: "missing_ETR_ADMIN_USERNAME_or_PASSWORD" },
      500
    );
  }

  return jsonResponse({
    ok: true,
    username,
    password,
    auto_submit: true,
  });
}
