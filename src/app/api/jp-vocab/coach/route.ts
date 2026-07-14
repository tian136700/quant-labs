import { jsonResponse, localeFromRequest } from "@/lib/cloudflare-env";
import { requireJpVocabAccess, requireJpVocabRead } from "@/lib/jp-vocab-auth";
import {
  getJpVocabCoachQueueSummary,
  listJpVocabCoachQueue,
  markJpVocabCoachCoached,
  mergeJpVocabCoachQueue,
  pruneJpVocabCoachCoachedOlderThanRetention,
} from "@/lib/jp-vocab-coach-db";
import {
  JP_VOCAB_COACH_RETENTION_DAYS,
  jpVocabCoachRetentionCutoffDate,
} from "@/lib/jp-vocab-coach";
import { listJpVocabWordsWithRefs } from "@/lib/jp-vocab-db";
import type { JpVocabLevel } from "@/lib/types";

const READ_MSG = {
  en: "Please log in to view classroom read-along lists.",
  zh: "请登录后查看课堂带读列表。",
};

const WRITE_MSG = {
  en: "Please log in to update classroom read-along.",
  zh: "请登录后再更新课堂带读。",
};

export async function GET(request: Request) {
  const locale = localeFromRequest(request);
  try {
    const { env, allowed } = await requireJpVocabRead(request);
    if (!allowed) {
      return jsonResponse({ ok: false, error: READ_MSG[locale] }, 401);
    }

    await pruneJpVocabCoachCoachedOlderThanRetention(env.DB);

    const { words, refs } = await listJpVocabWordsWithRefs(env.DB);
    const wordsById = new Map(words.map((word) => [word.id, word]));
    const { items, summary } = await listJpVocabCoachQueue(env.DB, wordsById);

    return jsonResponse({
      ok: true,
      items,
      refs,
      summary,
      retention_days: JP_VOCAB_COACH_RETENTION_DAYS,
      retention_cutoff: jpVocabCoachRetentionCutoffDate(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}

export async function POST(request: Request) {
  const locale = localeFromRequest(request);
  try {
    const { env, user, allowed } = await requireJpVocabAccess(request);
    if (!allowed || !user) {
      return jsonResponse({ ok: false, error: WRITE_MSG[locale] }, 401);
    }

    const body = (await request.json()) as {
      action?: string;
      items?: Array<{
        word_id?: number;
        level?: JpVocabLevel;
        display_order?: number;
      }>;
      word_ids?: number[];
      word_id?: number;
      /** @deprecated */
      coach_date?: string;
    };

    if (body.action === "merge_queue" || body.action === "export_batch") {
      const items = Array.isArray(body.items) ? body.items : [];
      if (!items.length) {
        // 允许空合并（仅跳转进入带读页看已有队列）
        await pruneJpVocabCoachCoachedOlderThanRetention(env.DB);
        const summary = await getJpVocabCoachQueueSummary(env.DB);
        return jsonResponse({
          ok: true,
          added_count: 0,
          merged_count: 0,
          ...summary,
        });
      }

      const result = await mergeJpVocabCoachQueue(
        env.DB,
        items.map((item, index) => ({
          word_id: Number(item.word_id),
          level: item.level ?? "normal",
          display_order: Number(item.display_order) || index + 1,
        })),
        user.username
      );

      return jsonResponse({ ok: true, ...result });
    }

    if (body.action === "mark_coached") {
      const ids = Array.isArray(body.word_ids)
        ? body.word_ids
        : body.word_id != null
          ? [body.word_id]
          : [];
      if (!ids.length) {
        return jsonResponse({ ok: false, error: "empty_word_ids" }, 400);
      }
      const result = await markJpVocabCoachCoached(env.DB, ids.map(Number));
      return jsonResponse({ ok: true, ...result });
    }

    return jsonResponse({ ok: false, error: "unknown action" }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
