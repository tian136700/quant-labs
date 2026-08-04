"use client";

import {
  useEffect,
  type MutableRefObject,
} from "react";
import { EnLessonImportScheduleModal } from "@/components/en-lesson-page/EnLessonImportScheduleModal";
import { useEnLessonImportSchedule } from "@/components/en-lesson-page/useEnLessonImportSchedule";
import type { Locale } from "@/i18n/messages";
import type { EnLessonRecord, EnLessonTeacher } from "@/lib/types";

export type EnLessonImportScheduleApi = {
  openImportSchedule: (lesson: EnLessonRecord) => void;
};

type Props = {
  locale: Locale;
  teachers: EnLessonTeacher[];
  canOperate: boolean;
  apiRef: MutableRefObject<EnLessonImportScheduleApi | null>;
  onLessonSynced: (lesson: EnLessonRecord) => void;
  onStatus: (message: string) => void;
};

/** 挂在 EnLessonPage：引入日程弹窗 + API ref，避免撑破编排页行数 */
export function EnLessonImportScheduleBridge({
  locale,
  teachers,
  canOperate,
  apiRef,
  onLessonSynced,
  onStatus,
}: Props) {
  const api = useEnLessonImportSchedule({
    locale,
    teachers,
    canOperate,
    onLessonSynced,
    onStatus,
  });

  useEffect(() => {
    apiRef.current = { openImportSchedule: api.openImportSchedule };
    return () => {
      apiRef.current = null;
    };
  }, [api.openImportSchedule, apiRef]);

  return (
    <EnLessonImportScheduleModal
      open={api.importScheduleOpen}
      lessonId={api.importScheduleLessonId}
      candidates={api.importScheduleCandidates}
      teachers={teachers}
      loading={api.importScheduleLoading}
      importing={api.importScheduleImporting}
      progressPercent={api.importScheduleProgressPercent}
      error={api.importScheduleError}
      emptyHint={api.importScheduleEmptyHint}
      onClose={api.closeImportSchedule}
      onImport={api.importManualSchedule}
    />
  );
}
