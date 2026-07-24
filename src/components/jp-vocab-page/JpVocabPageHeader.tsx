"use client";

import { JpVocabDailyQuizProgressBar } from "@/components/JpVocabDailyQuizProgressBar";
import { JpVocabQuizTimeWeightAdmin } from "@/components/JpVocabQuizTimeWeightAdmin";
import type { JpVocabDailyQuizProgress } from "@/lib/jp-vocab-daily-quiz-progress";

type JpVocabPageHeaderProps = {
  isAdminMode: boolean;
  isTeacherMode: boolean;
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
  quizTimeWeight: number;
  settingQuizTimeWeight: boolean;
  onQuizTargetInputChange: (value: string) => void;
  onSaveQuizTarget: () => void;
  onGoToCoach: () => void;
  onSaveQuizTimeWeight: (weight: number) => Promise<boolean>;
};

export function JpVocabPageHeader({
  isAdminMode,
  isTeacherMode,
  teacherShareUiEnabled,
  canOperate,
  checking,
  userRole,
  error,
  displayQuizProgress,
  quizTargetInput,
  teacherVisibleQuizTarget,
  settingQuizTarget,
  showTeacherCoachEntry,
  exporting,
  dailyCoachLevelCounts,
  quizTimeWeight,
  settingQuizTimeWeight,
  onQuizTargetInputChange,
  onSaveQuizTarget,
  onGoToCoach,
  onSaveQuizTimeWeight,
}: JpVocabPageHeaderProps) {
  return (
    <>
      <h1 style={{ fontSize: "1.5rem", margin: "0 0 0.35rem" }}>
        {isAdminMode ? "日语抽问-管理员端" : "日语抽问-老师端"}
      </h1>
      <p style={{ color: "var(--muted)", marginBottom: "0.75rem" }}>
        {teacherShareUiEnabled ? (
          <>
            抽查 → 提问后勾选熟悉程度 → 答不出或不熟悉时点「发给学生」（同时
            <strong>系统自动标记为不熟悉</strong>），供学生复习。
          </>
        ) : isAdminMode ? (
          <>
            管理全库词条、设置今日抽查数量与导出。老师端按可见池抽查；学生端可通过「查看老师正在抽查的单词」获取当前词。
          </>
        ) : (
          <>
            抽查 → 提问后勾选熟悉程度。学生可通过「查看老师正在抽查的单词」获取当前词。
          </>
        )}
      </p>

      {!canOperate && !checking ? (
        <p
          className="hint"
          role="note"
          style={{
            marginBottom: "1rem",
            padding: "0.65rem 0.85rem",
            borderRadius: "6px",
            border: "1px solid var(--border)",
            background: "var(--panel)",
            fontSize: "0.875rem",
          }}
        >
          {userRole === "user"
            ? "当前账号仅可浏览；修改数据需登录用户权限。"
            : "当前为浏览模式；修改数据需登录。"}
        </p>
      ) : null}

      {error ? (
        <p className="empty" role="alert" style={{ color: "var(--rise)" }}>
          {error}
        </p>
      ) : null}

      {canOperate &&
      (displayQuizProgress.total > 0 ||
        displayQuizProgress.complete ||
        isAdminMode) ? (
        <JpVocabDailyQuizProgressBar
          progress={displayQuizProgress}
          variant="teacher"
          adminQuizTarget={
            isAdminMode
              ? {
                  value: quizTargetInput,
                  savedValue: teacherVisibleQuizTarget,
                  saving: settingQuizTarget,
                  onChange: onQuizTargetInputChange,
                  onSave: onSaveQuizTarget,
                }
              : undefined
          }
          coachAction={
            showTeacherCoachEntry
              ? {
                  busy: exporting,
                  coachCount:
                    dailyCoachLevelCounts.normal + dailyCoachLevelCounts.weak,
                  onClick: onGoToCoach,
                }
              : undefined
          }
        />
      ) : null}

      {isAdminMode ? (
        <JpVocabQuizTimeWeightAdmin
          value={quizTimeWeight}
          saving={settingQuizTimeWeight}
          onSave={onSaveQuizTimeWeight}
        />
      ) : null}
    </>
  );
}
