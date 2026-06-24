import {
  getSessionUserFromRequest,
  loginUser,
  logoutSession,
  registerUser,
  resolveAuthSession,
} from "@/lib/etr-auth-db";
import {
  clearAllSessionCookieHeaders,
  formatExpiresHint,
  parseAllSessionCookies,
  sessionCookieHeader,
} from "@/lib/etr-auth";
import {
  checkLoginRateLimit,
  clearLoginFailures,
  recordLoginFailure,
} from "@/lib/etr-login-guard";
import { enrichSessionUser } from "@/lib/rbac-db";
import {
  getCloudflareEnv,
  jsonResponse,
  localeFromRequest,
} from "@/lib/cloudflare-env";
import { PUBLIC_REGISTRATION_ENABLED } from "@/lib/feature-flags";

function jsonWithSetCookies(
  data: Record<string, unknown>,
  status: number,
  setCookies: string[]
) {
  const headers = new Headers({ "Content-Type": "application/json" });
  for (const cookie of setCookies) {
    headers.append("Set-Cookie", cookie);
  }
  return new Response(JSON.stringify(data), { status, headers });
}

async function logoutAllSessions(
  env: Awaited<ReturnType<typeof getCloudflareEnv>>,
  cookieHeader: string | null
) {
  for (const token of parseAllSessionCookies(cookieHeader)) {
    await logoutSession(env, token);
  }
}

function authSuccessCookies(token: string, expiresAt: string): string[] {
  return [...clearAllSessionCookieHeaders(), sessionCookieHeader(token, new Date(expiresAt))];
}

const AUTH_ERRORS: Record<string, Record<"en" | "zh", string>> = {
  invalid_credentials: {
    en: "Invalid username or password.",
    zh: "用户名或密码错误。",
  },
  username_invalid: {
    en: "Username must be 6–32 characters (letters, numbers, _ . -).",
    zh: "用户名须为 6～32 个字符（字母、数字、下划线、点、横线）。",
  },
  username_reserved: {
    en: "This username is reserved.",
    zh: "该用户名为系统保留，请换一个。",
  },
  username_taken: {
    en: "Username already taken.",
    zh: "用户名已被注册。",
  },
  password_too_short: {
    en: "Password must be at least 6 characters.",
    zh: "密码至少 6 位。",
  },
  password_mismatch: {
    en: "Passwords do not match.",
    zh: "两次输入的密码不一致。",
  },
  register_failed: {
    en: "Registration failed.",
    zh: "注册失败。",
  },
  action_required: {
    en: "Unknown action.",
    zh: "未知操作。",
  },
  fields_required: {
    en: "Please fill in all required fields.",
    zh: "请填写所有必填项。",
  },
  rate_limited: {
    en: "Too many failed login attempts. Please try again later.",
    zh: "登录失败次数过多，请稍后再试。",
  },
  registration_disabled: {
    en: "Registration is temporarily unavailable.",
    zh: "暂不开放网上注册。",
  },
};

function errMsg(key: string, locale: "en" | "zh"): string {
  return AUTH_ERRORS[key]?.[locale] ?? AUTH_ERRORS[key]?.en ?? key;
}

async function publicAuthUser(
  env: Awaited<ReturnType<typeof getCloudflareEnv>>,
  user: NonNullable<Awaited<ReturnType<typeof getSessionUserFromRequest>>>,
  locale: "en" | "zh"
) {
  const enriched = await enrichSessionUser(env.DB, user);
  return {
    id: enriched.id,
    username: enriched.username,
    role: enriched.role,
    expires_at: enriched.expires_at,
    expires_hint: formatExpiresHint(enriched.role, locale),
    permissions: enriched.permissions,
    can_operate_jp_vocab: enriched.can_operate_jp_vocab,
  };
}

export async function GET(request: Request) {
  try {
    const env = await getCloudflareEnv();
    const cookieHeader = request.headers.get("cookie");
    const resolved = await resolveAuthSession(env, cookieHeader);

    if (resolved.status === "maintenance") {
      return jsonResponse(
        { ok: true, authenticated: false, user: null, maintenance: true },
        200
      );
    }

    if (resolved.status === "authenticated") {
      const locale = localeFromRequest(request);
      return jsonResponse({
        ok: true,
        authenticated: true,
        user: await publicAuthUser(env, resolved.user, locale),
      });
    }

    if (resolved.staleCookie) {
      return jsonWithSetCookies(
        { ok: true, authenticated: false, user: null, stale_cookie_cleared: true },
        200,
        clearAllSessionCookieHeaders()
      );
    }

    return jsonResponse({ ok: true, authenticated: false, user: null });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message, authenticated: false }, 500);
  }
}

export async function POST(request: Request) {
  const locale = localeFromRequest(request);

  let body: {
    action?: string;
    username?: string;
    password?: string;
    password_confirm?: string;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonResponse({ ok: false, error: "Invalid JSON" }, 400);
  }

  const action = (body.action || "").trim();
  const username = (body.username || "").trim();
  const password = body.password || "";

  if (action === "logout") {
    try {
      const env = await getCloudflareEnv();
      const cookieHeader = request.headers.get("cookie");
      await logoutAllSessions(env, cookieHeader);
      return jsonWithSetCookies({ ok: true }, 200, clearAllSessionCookieHeaders());
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return jsonResponse({ ok: false, error: message }, 500);
    }
  }

  if (!username || !password) {
    return jsonResponse(
      { ok: false, error: errMsg("fields_required", locale) },
      400
    );
  }

  try {
    const env = await getCloudflareEnv();

    if (action === "login") {
      const rate = await checkLoginRateLimit(env.DB, request);
      if (!rate.ok) {
        return jsonResponse(
          {
            ok: false,
            error: errMsg("rate_limited", locale),
            retry_after_sec: rate.retryAfterSec,
          },
          429
        );
      }

      const result = await loginUser(env, username, password);
      if (!result.ok) {
        if (result.error === "maintenance") {
          return jsonResponse({ ok: false, maintenance: true }, 503);
        }
        await recordLoginFailure(env.DB, request);
        return jsonResponse(
          { ok: false, error: errMsg(result.error, locale) },
          401
        );
      }

      await clearLoginFailures(env.DB, request);

      const sessionUser = { ...result.user, expires_at: result.expires_at };
      return jsonWithSetCookies(
        {
          ok: true,
          user: await publicAuthUser(env, sessionUser, locale),
        },
        200,
        authSuccessCookies(result.token, result.expires_at)
      );
    }

    if (action === "register") {
      if (!PUBLIC_REGISTRATION_ENABLED) {
        return jsonResponse(
          { ok: false, error: errMsg("registration_disabled", locale) },
          403
        );
      }

      const confirm = body.password_confirm || "";
      if (password !== confirm) {
        return jsonResponse(
          { ok: false, error: errMsg("password_mismatch", locale) },
          400
        );
      }

      const result = await registerUser(env, username, password);
      if (!result.ok) {
        return jsonResponse(
          { ok: false, error: errMsg(result.error, locale) },
          400
        );
      }

      const sessionUser = { ...result.user, expires_at: result.expires_at };
      return jsonWithSetCookies(
        {
          ok: true,
          user: await publicAuthUser(env, sessionUser, locale),
        },
        200,
        authSuccessCookies(result.token, result.expires_at)
      );
    }

    return jsonResponse(
      { ok: false, error: errMsg("action_required", locale) },
      400
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
