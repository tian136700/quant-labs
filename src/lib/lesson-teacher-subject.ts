import type { LessonTeacherSubject } from "@/lib/locale-path";

export const LESSON_TEACHER_SUBJECTS: LessonTeacherSubject[] = ["jp", "en", "ko"];

export function otherLessonTeacherSubjects(
  current: LessonTeacherSubject
): LessonTeacherSubject[] {
  return LESSON_TEACHER_SUBJECTS.filter((subject) => subject !== current);
}

export function teachersApiBase(subject: LessonTeacherSubject): string {
  if (subject === "en") return "/api/admin/en-lesson-teachers";
  if (subject === "ko") return "/api/admin/ko-lesson-teachers";
  return "/api/admin/jp-lesson-teachers";
}

export function teacherReviewApiBase(subject: LessonTeacherSubject): string {
  if (subject === "en") return "/api/admin/en-lesson-teacher-review";
  if (subject === "ko") return "/api/admin/ko-lesson-teacher-review";
  return "/api/admin/jp-lesson-teacher-review";
}

/** 人员管理 URL：日语默认不带 subject；英语/韩语用 ?subject= */
export function lessonTeacherSubjectSearchParam(
  subject: LessonTeacherSubject
): string | null {
  return subject === "jp" ? null : subject;
}

export function lessonTeacherSubjectLabel(
  subject: LessonTeacherSubject,
  locale: "zh" | "en"
): string {
  if (subject === "en") return locale === "zh" ? "英语老师" : "English";
  if (subject === "ko") return locale === "zh" ? "韩语老师" : "Korean";
  return locale === "zh" ? "日语老师" : "Japanese";
}

/** 英语老师也可建登录账号（开课前 30min 启 / 抽完 +1h 禁）；不再跳过 */
export function lessonTeacherSubjectSkipsUserAccount(
  _subject: LessonTeacherSubject
): boolean {
  return false;
}
