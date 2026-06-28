import { trackVisit } from "@/lib/analytics-db";
import { requirePermission } from "@/lib/admin-auth";
import {
  getCloudflareEnv,
  jsonResponse,
  localeFromRequest,
} from "@/lib/cloudflare-env";
import { isValidEmail } from "@/lib/email-validation";
import { listUserFeedback, saveUserFeedback } from "@/lib/feedback-db";
import { clientGeoFromRequest } from "@/lib/geoip";
import { clientIp } from "@/lib/locale-pref";

const ERROR_MSG: Record<string, Record<"en" | "zh", string>> = {
  email_required: {
    en: "Please enter your email address.",
    zh: "请输入您的邮箱。",
  },
  email_invalid: {
    en: "Please enter a valid email address.",
    zh: "请输入有效的邮箱格式。",
  },
  content_required: {
    en: "Please enter your feedback.",
    zh: "请填写您的建议内容。",
  },
  content_too_long: {
    en: "Feedback is too long (max 8000 characters).",
    zh: "建议内容过长（最多 8000 字）。",
  },
  save_failed: {
    en: "Failed to submit feedback. Please try again.",
    zh: "提交失败，请稍后重试。",
  },
  ip_unavailable: {
    en: "Unable to submit right now. Please try again later.",
    zh: "暂时无法提交，请稍后重试。",
  },
  auth_required: {
    en: "Admin login required.",
    zh: "需要管理员登录。",
  },
};

function errMsg(key: string, locale: "en" | "zh"): string {
  return ERROR_MSG[key]?.[locale] ?? ERROR_MSG[key]?.en ?? key;
}

export async function GET(request: Request) {
  const locale = localeFromRequest(request);

  try {
    const { env, allowed } = await requirePermission(request, "admin:dashboard");
    if (!allowed) {
      return jsonResponse(
        { ok: false, error: errMsg("auth_required", locale), auth_required: true },
        401
      );
    }

    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get("limit") || "500", 10);
    const records = await listUserFeedback(env.DB, limit);
    return jsonResponse({ ok: true, records });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}

export async function POST(request: Request) {
  const locale = localeFromRequest(request);
  const ip = clientIp(request);

  if (!ip) {
    return jsonResponse({ ok: false, error: errMsg("ip_unavailable", locale) }, 400);
  }

  let body: { email?: string; content?: string; url_path?: string; locale?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonResponse({ ok: false, error: "Invalid JSON" }, 400);
  }

  const email = (body.email || "").trim();
  const content = (body.content || "").trim();

  if (!email) {
    return jsonResponse({ ok: false, error: errMsg("email_required", locale) }, 400);
  }
  if (!isValidEmail(email)) {
    return jsonResponse({ ok: false, error: errMsg("email_invalid", locale) }, 400);
  }
  if (!content) {
    return jsonResponse(
      { ok: false, error: errMsg("content_required", locale) },
      400
    );
  }

  try {
    const env = await getCloudflareEnv();
    const geo = clientGeoFromRequest(request);
    const urlPath = (body.url_path || "").trim() || null;
    const userLocale =
      body.locale === "zh" || body.locale === "en" ? body.locale : locale;

    const result = await saveUserFeedback(env.DB, {
      email,
      content,
      ip,
      country_code: geo.country_code,
      geo_region: geo.region,
      geo_region_code: geo.region_code,
      geo_city: geo.city,
      url_path: urlPath,
      locale: userLocale,
    });

    if (!result.ok) {
      return jsonResponse(
        { ok: false, error: errMsg(result.error, locale) },
        400
      );
    }

    await trackVisit(env.DB, {
      ip,
      country_code: geo.country_code,
      geo_region: geo.region,
      geo_region_code: geo.region_code,
      geo_city: geo.city,
      url_path: urlPath || "/about",
      event_type: "action",
      event_detail: "feedback_submit",
      locale: userLocale,
    });

    return jsonResponse({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
