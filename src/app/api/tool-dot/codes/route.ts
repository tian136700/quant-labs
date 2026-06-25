import { requireAdmin } from "@/lib/admin-auth";
import { getCloudflareEnv, jsonResponse, localeFromRequest } from "@/lib/cloudflare-env";
import {
  createToolDotCodes,
  deleteUnusedToolDotCode,
  listToolDotCodes,
} from "@/tool-dot/db";
import type { ToolDotType } from "@/tool-dot/types";
import { TOOL_DOT_TYPES } from "@/tool-dot/types";

const ERR: Record<string, Record<"en" | "zh", string>> = {
  forbidden: {
    en: "Admin access required.",
    zh: "需要管理员账号。",
  },
  payload_invalid: {
    en: "Invalid request.",
    zh: "请求无效。",
  },
  invalid_tool_type: {
    en: "Invalid tool type.",
    zh: "工具类型无效。",
  },
  code_collision: {
    en: "Failed to generate unique codes. Please retry.",
    zh: "生成唯一兑换码失败，请重试。",
  },
  not_found: {
    en: "Code not found or already used.",
    zh: "兑换码不存在或已使用。",
  },
};

function errMsg(key: string, locale: "en" | "zh"): string {
  return ERR[key]?.[locale] ?? ERR[key]?.en ?? key;
}

export async function GET(request: Request) {
  const locale = localeFromRequest(request);
  try {
    const { env, user, isAdmin } = await requireAdmin(request);
    if (!isAdmin || !user) {
      return jsonResponse({ ok: false, error: errMsg("forbidden", locale) }, 403);
    }

    const url = new URL(request.url);
    const statusParam = url.searchParams.get("status") || "all";
    const status =
      statusParam === "unused" || statusParam === "used" ? statusParam : "all";
    const limit = Number(url.searchParams.get("limit") || "100");

    const records = await listToolDotCodes(env.DB, status, limit);
    return jsonResponse({ ok: true, records });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}

export async function POST(request: Request) {
  const locale = localeFromRequest(request);
  try {
    const { env, user, isAdmin } = await requireAdmin(request);
    if (!isAdmin || !user) {
      return jsonResponse({ ok: false, error: errMsg("forbidden", locale) }, 403);
    }

    let body: { tool_type?: unknown; count?: unknown; label?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return jsonResponse({ ok: false, error: errMsg("payload_invalid", locale) }, 400);
    }

    const toolType = typeof body.tool_type === "string" ? body.tool_type : "";
    const count = Number(body.count ?? 1);
    const label = typeof body.label === "string" ? body.label : null;

    if (!(TOOL_DOT_TYPES as readonly string[]).includes(toolType)) {
      return jsonResponse({ ok: false, error: errMsg("payload_invalid", locale) }, 400);
    }

    const result = await createToolDotCodes(env.DB, {
      tool_type: toolType as ToolDotType,
      count,
      label,
      admin_id: user.id,
    });

    if (!result.ok) {
      return jsonResponse(
        { ok: false, error: errMsg(result.error, locale) },
        400
      );
    }

    return jsonResponse({ ok: true, codes: result.codes });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}

export async function DELETE(request: Request) {
  const locale = localeFromRequest(request);
  try {
    const { env, user, isAdmin } = await requireAdmin(request);
    if (!isAdmin || !user) {
      return jsonResponse({ ok: false, error: errMsg("forbidden", locale) }, 403);
    }

    const url = new URL(request.url);
    const id = Number(url.searchParams.get("id"));
    if (!Number.isFinite(id) || id <= 0) {
      return jsonResponse({ ok: false, error: errMsg("payload_invalid", locale) }, 400);
    }

    const result = await deleteUnusedToolDotCode(env.DB, id);
    if (!result.ok) {
      return jsonResponse(
        { ok: false, error: errMsg(result.error || "not_found", locale) },
        404
      );
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
