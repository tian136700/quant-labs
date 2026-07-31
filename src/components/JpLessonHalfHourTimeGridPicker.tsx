"use client";

export {
  LessonHmTimeSelect as JpLessonHalfHourTimeGridPicker,
  type LessonHmTimeSelectProps,
} from "@/components/LessonHmTimeSelect";

/** @deprecated 请用 LessonHmTimeSelectProps；保留兼容旧 import */
export type HalfHourTimeOption = { value: string; label: string };
