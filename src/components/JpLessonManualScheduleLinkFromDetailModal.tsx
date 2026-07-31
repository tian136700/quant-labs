"use client";

import { useMemo } from "react";
import { JpLessonManualScheduleLessonPickModal } from "@/components/JpLessonManualScheduleLessonPickModal";
import { resolveManualScheduleLessonPickOptions } from "@/components/JpLessonManualScheduleLessonPicker";
import {
  linkedLessonKey,
  type ManualScheduleLessonOption,
} from "@/lib/jp-lesson-manual-schedule-linked";
import type { JpLessonManualSchedule } from "@/lib/jp-lesson-manual-schedule";
import { detectScheduleTeacherSubjectFromTitle } from "@/lib/jp-lesson-teacher-rate";
import type { EnLessonRecord, JpLessonRecord } from "@/lib/types";

type Props = {
  open: boolean;
  manual: JpLessonManualSchedule | null;
  jpLessons: JpLessonRecord[];
  enLessons: EnLessonRecord[];
  syncing?: boolean;
  onClose: () => void;
  onPick: (option: ManualScheduleLessonOption) => void | Promise<void>;
};

/**
 * 日程详情右侧「关联教材」：直接打开选教材弹窗，无需先进编辑。
 */
export function JpLessonManualScheduleLinkFromDetailModal({
  open,
  manual,
  jpLessons,
  enLessons,
  syncing = false,
  onClose,
  onPick,
}: Props) {
  const titleSubject = detectScheduleTeacherSubjectFromTitle(manual?.title ?? "");
  const { options, fieldLabel, emptyHint } = useMemo(
    () => resolveManualScheduleLessonPickOptions(titleSubject, jpLessons, enLessons),
    [titleSubject, jpLessons, enLessons]
  );
  const selectedKeys = useMemo(
    () =>
      new Set(
        (manual?.linked_lessons ?? []).map((link) => linkedLessonKey(link))
      ),
    [manual?.linked_lessons]
  );

  return (
    <JpLessonManualScheduleLessonPickModal
      open={open && manual != null}
      options={options}
      selectedKeys={selectedKeys}
      emptyHint={emptyHint}
      fieldLabel={fieldLabel}
      disabled={syncing}
      onClose={onClose}
      onPick={(option) => {
        void onPick(option);
      }}
    />
  );
}
