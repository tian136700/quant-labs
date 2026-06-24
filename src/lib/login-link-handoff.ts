import { consumeLoginLink } from "@/lib/etr-login-link-db";
import {
  clearAllSessionCookieHeaders,
  sessionCookieHeader,
} from "@/lib/etr-auth";
import { getCloudflareEnv, localeFromRequest } from "@/lib/cloudflare-env";

function errorRedirect(request: Request, code: string): Response {
  const locale = localeFromRequest(request);
  const url = new URL(request.url);
  url.pathname = locale === "zh" ? "/zh/maintenance" : "/maintenance";
  url.search = `?login_link=${encodeURIComponent(code)}`;
  return Response.redirect(url.toString(), 302);
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
  redirectUrl.pathname = locale === "zh" ? "/zh" : "/";
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
