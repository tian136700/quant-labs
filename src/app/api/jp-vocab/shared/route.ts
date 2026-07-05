import { getCloudflareEnv, jsonResponse } from "@/lib/cloudflare-env";
import { listJpVocabSharedToday } from "@/lib/jp-vocab-db";
import { beijingDateString } from "@/lib/jp-vocab-daily-check";

/** 今日共享单词列表：公开可读（与 /api/jp-vocab 的 shared_today_word_ids 一致，按北京时间自然日） */
export async function GET() {
  try {
    const env = await getCloudflareEnv();
    const { items, refs } = await listJpVocabSharedToday(env.DB);
    return jsonResponse(
      {
        ok: true,
        items,
        refs,
        share_date: beijingDateString(),
      },
      200,
      { "Cache-Control": "no-store" }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
