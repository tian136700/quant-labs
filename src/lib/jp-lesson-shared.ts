/** 将上传时的 content 拆成单个单词/语法项（与后端入库逻辑一致） */
export function parseLessonContent(raw: string): string[] {
  return (raw || "")
    .split(/[,，、]/)
    .map((s) => s.trim())
    .filter(Boolean);
}
