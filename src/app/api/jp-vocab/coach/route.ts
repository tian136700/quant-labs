import { getCloudflareEnv, jsonResponse, localeFromRequest } from "@/lib/cloudflare-env";
import { requireJpVocabAccess, requireJpVocabRead } from "@/lib/jp-vocab-auth";
import {
  getJpVocabCoachItems,
  listJpVocabCoachBatchSummaries,
  pruneJpVocabCoachBatchesOlderThanRetention,
  replaceJpVocabCoachBatch,
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
  en: "Please log in to export to classroom read-along.",
  zh: "请登录后再导出到课堂带读。",
};

export async function GET(request: Request) {
  const locale = localeFromRequest(request);
  try {
    const { env, allowed } = await requireJpVocabRead(request);
    if (!allowed) {
      return jsonResponse({ ok: false, error: READ_MSG[locale] }, 401);
    }

    const url = new URL(request.url);
    const coachDate = url.searchParams.get("date");

    if (!coachDate) {
      await pruneJpVocabCoachBatchesOlderThanRetention(env.DB);
      const batches = await listJpVocabCoachBatchSummaries(env.DB);
      return jsonResponse({
        ok: true,
        batches,
        retention_days: JP_VOCAB_COACH_RETENTION_DAYS,
        retention_cutoff: jpVocabCoachRetentionCutoffDate(),
      });
    }

    await pruneJpVocabCoachBatchesOlderThanRetention(env.DB);

    const { words, refs } = await listJpVocabWordsWithRefs(env.DB);
    const wordsById = new Map(words.map((word) => [word.id, word]));
    const payload = await getJpVocabCoachItems(env.DB, coachDate, wordsById);

    return jsonResponse({
      ok: true,
      coach_date: payload.coach_date,
      items: payload.items,
      refs,
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
      coach_date?: string;
      items?: Array<{
        word_id?: number;
        level?: JpVocabLevel;
        display_order?: number;
      }>;
    };

    if (body.action !== "export_batch") {
      return jsonResponse({ ok: false, error: "unknown action" }, 400);
    }

    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) {
      return jsonResponse({ ok: false, error: "empty_items" }, 400);
    }

    const result = await replaceJpVocabCoachBatch(
      env.DB,
      body.coach_date ?? "",
      items.map((item, index) => ({
        word_id: Number(item.word_id),
        level: item.level ?? "normal",
        display_order: Number(item.display_order) || index + 1,
      })),
      user.username
    );

    return jsonResponse({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
