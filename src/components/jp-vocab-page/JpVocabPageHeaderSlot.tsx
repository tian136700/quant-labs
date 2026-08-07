"use client";

import { JpVocabPageHeader } from "@/components/jp-vocab-page/JpVocabPageHeader";
import { jpVocabCoachPath } from "@/lib/locale-path";
import type { JpVocabDailyQuizProgress } from "@/lib/jp-vocab-daily-quiz-progress";

type Props = {
  isAdminMode: boolean;
  teacherShareUiEnabled: boolean;
  canOperate: boolean;
  checking: boolean;
  userRole: string | undefined;
  error: string;
  displayQuizProgress: JpVocabDailyQuizProgress;
  quizTargetInput: string;
  teacherVisibleQuizTarget: number;
  settingQuizTarget: boolean;
  showTeacherCoachEntry: boolean;
  exporting: boolean;
  dailyCoachLevelCounts: { normal: number; weak: number };
  onQuizTargetInputChange: (value: string) => void;
  onQuizTargetInputFocusChange?: (focused: boolean) => void;
  onSaveQuizTarget: () => void;
};

/** 编排页页头：抽进度条 / 今日目标；教练入口跳转集中在此，避免 JpVocabPage 超行。 */
export function JpVocabPageHeaderSlot(props: Props) {
  return (
    <JpVocabPageHeader
      {...props}
      onGoToCoach={() => {
        window.location.assign(jpVocabCoachPath());
      }}
    />
  );
}
