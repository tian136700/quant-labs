/**
 * 日语新课 · AI 教案提示词：默认模板 + 复制文案组装。
 */

export const JP_LESSON_AI_PLAN_PROMPT_STORAGE_KEY =
  "jp-lesson:ai-plan-prompt-template";

/** 默认提示词（可在弹窗里改；改稿会进 localStorage） */
export const JP_LESSON_AI_PLAN_DEFAULT_PROMPT = `请根据下面的日语单词，做一张竖版日语单词教案图片（适合手机查看）。

要求：
1. 白底或浅色底，字迹清晰，适合打印或投屏。
2. 标题写「单词学习」，下方列出全部单词；每个单词旁可留空行写假名/释义（若未提供则留空即可）。
3. 版面整齐，不要多余装饰；不要水印；不要英文说明。
4. 只输出一张完整教案图，不要额外文字回复。`;

export function readStoredJpLessonAiPlanPrompt(
  fallback: string = JP_LESSON_AI_PLAN_DEFAULT_PROMPT
): string {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(JP_LESSON_AI_PLAN_PROMPT_STORAGE_KEY);
    const trimmed = (raw || "").trim();
    return trimmed || fallback;
  } catch {
    return fallback;
  }
}

export function writeStoredJpLessonAiPlanPrompt(prompt: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      JP_LESSON_AI_PLAN_PROMPT_STORAGE_KEY,
      (prompt || "").trim() || JP_LESSON_AI_PLAN_DEFAULT_PROMPT
    );
  } catch {
    /* ignore */
  }
}

export type JpLessonAiPlanWordGroup = {
  lessonId: number;
  courseLabel: string | null;
  kindLabel: string;
  words: string[];
};

/** 组装「单词块 + 提示词」供复制到 ChatGPT */
export function buildJpLessonAiPlanCopyText(
  groups: JpLessonAiPlanWordGroup[],
  prompt: string
): string {
  const wordLines: string[] = [];
  for (const group of groups) {
    const headParts = [`#${group.lessonId}`, group.kindLabel];
    if (group.courseLabel?.trim()) headParts.push(group.courseLabel.trim());
    wordLines.push(`【${headParts.join(" · ")}】`);
    if (group.words.length) {
      group.words.forEach((w, i) => {
        wordLines.push(`${i + 1}. ${w}`);
      });
    } else {
      wordLines.push("（无学习内容）");
    }
    wordLines.push("");
  }
  const wordsBlock = wordLines.join("\n").trimEnd();
  const promptBlock = (prompt || "").trim() || JP_LESSON_AI_PLAN_DEFAULT_PROMPT;
  return `${wordsBlock}\n\n--------\n\n${promptBlock}`;
}
