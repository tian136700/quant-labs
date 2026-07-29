import { getCloudflareEnv, jsonResponse, localeFromRequest } from "@/lib/cloudflare-env";
import { requireJpVocabRead } from "@/lib/jp-vocab-auth";
import { verifyUploadAuth } from "@/lib/jp-review";
import { existsJpVocabWordByLemma } from "@/lib/jp-vocab-db";
import type { JpVocabKind } from "@/lib/types";

const READ_AUTH_MSG = {
  en: "Please log in to view vocabulary.",
  zh: "请登录后查看单词。",
};

function parseKind(raw: string | null): JpVocabKind | undefined | null {
  if (raw == null) return undefined;
  const normalized = raw.trim().toLowerCase();
  if (!normalized || normalized === "any") return undefined;
  if (normalized === "word" || normalized === "grammar") return normalized;
  return null;
}

/**
 * 词条存在性查询（给外部项目/脚本做去重）
 * GET /api/jp-vocab/exists?word=...&kind=word|grammar|any
 *
 * 鉴权：
 * 1) 登录态（老师/管理员等可读权限）
 * 2) 或 Bearer JP_REVIEW_UPLOAD_TOKEN
 */
export async function GET(request: Request) {
  const locale = localeFromRequest(request);

  try {
    const env = await getCloudflareEnv();
    const viaUploadToken = verifyUploadAuth(request, env);
    if (!viaUploadToken) {
      const { allowed } = await requireJpVocabRead(request);
      if (!allowed) {
        return jsonResponse({ ok: false, error: READ_AUTH_MSG[locale] }, 401);
      }
    }

    const { searchParams } = new URL(request.url);
    const word = (searchParams.get("word") || "").trim();
    const kind = parseKind(searchParams.get("kind"));

    if (!word) {
      return jsonResponse({ ok: false, error: "word_required" }, 400);
    }
    if (kind === null) {
      return jsonResponse({ ok: false, error: "kind_invalid" }, 400);
    }

    const exists = await existsJpVocabWordByLemma(env.DB, word, kind);
    return jsonResponse(
      {
        ok: true,
        word,
        kind: kind ?? "any",
        exists: exists ? 1 : 0,
      },
      200,
      { "Cache-Control": "no-store" }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
