/** 新课「设置上课时间」弹窗：表单行校验（客户端 + 服务端 normalize 共用） */

export const LESSON_SCHEDULE_DUPLICATE_MESSAGE = "已有相同的数据已添加";

export type LessonScheduleFormRow = {
  key: string;
  date: string;
  time: string;
  duration: string;
};

export type LessonScheduleFormFingerprintOptions = {
  /** 时长留空时的默认值（英语 25；日语可省略） */
  defaultDurationMinutes?: number | null;
};

function normalizeDurationForFingerprint(
  raw: string,
  defaultDurationMinutes?: number | null
): number | null {
  const trimmed = raw.trim();
  if (trimmed) {
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return defaultDurationMinutes ?? null;
}

/** 日期 + 时间 + 时长 均有效时返回唯一键；否则 null（不参与重复判断） */
export function lessonScheduleFormRowFingerprint(
  row: Pick<LessonScheduleFormRow, "date" | "time" | "duration">,
  options?: LessonScheduleFormFingerprintOptions
): string | null {
  const date = row.date.trim();
  const time = row.time.trim();
  if (!date || !time) return null;
  const duration = normalizeDurationForFingerprint(
    row.duration,
    options?.defaultDurationMinutes
  );
  return `${date}|${time}|${duration ?? ""}`;
}

/** 返回应标红的行 key（保留第一条，后续重复项） */
export function findDuplicateLessonScheduleRowKeys(
  rows: LessonScheduleFormRow[],
  options?: LessonScheduleFormFingerprintOptions
): Set<string> {
  const seen = new Map<string, string>();
  const duplicates = new Set<string>();

  for (const row of rows) {
    const fingerprint = lessonScheduleFormRowFingerprint(row, options);
    if (!fingerprint) continue;
    const firstKey = seen.get(fingerprint);
    if (firstKey) {
      duplicates.add(row.key);
    } else {
      seen.set(fingerprint, row.key);
    }
  }

  return duplicates;
}

export function hasDuplicateLessonScheduleRows(
  rows: LessonScheduleFormRow[],
  options?: LessonScheduleFormFingerprintOptions
): boolean {
  return findDuplicateLessonScheduleRowKeys(rows, options).size > 0;
}

export function hasDuplicateClassScheduleInputs(
  schedules: Array<{ class_at: string; duration_minutes: number | null }>
): boolean {
  const seen = new Set<string>();
  for (const item of schedules) {
    const key = `${item.class_at.trim()}|${item.duration_minutes ?? ""}`;
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

export function lessonScheduleSaveErrorMessage(error: string | undefined): string {
  if (error === "schedule_duplicate") return LESSON_SCHEDULE_DUPLICATE_MESSAGE;
  return error?.trim() || "保存失败";
}
