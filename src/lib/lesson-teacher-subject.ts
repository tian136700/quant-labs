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

/** 非日语老师：不创建系统登录账号，也不纳入「今日有课自动启用」 */
export function lessonTeacherSubjectSkipsUserAccount(
  subject: LessonTeacherSubject
): boolean {
  return subject !== "jp";
}
