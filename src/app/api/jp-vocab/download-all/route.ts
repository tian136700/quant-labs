import { getCloudflareEnv, jsonResponse, localeFromRequest } from "@/lib/cloudflare-env";
import { requireJpVocabRead } from "@/lib/jp-vocab-auth";
import { verifyUploadAuth } from "@/lib/jp-review";
import { listJpVocabLemmasForDownload } from "@/lib/jp-vocab-db";
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

function parseFormat(raw: string | null): "json" | "txt" | null {
  if (raw == null || !raw.trim()) return "json";
  const normalized = raw.trim().toLowerCase();
  if (normalized === "json") return "json";
  if (normalized === "txt" || normalized === "text") return "txt";
  return null;
}

/**
 * 一键下载线上全部日语词条（轻量：仅 id / word / kind）
 * GET /api/jp-vocab/download-all?kind=word|grammar|any&format=json|txt
 *
 * 用途：外部项目下载后比对，已有词不再制作教案。
 * - word / any：含词库 + 日语新课「学习中/未完成」单词（去重）；仅新课有的 id=0
 * - grammar：只含词库语法（不合并新课语法）
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
    const kind = parseKind(searchParams.get("kind"));
    const format = parseFormat(searchParams.get("format"));

    if (kind === null) {
      return jsonResponse({ ok: false, error: "kind_invalid" }, 400);
    }
    if (format === null) {
      return jsonResponse({ ok: false, error: "format_invalid" }, 400);
    }

    const words = await listJpVocabLemmasForDownload(env.DB, kind);
    const kindLabel = kind ?? "any";

    if (format === "txt") {
      // 一行一词：word\tkind（便于另一项目做集合比对）
      const body = words.map((item) => `${item.word}\t${item.kind}`).join("\n");
      const suffix = kind ? `-${kind}` : "";
      return new Response(body ? `${body}\n` : "", {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
          "Content-Disposition": `attachment; filename="jp-vocab-all${suffix}.txt"`,
        },
      });
    }

    return jsonResponse(
      {
        ok: true,
        kind: kindLabel,
        count: words.length,
        words,
      },
      200,
      { "Cache-Control": "no-store" }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
