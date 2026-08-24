"use client";

import { LOCALE_HEADER } from "@/lib/locale-detect";
import type { Locale } from "@/i18n/messages";
import type { JpLessonVocabSyncPlan } from "@/lib/jp-lesson-vocab-sync-shared";

export type JpLessonVocabSyncProgress = {
  lessonId: number;
  synced: number;
  total: number;
  percent: number;
  label: string;
};

export const JP_LESSON_COMPLETE_PROGRESS_BUSY_LABEL = "正在执行操作…";
export const JP_LESSON_COMPLETE_PROGRESS_DONE_LABEL = "本次执行已成功";

/**
 * 标「已完成」后分批 POST sync_to_vocab，避免单次请求顶 Worker 1102。
 * 文案统一「正在执行操作…」，成功由调用方再提示「本次执行已成功」。
 */
export async function runJpLessonVocabSyncChunks(opts: {
  locale: Locale;
  plan: JpLessonVocabSyncPlan;
  lessonId: number;
  onProgress?: (p: JpLessonVocabSyncProgress) => void;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { locale, plan, lessonId, onProgress } = opts;
  let offset = plan.offset;
  const total = plan.total;
  const chunkSize = plan.chunk_size;

  onProgress?.({
    lessonId,
    synced: 0,
    total,
    percent: 8,
    label: JP_LESSON_COMPLETE_PROGRESS_BUSY_LABEL,
  });

  // 安全上限：防止异常响应死循环
  const maxRounds = Math.ceil(total / Math.max(1, chunkSize)) + 5;
  for (let round = 0; round < maxRounds; round++) {
    const res = await fetch("/api/jp-lesson", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [LOCALE_HEADER]: locale,
      },
      credentials: "include",
      body: JSON.stringify({
        action: "sync_to_vocab",
        lesson_id: lessonId,
        offset,
        limit: chunkSize,
      }),
    });
    const data = (await res.json()) as {
      ok?: boolean;
      done?: boolean;
      next_offset?: number;
      total?: number;
      error?: string;
    };
    if (!data.ok) {
      return { ok: false, error: data.error || "同步到日语抽问失败" };
    }
    const next = Number(data.next_offset ?? offset);
    const tot = Number(data.total ?? total) || total;
    offset = next;
    const synced = Math.min(tot, offset);
    // 留一点给「写完状态」阶段：同步占约 15%～92%
    const percent =
      tot <= 0
        ? 92
        : Math.min(92, Math.max(15, Math.round(15 + (synced / tot) * 77)));
    onProgress?.({
      lessonId,
      synced,
      total: tot,
      percent: data.done ? 92 : percent,
      label: JP_LESSON_COMPLETE_PROGRESS_BUSY_LABEL,
    });
    if (data.done) {
      return { ok: true };
    }
  }
  return { ok: false, error: "同步到日语抽问超时" };
}

export type JpLessonMaterialGroupVocabSyncItem = {
  lesson_id: number;
  vocab_sync: JpLessonVocabSyncPlan | null;
};

/**
 * 共用教材标完成后：对 vocab_syncs 每一课跑分片 sync。
 * 进度条钉在 primaryLessonId（用户点的那一行）；多课时文案带「第 i/N 课」。
 */
export async function runJpLessonMaterialGroupVocabSyncs(opts: {
  locale: Locale;
  primaryLessonId: number;
  items: JpLessonMaterialGroupVocabSyncItem[];
  onProgress?: (p: JpLessonVocabSyncProgress) => void;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const need = opts.items.filter(
    (item) =>
      item.vocab_sync?.needed === true &&
      Number(item.vocab_sync.total || 0) > 0 &&
      Number.isInteger(item.lesson_id) &&
      item.lesson_id > 0
  );
  if (!need.length) return { ok: true };

  const n = need.length;
  for (let i = 0; i < n; i++) {
    const item = need[i]!;
    const plan = item.vocab_sync!;
    const groupLabel =
      n > 1
        ? `正在同步第 ${i + 1}/${n} 课到日语抽问…`
        : JP_LESSON_COMPLETE_PROGRESS_BUSY_LABEL;
    const result = await runJpLessonVocabSyncChunks({
      locale: opts.locale,
      lessonId: item.lesson_id,
      plan,
      onProgress: (p) => {
        const bandStart = 8 + (i / n) * 84;
        const bandSpan = 84 / n;
        const within = Math.max(0, Math.min(1, (p.percent - 8) / 84));
        opts.onProgress?.({
          lessonId: opts.primaryLessonId,
          synced: p.synced,
          total: p.total,
          percent: Math.min(92, Math.round(bandStart + within * bandSpan)),
          label: groupLabel,
        });
      },
    });
    if (!result.ok) return result;
  }
  return { ok: true };
}
