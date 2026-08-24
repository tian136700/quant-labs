import type { JpLessonRecord } from "@/lib/types";
import type { JpLessonVocabSyncPlan } from "@/lib/jp-lesson-vocab-sync-shared";
import type { JpLessonMaterialGroupVocabSyncItem } from "@/components/jp-lesson-page/runJpLessonVocabSyncChunks";
import type { TeacherAutoEnableInfo } from "@/components/jp-lesson-page/jp-lesson-page-helpers";

export type JpLessonProgressSaveResponse = {
  ok: boolean;
  lesson?: JpLessonRecord;
  lessons?: JpLessonRecord[];
  error?: string;
  teacher_auto_enable?: TeacherAutoEnableInfo | null;
  vocab_sync?: JpLessonVocabSyncPlan | null;
  vocab_syncs?: JpLessonMaterialGroupVocabSyncItem[];
  sibling_lesson_ids?: number[];
};

export function mergeJpLessonServerFields(
  local: JpLessonRecord,
  server: JpLessonRecord
): JpLessonRecord {
  return {
    ...server,
    teacher_ids: server.teacher_ids?.length
      ? server.teacher_ids
      : (local.teacher_ids ?? []),
    teacher_other: server.teacher_other ?? local.teacher_other,
    class_schedules: server.class_schedules?.length
      ? server.class_schedules
      : local.class_schedules,
    next_class_at: server.next_class_at ?? local.next_class_at,
    class_duration_minutes:
      server.class_duration_minutes ?? local.class_duration_minutes,
  };
}

export function patchJpLessonsFromServers(
  prev: JpLessonRecord[],
  servers: JpLessonRecord[],
  fallbackById?: Map<number, JpLessonRecord>
): JpLessonRecord[] {
  if (!servers.length) return prev;
  const byId = new Map(servers.map((s) => [s.id, s]));
  return prev.map((l) => {
    const server = byId.get(l.id);
    if (!server) return l;
    const base = fallbackById?.get(l.id) ?? l;
    return mergeJpLessonServerFields(base, server);
  });
}

export function vocabSyncGroupTotal(
  data: Pick<JpLessonProgressSaveResponse, "vocab_sync" | "vocab_syncs">
): number {
  const items = data.vocab_syncs?.length
    ? data.vocab_syncs
    : [{ vocab_sync: data.vocab_sync ?? null }];
  return items.reduce(
    (sum, item) =>
      sum +
      (item.vocab_sync?.needed ? Number(item.vocab_sync.total || 0) : 0),
    0
  );
}
