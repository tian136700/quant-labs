/**
 * 多个来源字段（如用法 + 例句）→ 去重后的原始串列表。
 * 按 formatJpVocabSourceDisplay 结果去重：展示相同只保留第一次出现。
 */
export function uniqueJpVocabSourcesForDisplay(
  ...sources: Array<string | null | undefined>
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of sources) {
    const original = String(raw ?? "").trim();
    if (!original) continue;
    const display = formatJpVocabSourceDisplay(original);
    if (!display || seen.has(display)) continue;
    seen.add(display);
    out.push(original);
  }
  return out;
}

/** 规范化展示：模型名/版本在前，本地|线上|手动在后 */
export function formatJpVocabSourceDisplay(raw: string | null | undefined): string {
  const original = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (!original) return "";

  const tags = ["本地", "线上", "手动"] as const;
  let text = original;
  let deploy: (typeof tags)[number] | null = null;

  for (const tag of tags) {
    if (text === tag) {
      return tag;
    }
    const start = new RegExp(`^${tag}\\s+`);
    const end = new RegExp(`\\s+${tag}$`);
    if (start.test(text)) {
      deploy = tag;
      text = text.replace(start, "").trim();
      break;
    }
    if (end.test(text)) {
      deploy = tag;
      text = text.replace(end, "").trim();
      break;
    }
  }

  if (!deploy) {
    for (const tag of tags) {
      if (text.endsWith(tag) && text.length > tag.length) {
        const before = text.slice(0, -tag.length).trim();
        // 「Qwen本地」这类紧贴：前面须像模型名（含字母/数字）
        if (/[A-Za-z0-9]/.test(before)) {
          deploy = tag;
          text = before;
          break;
        }
      }
    }
  }

  if (text && deploy) return `${text} · ${deploy}`;
  if (text) return text;
  if (deploy) return deploy;
  return original;
}
