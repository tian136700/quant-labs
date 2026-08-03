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

/**
 * 标「已完成」后分批 POST sync_to_vocab，避免单次请求顶 Worker 1102。
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
    percent: 2,
    label: "正在同步到日语抽问…",
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
    const percent =
      tot <= 0 ? 100 : Math.min(99, Math.max(3, Math.round((synced / tot) * 100)));
    onProgress?.({
      lessonId,
      synced,
      total: tot,
      percent: data.done ? 100 : percent,
      label: data.done
        ? "已同步到日语抽问"
        : `正在同步到日语抽问（${synced}/${tot}）…`,
    });
    if (data.done) {
      return { ok: true };
    }
  }
  return { ok: false, error: "同步到日语抽问超时" };
}
