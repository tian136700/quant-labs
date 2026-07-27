import { requireAdmin } from "@/lib/admin-auth";
import { getCloudflareEnv, jsonResponse } from "@/lib/cloudflare-env";
import { runJpVocabManualFillExamplesForWord } from "@/lib/jp-vocab-manual-fill-examples";
import { resolveJpVocabPaidLlmSecrets } from "@/lib/jp-vocab-paid-llm";

/**
 * 管理员手动补全单词用法+例句（覆盖写回）。
 * POST { word_id } — 调线上 tokken Anthropic；仅 admin 角色。
 */
export async function POST(request: Request) {
  try {
    const { env, isAdmin } = await requireAdmin(request);
    if (!isAdmin) {
      return jsonResponse({ ok: false, error: "Forbidden" }, 403);
    }

    if (!resolveJpVocabPaidLlmSecrets(env)) {
      return jsonResponse(
        {
          ok: false,
          error:
            "未配置线上模型密钥（ANTHROPIC_AUTH_TOKEN）。请在本机或 wrangler secret 配置后重试。",
        },
        503
      );
    }

    let body: { word_id?: number } = {};
    try {
      body = (await request.json()) as { word_id?: number };
    } catch {
      return jsonResponse({ ok: false, error: "Invalid JSON" }, 400);
    }

    const wordId = Number(body.word_id);
    if (!Number.isInteger(wordId) || wordId <= 0) {
      return jsonResponse({ ok: false, error: "word_id required" }, 400);
    }

    const result = await runJpVocabManualFillExamplesForWord(env, wordId);
    if (!result.ok) {
      return jsonResponse(
        {
          ok: false,
          error: result.error || "fill_failed",
          word_id: result.word_id,
          word: result.word,
        },
        422
      );
    }

    return jsonResponse({
      ok: true,
      word_id: result.word_id,
      word: result.word,
      usage: result.usage,
      example_sentences: result.example_sentences,
      usage_source: result.usage_source,
      example_sentences_source: result.example_sentences_source,
      source: result.source,
    });
  } catch (error) {
    console.error("[jp-vocab/manual-fill-examples]", error);
    return jsonResponse({ ok: false, error: "Internal error" }, 500);
  }
}

export async function GET(request: Request) {
  try {
    const { isAdmin } = await requireAdmin(request);
    if (!isAdmin) {
      return jsonResponse({ ok: false, error: "Forbidden" }, 403);
    }
    const env = await getCloudflareEnv();
    return jsonResponse({
      ok: true,
      llm_configured: Boolean(resolveJpVocabPaidLlmSecrets(env)),
    });
  } catch (error) {
    console.error("[jp-vocab/manual-fill-examples GET]", error);
    return jsonResponse({ ok: false, error: "Internal error" }, 500);
  }
}
