import { requireAdmin } from "@/lib/admin-auth";
import { getCloudflareEnv, jsonResponse, localeFromRequest } from "@/lib/cloudflare-env";
import { claimToolDotCode } from "@/tool-dot/db";
import type { ToolDotType } from "@/tool-dot/types";
import { TOOL_DOT_TYPES } from "@/tool-dot/types";

const ERR: Record<string, Record<"en" | "zh", string>> = {
  payload_invalid: {
    en: "Invalid request.",
    zh: "请求无效。",
  },
  code_invalid: {
    en: "Please enter a valid redemption code.",
    zh: "请输入有效的兑换码。",
  },
  code_not_found: {
    en: "Redemption code not found.",
    zh: "兑换码不存在。",
  },
  code_used: {
    en: "This code has already been used.",
    zh: "该兑换码已使用过。",
  },
  tool_invalid: {
    en: "Unknown tool type.",
    zh: "未知工具类型。",
  },
  tool_mismatch: {
    en: "This code is not valid for the selected tool.",
    zh: "该兑换码不适用于当前工具。",
  },
};

function errMsg(key: string, locale: "en" | "zh"): string {
  return ERR[key]?.[locale] ?? ERR[key]?.en ?? key;
}

function clientIp(request: Request): string | null {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    null
  );
}

export async function POST(request: Request) {
  const locale = localeFromRequest(request);
  try {
    const env = await getCloudflareEnv();

    let body: { code?: unknown; tool_type?: unknown; filename?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return jsonResponse({ ok: false, error: errMsg("payload_invalid", locale) }, 400);
    }

    const code = typeof body.code === "string" ? body.code : "";
    const toolType = typeof body.tool_type === "string" ? body.tool_type : "";
    const filename =
      typeof body.filename === "string" ? body.filename.slice(0, 200) : null;

    if (!(TOOL_DOT_TYPES as readonly string[]).includes(toolType)) {
      return jsonResponse({ ok: false, error: errMsg("tool_invalid", locale) }, 400);
    }

    const result = await claimToolDotCode(
      env.DB,
      code,
      toolType as ToolDotType,
      clientIp(request),
      filename
    );

    if (!result.ok) {
      return jsonResponse(
        { ok: false, error: errMsg(result.error, locale) },
        400
      );
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
