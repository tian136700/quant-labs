import type { EtrUser } from "@/lib/etr-auth";

/** 不受课表自动启用控制的账号（仅管理员手动开关） */
export const TEACHER_SCHEDULE_AUTO_ENABLE_EXCLUDED_USERNAMES = [
  "user1",
  "test",
] as const;

/**
 * 日语新课设为「学习中」且开课时间在此时长内 → 立即启用关联老师账号。
 * 与每日 05:00「今日有课」启用互补（补上排课晚于 05:00、或开课前不足一天的场景）。
 */
export const TEACHER_LESSON_LEARNING_AUTO_ENABLE_WITHIN_MS =
  18 * 60 * 60 * 1000;

/**
 * 开课前此时长内：定时任务必须把已禁用的关联登录账号改为启用
 * （补上抽完延时禁用后、下午还有课等场景；与 05:00 / 学习中 18h 互补）。
 */
export const TEACHER_PRE_CLASS_AUTO_ENABLE_WITHIN_MS = 2 * 60 * 60 * 1000;

/** 韩语老师：开课前此时长内启用关联登录账号（手动日程按老师姓名匹配） */
export const KO_TEACHER_PRE_CLASS_AUTO_ENABLE_WITHIN_MS = 30 * 60 * 1000;

/**
 * 抽完延时禁用时：开课前 / 下课后再此时长内跳过禁用，避免刚解禁又被禁、或课中被踢。
 * 与 `TEACHER_PRE_CLASS_AUTO_ENABLE_WITHIN_MS` 同窗口（按 class_at→下课时刻计算）。
 */
export const TEACHER_QUIZ_DISABLE_SKIP_NEAR_CLASS_MS =
  TEACHER_PRE_CLASS_AUTO_ENABLE_WITHIN_MS;

/** 韩语抽完禁用：临近课窗口与开课前 30min 启用一致 */
export const KO_TEACHER_QUIZ_DISABLE_SKIP_NEAR_CLASS_MS =
  KO_TEACHER_PRE_CLASS_AUTO_ENABLE_WITHIN_MS;

/**
 * 下课（开课 + 课时）后，再过此时长 → 自动禁用关联登录账号。
 * 北京墙钟；有后续未结束/未过宽限的课则不禁。
 */
export const TEACHER_POST_CLASS_DISABLE_AFTER_MS = 10 * 60 * 1000;

/**
 * 下课禁用「补跑窗口」：超过 latestDisableAt 后再过此时长，不再因旧课反复 due。
 * 防止昨天已下课的课把账号整日钉在 due 上，管理员一点启用就被定时任务再禁。
 */
export const TEACHER_POST_CLASS_DISABLE_CATCHUP_MS = 2 * 60 * 60 * 1000;

export function isExcludedFromTeacherScheduleAutoEnable(
  user: Pick<EtrUser, "role" | "username" | "never_disable">
): boolean {
  /** 用户管理「永不禁用」：启禁定时任务均跳过（含课表启用 / 下课禁用 / 抽完禁用） */
  if ((user.never_disable ?? 0) !== 0) return true;
  if (user.role === "admin") return true;
  const lower = user.username.trim().toLowerCase();
  return TEACHER_SCHEDULE_AUTO_ENABLE_EXCLUDED_USERNAMES.some(
    (name) => lower === name
  );
}

export type TeacherUserEnableSkip = {
  user_id: number;
  username: string;
  teacher_id: number;
  reason: string;
};

export type TeacherUserEnableHit = {
  user_id: number;
  username: string;
  teacher_id: number;
};

export type TeacherUserScheduleEnableResult = {
  date: string;
  dry_run: boolean;
  teachers_with_class: number[];
  enabled: TeacherUserEnableHit[];
  skipped: TeacherUserEnableSkip[];
};

export type TeacherUserLearningLessonEnableResult = {
  triggered: boolean;
  reason?: string;
  dry_run: boolean;
  within_ms: number;
  enabled: TeacherUserEnableHit[];
  skipped: TeacherUserEnableSkip[];
};

export type TeacherUserPreClassEnableResult = {
  dry_run: boolean;
  within_ms: number;
  teachers_with_upcoming_class: number[];
  enabled: TeacherUserEnableHit[];
  skipped: TeacherUserEnableSkip[];
  /** 韩语老师开课前启用窗口（默认 30min） */
  ko_within_ms?: number;
  ko_teachers_with_upcoming_class?: number[];
  /** 英语老师开课前启用窗口（默认 30min；手动日程姓名匹配） */
  en_within_ms?: number;
  en_teachers_with_upcoming_class?: number[];
};

export type TeacherUserPostClassDisableHit = {
  user_id: number;
  username: string;
  teacher_id: number;
};

export type TeacherUserPostClassDisableResult = {
  dry_run: boolean;
  grace_ms: number;
  teachers_due: number[];
  disabled: TeacherUserPostClassDisableHit[];
  skipped: TeacherUserEnableSkip[];
};
