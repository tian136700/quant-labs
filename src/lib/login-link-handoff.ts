import { consumeLoginLink } from "@/lib/etr-login-link-db";
import {
  clearAllSessionCookieHeaders,
  sessionCookieHeader,
  type EtrUser,
  type EtrUserRole,
} from "@/lib/etr-auth";
import { getCloudflareEnv, localeFromRequest } from "@/lib/cloudflare-env";
import { jpVocabPath } from "@/lib/locale-path";
import { getPermissionsForRole } from "@/lib/rbac-db";
import { isAdminSuperuser } from "@/lib/rbac";

function errorRedirect(request: Request, code: string): Response {
  const locale = localeFromRequest(request);
  const url = new URL(request.url);
  url.pathname = locale === "zh" ? "/zh/maintenance" : "/maintenance";
  url.search = `?login_link=${encodeURIComponent(code)}`;
  return Response.redirect(url.toString(), 302);
}

/** 登录链接兑换后的落地页：日语教师直达单词页，避免先闪主页再跳转 */
async function resolveLoginLinkLandingPath(
  db: D1Database,
  user: EtrUser,
  locale: "en" | "zh"
): Promise<string> {
  const role = user.role as EtrUserRole;
  if (isAdminSuperuser(role)) {
    return locale === "zh" ? "/zh" : "/";
  }

  const permissions = await getPermissionsForRole(db, role);
  const jpTeacherNav =
    permissions.includes("nav:jp_teacher") && !permissions.includes("nav:full");
  if (jpTeacherNav || role === "jp_vocab") {
    return jpVocabPath();
  }

  return locale === "zh" ? "/zh" : "/";
}

export async function handleLoginLinkHandoff(
  request: Request,
  token: string
): Promise<Response> {
  const trimmed = token.trim();
  if (!trimmed) {
    return errorRedirect(request, "link_invalid");
  }

  const env = await getCloudflareEnv();
  const result = await consumeLoginLink(env, trimmed);
  if (!result.ok) {
    return errorRedirect(request, result.error);
  }

  const locale = localeFromRequest(request);
  const redirectUrl = new URL(request.url);
  redirectUrl.pathname = await resolveLoginLinkLandingPath(
    env.DB,
    result.user,
    locale
  );
  redirectUrl.search = "";

  const headers = new Headers({ Location: redirectUrl.toString() });
  for (const cookie of clearAllSessionCookieHeaders()) {
    headers.append("Set-Cookie", cookie);
  }
  headers.append(
    "Set-Cookie",
    sessionCookieHeader(result.token, new Date(result.expires_at))
  );

  return new Response(null, { status: 302, headers });
}
