/**
 * 英语老师腾讯会议号：规范化、复制选择（多老师时询问序号）。
 */

export const EN_LESSON_NO_MEETING_ID_MESSAGE = "此老师没有会议号";

export type EnLessonMeetingTeacherRef = {
  id: number;
  name: string;
  tencent_meeting_id?: string | null;
};

/** 去掉空白；空串 → null。保留数字与连字符（如 849-255-3123）。 */
export function normalizeTencentMeetingId(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim().replace(/\s+/g, "");
  if (!s) return null;
  return s;
}

export type ResolveEnLessonMeetingCopyResult =
  | { ok: true; meetingId: string; teacherName: string }
  | { ok: false; message: string };

/**
 * 从本课已选老师里解析要复制的会议号。
 * 多名老师时用 prompt 问序号；取消 → message 空串（调用方勿 toast）。
 */
export function resolveEnLessonMeetingIdForCopy(
  teachers: EnLessonMeetingTeacherRef[],
  askWhichTeacher: (promptText: string) => string | null = (text) =>
    typeof window !== "undefined" ? window.prompt(text) : null
): ResolveEnLessonMeetingCopyResult {
  const list = teachers.filter((t) => (t.name || "").trim());
  if (!list.length) {
    return { ok: false, message: EN_LESSON_NO_MEETING_ID_MESSAGE };
  }

  let chosen: EnLessonMeetingTeacherRef;
  if (list.length === 1) {
    chosen = list[0];
  } else {
    const lines = list
      .map((t, i) => `${i + 1}. ${t.name.trim()}`)
      .join("\n");
    const raw = askWhichTeacher(
      `复制哪个老师的腾讯会议号？\n${lines}\n请输入序号（1-${list.length}）`
    );
    if (raw == null) {
      return { ok: false, message: "" };
    }
    const idx = Number(String(raw).trim());
    if (!Number.isInteger(idx) || idx < 1 || idx > list.length) {
      return { ok: false, message: "请输入有效的老师序号" };
    }
    chosen = list[idx - 1];
  }

  const meetingId = normalizeTencentMeetingId(chosen.tencent_meeting_id);
  if (!meetingId) {
    return { ok: false, message: EN_LESSON_NO_MEETING_ID_MESSAGE };
  }
  return {
    ok: true,
    meetingId,
    teacherName: chosen.name.trim(),
  };
}
