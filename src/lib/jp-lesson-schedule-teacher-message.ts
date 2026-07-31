import { beijingTimeHm } from "@/lib/jp-lesson-shared";

/**
 * 统一日程详情「复制文字模板」：发给老师上课用的说明（含时间 + 教案链接）。
 * 与新课列表「带文字」同用途，但补上节次时间，避免老师不知道上哪一节。
 */

function formatTeacherGreetingName(teachers: string): string {
  const raw = teachers.trim();
  if (!raw || raw === "手动日程" || raw === "未指定") return "老师";
  const parts = raw
    .split(/[、,，]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => (part.endsWith("老师") ? part : `${part}老师`));
  return parts.length ? parts.join("、") : "老师";
}

export type ScheduleTeacherMessageTemplateInput = {
  teachers: string;
  classAt: string;
  end: Date;
  /** 标题或词条预览 */
  contentPreview: string;
  /** 完整教案 URL（已含站点域名） */
  materialUrls: string[];
};

export function buildScheduleTeacherMessageTemplate(
  input: ScheduleTeacherMessageTemplateInput
): string {
  const name = formatTeacherGreetingName(input.teachers);
  const timeRange = `${input.classAt.slice(0, 16)} - ${beijingTimeHm(input.end)}`;
  const content = input.contentPreview.trim().replace(/\s+/g, " ");
  const urls = input.materialUrls.map((url) => url.trim()).filter(Boolean);

  const lines: string[] = [
    `${name}你好，请上这一节课：`,
    `时间：${timeRange}（北京时间）`,
  ];
  if (content) {
    lines.push(`内容：${content}`);
  }
  if (urls.length === 1) {
    lines.push(`教案：${urls[0]}`);
  } else if (urls.length > 1) {
    lines.push("教案：");
    for (const url of urls) {
      lines.push(url);
    }
  } else {
    lines.push("教案：（暂无查看链接，请到日程详情打开教材）");
  }
  return lines.join("\n");
}
