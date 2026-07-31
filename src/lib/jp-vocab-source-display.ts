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

/** 线上付费 Claude 补全（含误写成 Cloud / 长模型名）→ 短标 Claude */
function isOnlineClaudeSource(original: string): boolean {
  if (/^claude$/i.test(original)) return true;
  // 曾误标为 Cloud；存量「线上 …」长串
  if (/^cloud$/i.test(original)) return true;
  if (original === "线上") return true;
  if (original.includes("线上")) return true;
  if (/\bonline\b/i.test(original)) return true;
  if (/\bcloud\b/i.test(original)) return true;
  // claude-sonnet-4-6 / Claude 3.5 等模型 id
  if (/\bclaude\b/i.test(original)) return true;
  return false;
}

/**
 * 规范化展示：
 * - 线上 Claude 补全 → 一律「Claude」（不展示版本长名；Claude ≠ Cloud）
 * - 手动 →「手动」
 * - 本地 →「模型 · 本地」或「本地」
 */
export function formatJpVocabSourceDisplay(raw: string | null | undefined): string {
  const original = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (!original) return "";

  if (isOnlineClaudeSource(original)) return "Claude";
  if (original === "手动") return "手动";
  if (original === "本地") return "本地";

  const tags = ["本地", "线上", "手动"] as const;
  let text = original;
  let deploy: (typeof tags)[number] | null = null;

  for (const tag of tags) {
    if (text === tag) {
      return tag === "线上" ? "Claude" : tag;
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

  if (deploy === "线上") return "Claude";
  if (text && deploy) return `${text} · ${deploy}`;
  if (text) return text;
  if (deploy) return deploy;
  return original;
}
