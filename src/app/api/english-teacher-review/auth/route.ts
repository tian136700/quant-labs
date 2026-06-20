import {
  getSessionUser,
  loginUser,
  logoutSession,
  registerUser,
} from "@/lib/etr-auth-db";
import {
  canUserOperateJpVocab,
  clearSessionCookieHeader,
  formatExpiresHint,
  parseSessionCookie,
  sessionCookieHeader,
} from "@/lib/etr-auth";
import {
  getCloudflareEnv,
  jsonResponse,
  localeFromRequest,
} from "@/lib/cloudflare-env";

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
};

function errMsg(key: string, locale: "en" | "zh"): string {
  return AUTH_ERRORS[key]?.[locale] ?? AUTH_ERRORS[key]?.en ?? key;
}

export async function GET(request: Request) {
  try {
    const env = await getCloudflareEnv();
    const token = parseSessionCookie(request.headers.get("cookie"));
    const user = await getSessionUser(env, token);

    if (!user) {
      return jsonResponse({ ok: true, authenticated: false, user: null });
    }

    const locale = localeFromRequest(request);
    return jsonResponse({
      ok: true,
      authenticated: true,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        expires_at: user.expires_at,
        expires_hint: formatExpiresHint(user.role, locale),
        can_operate_jp_vocab: canUserOperateJpVocab(user),
      },
    });
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
      const token = parseSessionCookie(request.headers.get("cookie"));
      await logoutSession(env, token);
      return jsonResponse(
        { ok: true },
        200,
        { "Set-Cookie": clearSessionCookieHeader() }
      );
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
      const result = await loginUser(env, username, password);
      if (!result.ok) {
        return jsonResponse(
          { ok: false, error: errMsg(result.error, locale) },
          401
        );
      }

      return jsonResponse(
        {
          ok: true,
          user: {
            ...result.user,
            expires_at: result.expires_at,
            expires_hint: formatExpiresHint(result.user.role, locale),
            can_operate_jp_vocab: canUserOperateJpVocab(result.user),
          },
        },
        200,
        {
          "Set-Cookie": sessionCookieHeader(
            result.token,
            new Date(result.expires_at)
          ),
        }
      );
    }

    if (action === "register") {
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

      return jsonResponse(
        {
          ok: true,
          user: {
            ...result.user,
            expires_at: result.expires_at,
            expires_hint: formatExpiresHint(result.user.role, locale),
          },
        },
        200,
        {
          "Set-Cookie": sessionCookieHeader(
            result.token,
            new Date(result.expires_at)
          ),
        }
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
