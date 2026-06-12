import type { EnglishTeacherReviewRecord, EnglishTeacherReviewSortField } from "./types";
import type { Locale } from "@/i18n/messages";

/** 访客示例数据（非真实记录，仅演示功能用法） */
export function getEtrDemoRecords(locale: Locale): EnglishTeacherReviewRecord[] {
  if (locale === "zh") {
    return [
      {
        id: 101,
        teacher_name: "示例·Amy",
        class_date: "2026-05-12",
        score: 8,
        remark: "发音清晰，会纠正语法，节奏适中，适合练口语。",
        created_at: "2026-05-12 10:00:00",
        updated_at: "2026-05-12 10:00:00",
      },
      {
        id: 102,
        teacher_name: "示例·David",
        class_date: "2026-05-18",
        score: 3,
        remark: "偶尔迟到，课件准备不足，沟通时需要多次重复。",
        created_at: "2026-05-18 19:30:00",
        updated_at: "2026-05-18 19:30:00",
      },
      {
        id: 103,
        teacher_name: "示例·Sarah",
        class_date: "2026-05-25",
        score: 9,
        remark: "耐心引导，会总结本课重点，课后有复习建议，推荐续课。",
        created_at: "2026-05-25 08:15:00",
        updated_at: "2026-05-25 08:15:00",
      },
    ];
  }

  return [
    {
      id: 101,
      teacher_name: "Demo · Amy",
      class_date: "2026-05-12",
      score: 8,
      remark: "Clear pronunciation, helpful grammar corrections, good pacing for speaking practice.",
      created_at: "2026-05-12 10:00:00",
      updated_at: "2026-05-12 10:00:00",
    },
    {
      id: 102,
      teacher_name: "Demo · David",
      class_date: "2026-05-18",
      score: 3,
      remark: "Sometimes late, light lesson prep, needed several repeats to understand questions.",
      created_at: "2026-05-18 19:30:00",
      updated_at: "2026-05-18 19:30:00",
    },
    {
      id: 103,
      teacher_name: "Demo · Sarah",
      class_date: "2026-05-25",
      score: 9,
      remark: "Patient, summarizes key points, gives follow-up study tips — worth booking again.",
      created_at: "2026-05-25 08:15:00",
      updated_at: "2026-05-25 08:15:00",
    },
  ];
}

export function sortEtrDemoRecords(
  rows: EnglishTeacherReviewRecord[],
  sortField: EnglishTeacherReviewSortField,
  sortOrder: "asc" | "desc"
): EnglishTeacherReviewRecord[] {
  const sorted = [...rows].sort((a, b) => {
    const av = a[sortField];
    const bv = b[sortField];
    if (av === bv) return a.id - b.id;
    if (av == null) return 1;
    if (bv == null) return -1;
    const cmp = av < bv ? -1 : 1;
    return sortOrder === "asc" ? cmp : -cmp;
  });
  return sorted;
}
