/**
 * 日语新课 · AI 教案提示词：默认模板 + 复制文案组装。
 */

export const JP_LESSON_AI_PLAN_PROMPT_STORAGE_KEY =
  "jp-lesson:ai-plan-prompt-template:v2";

/**
 * 默认提示词（可在弹窗里改；改稿会进 localStorage）。
 * 复制时会先拼「生词表」再拼本段，见 buildJpLessonAiPlanCopyText。
 */
export const JP_LESSON_AI_PLAN_DEFAULT_PROMPT = `请根据上方词条制作一张「图片版单词教案」。

处理规则：
- 词头必须用辞書形（原型），例如写「見る / みる」，不要写「見ます / みます」
- 只去掉一种条目：语法句型格式——以「～」开头，或「～……∕～……」「～……／～……」这种接续格式（例如「～によって∕～によります」）。这类留给语法课，不要做进单词教案
- 除此以外，上方列表里的词必须全部保留、全部做成教案；普通名词/动词/形容词/副词/寒暄语一律保留
- 严禁自行删减大半词表；不要因为「像语法」「不常用」「接续/助词/语气」就丢掉；拿不准就保留

教案图片标题与文件名：按上方课次写「第 N 课的单词」（课次标签已含「第N课」则与之对应；多课合并时写清范围，如「第 22～24 课的单词」）

教案版式要求（输出高清完整图片，A4 纵向教材版式）：
1. 每个单词配一张相关插图（图在词旁或词下，一眼能联想到词义）
2. 用中文显示该词的意思
3. 用中文简要说明用法 / 使用场景（一两句即可）
4. 给一个自然的日语例句（附中文翻译），例句偏口语、常用
5. 每个词后留练习区：「Your turn / Make a sentence / 造个句子」

目的：上课前学生先熟悉这些词，让单词环节不那么枯燥。
这是最终成稿，直接输出最终教材图片。`;

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
  /** 与 words 对齐的中文释义（可空） */
  meanings?: Array<string | null | undefined>;
};

function formatAiPlanWordLine(
  index: number,
  word: string,
  meaning?: string | null
): string {
  const m = (meaning || "").trim();
  if (m) return `${index}. ${word}  ${m}`;
  return `${index}. ${word}`;
}

/** 课次总述（用于生词表抬头） */
export function buildJpLessonAiPlanCourseSummary(
  groups: JpLessonAiPlanWordGroup[]
): string {
  const labels = groups
    .map((g) => (g.courseLabel || "").trim())
    .filter(Boolean);
  const unique = [...new Set(labels)];
  if (unique.length === 1) return unique[0]!;
  if (unique.length > 1) return unique.join("、");
  if (groups.length === 1) return `课程 #${groups[0]!.lessonId}`;
  return `已选 ${groups.length} 课`;
}

/** 组装「生词表 + 提示词」供复制到 ChatGPT（成稿模板） */
export function buildJpLessonAiPlanCopyText(
  groups: JpLessonAiPlanWordGroup[],
  prompt: string
): string {
  const summary = buildJpLessonAiPlanCourseSummary(groups);
  const wordLines: string[] = [
    `以下是${summary}的生词表（仅含待上传词，已去掉云端词库中已有的词；动词已转为辞書形/原型，不要再用ます形做词头）：`,
    "",
  ];

  let globalIndex = 0;
  for (const group of groups) {
    if (groups.length > 1) {
      const headParts = [`#${group.lessonId}`, group.kindLabel];
      if (group.courseLabel?.trim()) headParts.push(group.courseLabel.trim());
      wordLines.push(`【${headParts.join(" · ")}】`);
    }
    if (group.words.length) {
      group.words.forEach((w, i) => {
        globalIndex += 1;
        const meaning = group.meanings?.[i];
        wordLines.push(formatAiPlanWordLine(globalIndex, w, meaning));
      });
    } else {
      wordLines.push("（无学习内容）");
    }
    if (groups.length > 1) wordLines.push("");
  }

  const wordsBlock = wordLines.join("\n").trimEnd();
  const promptBlock = (prompt || "").trim() || JP_LESSON_AI_PLAN_DEFAULT_PROMPT;
  return `${wordsBlock}\n\n${promptBlock}`;
}
