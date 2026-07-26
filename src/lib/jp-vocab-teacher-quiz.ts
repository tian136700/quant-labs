import { jpVocabClassNotesDisplayLength } from "@/lib/jp-vocab-class-notes";
import type { JpVocabWord } from "@/lib/types";

export type JpVocabTeacherQuizMode = "sequential" | "random";

export type JpVocabTeacherQuizSession = {
  mode: JpVocabTeacherQuizMode;
  wordIds: number[];
  currentIndex: number;
};

/**
 * 老师端抽查固定随机（禁止正序）。
 * 正序易让学生背住当日序号顺序；与韩语抽问一致，不提供手选。
 */
export function pickRandomJpVocabTeacherQuizMode(): JpVocabTeacherQuizMode {
  return "random";
}

export function jpVocabTeacherQuizModeLabel(
  mode: JpVocabTeacherQuizMode,
  locale: "zh" | "en" = "zh"
): string {
  if (locale === "en") {
    return mode === "random" ? "Random" : "Sequential";
  }
  return mode === "random" ? "随机" : "正序";
}

/** 备注 ≤ 此字数时抽查弹窗内直接展示；网页端卡片可滚动后放宽阈值 */
export const JP_VOCAB_TEACHER_QUIZ_NOTES_INLINE_MAX = 4000;

export function jpVocabTeacherQuizNotesInline(notes: string | null | undefined): boolean {
  return jpVocabClassNotesDisplayLength(notes) <= JP_VOCAB_TEACHER_QUIZ_NOTES_INLINE_MAX;
}

function shuffleWordIds(ids: number[]): number[] {
  const next = [...ids];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

/** 今日可抽查词条按当日序号 1…N 正序排列 */
export function sortJpVocabQuizTargetWordsByDailySeq(
  words: JpVocabWord[],
  dailySeqByWordId: ReadonlyMap<number, number>
): JpVocabWord[] {
  return [...words].sort((a, b) => {
    const seqA = dailySeqByWordId.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const seqB = dailySeqByWordId.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    return seqA - seqB;
  });
}

/** 抽查队列辅助：尚未勾选熟悉程度的词（用于进度 / 跳「下一个」） */
export function filterJpVocabTeacherQuizUncheckedWords(
  words: JpVocabWord[],
  hasLevel: (wordId: number) => boolean
): JpVocabWord[] {
  return words.filter((w) => !hasLevel(w.id));
}

export function buildJpVocabTeacherQuizWordIds(
  mode: JpVocabTeacherQuizMode,
  quizTargetWords: JpVocabWord[],
  dailySeqByWordId: ReadonlyMap<number, number>
): number[] {
  const ordered = sortJpVocabQuizTargetWordsByDailySeq(
    quizTargetWords,
    dailySeqByWordId
  );
  const ids = ordered.map((w) => w.id);
  return mode === "random" ? shuffleWordIds(ids) : ids;
}

function clampSessionIndex(
  wordIds: number[],
  preferredWordId: number | undefined,
  fallbackIndex: number
): number {
  if (!wordIds.length) return 0;
  if (preferredWordId != null) {
    const found = wordIds.indexOf(preferredWordId);
    if (found >= 0) return found;
  }
  return Math.max(0, Math.min(fallbackIndex, wordIds.length - 1));
}

/**
 * 从会话中剔除已勾选词；可选保留当前正在看的词（方便改选熟悉程度后再点「下一个」）。
 * 无剩余词时返回 null。
 * 注意：进行中的抽查导航（上一个/下一个）不要靠这个剪队列——应保留完整本轮顺序以便回看。
 */
export function pruneJpVocabTeacherQuizSessionChecked(
  session: JpVocabTeacherQuizSession,
  hasLevel: (wordId: number) => boolean,
  options?: { keepWordId?: number | null }
): JpVocabTeacherQuizSession | null {
  const keepWordId = options?.keepWordId ?? null;
  const wordIds = session.wordIds.filter(
    (id) => !hasLevel(id) || id === keepWordId
  );
  if (!wordIds.length) return null;
  const currentWordId = session.wordIds[session.currentIndex];
  return {
    mode: session.mode,
    wordIds,
    currentIndex: clampSessionIndex(wordIds, currentWordId, 0),
  };
}

/**
 * 开始抽查：本轮目标词全量入队并打乱一次（老师端固定随机）。
 * 已勾选词仍留在队列里，便于「上一个」回看勾选；落点优先未勾选词。
 * 全部已勾选时返回 null。
 * `_mode` 保留兼容旧调用；新会话一律 `"random"`，忽略传入的正序。
 */
export function createJpVocabTeacherQuizSession(
  _mode: JpVocabTeacherQuizMode,
  quizTargetWords: JpVocabWord[],
  dailySeqByWordId: ReadonlyMap<number, number>,
  startWordId?: number,
  hasLevel?: (wordId: number) => boolean
): JpVocabTeacherQuizSession | null {
  const mode: JpVocabTeacherQuizMode = "random";
  const wordIds = buildJpVocabTeacherQuizWordIds(
    mode,
    quizTargetWords,
    dailySeqByWordId
  );
  if (!wordIds.length) return null;
  if (hasLevel && wordIds.every((id) => hasLevel(id))) return null;

  let currentIndex = 0;
  if (startWordId != null) {
    const foundIndex = wordIds.indexOf(startWordId);
    if (
      foundIndex >= 0 &&
      (!hasLevel || !hasLevel(startWordId))
    ) {
      currentIndex = foundIndex;
    } else if (hasLevel) {
      const firstUnchecked = wordIds.findIndex((id) => !hasLevel(id));
      currentIndex = firstUnchecked >= 0 ? firstUnchecked : 0;
    } else if (foundIndex >= 0) {
      currentIndex = foundIndex;
    }
  } else if (hasLevel) {
    const firstUnchecked = wordIds.findIndex((id) => !hasLevel(id));
    currentIndex = firstUnchecked >= 0 ? firstUnchecked : 0;
  }
  return { mode, wordIds, currentIndex };
}

/** 抽查卡片内全部词条均已勾选熟悉程度 */
export function isJpVocabTeacherQuizSessionComplete(
  session: JpVocabTeacherQuizSession,
  hasLevel: (wordId: number) => boolean
): boolean {
  return session.wordIds.every((id) => hasLevel(id));
}

/**
 * 会话内从 fromIndex 起第一个尚未勾选熟悉程度的下标；没有则返回 -1。
 * 点「完成抽查」时尚有剩余时，应跳到此处并给出弹窗内提示，禁止只 setStatus 在遮罩后。
 */
export function findFirstUncheckedJpVocabTeacherQuizIndex(
  session: JpVocabTeacherQuizSession,
  hasLevel: (wordId: number) => boolean,
  fromIndex = 0
): number {
  for (let i = Math.max(0, fromIndex); i < session.wordIds.length; i++) {
    if (!hasLevel(session.wordIds[i]!)) return i;
  }
  return -1;
}

/** 恢复持久化会话时，剔除已不在今日抽查范围内的词并保持索引有效 */
export function reconcileJpVocabTeacherQuizSession(
  session: JpVocabTeacherQuizSession,
  validWordIds: ReadonlySet<number>
): JpVocabTeacherQuizSession | null {
  const wordIds = session.wordIds.filter((id) => validWordIds.has(id));
  if (!wordIds.length) return null;
  const currentWordId = session.wordIds[session.currentIndex];
  return {
    mode: session.mode,
    wordIds,
    currentIndex: clampSessionIndex(wordIds, currentWordId, session.currentIndex),
  };
}

/**
 * 管理员调高今日抽查数量后，把进行中的抽查会话补全到最新目标词表。
 * 保留已勾选词（「上一个」可回看）；仅当目标池内全部已勾选时返回 null。
 */
export function expandJpVocabTeacherQuizSessionForTarget(
  session: JpVocabTeacherQuizSession,
  quizTargetWords: JpVocabWord[],
  dailySeqByWordId: ReadonlyMap<number, number>,
  hasLevel?: (wordId: number) => boolean
): JpVocabTeacherQuizSession | null {
  // 新词追加顺序也按随机池；遗留正序会话一并收成 random
  const targetIds = buildJpVocabTeacherQuizWordIds(
    "random",
    quizTargetWords,
    dailySeqByWordId
  );
  if (!targetIds.length) {
    if (!hasLevel) return session.mode === "random" ? session : { ...session, mode: "random" };
    // 禁止 `prune ?? session`：全部勾选后 prune 为 null 时若回退旧会话，弹窗会永远关不掉
    const pruned = pruneJpVocabTeacherQuizSessionChecked(session, hasLevel);
    return pruned && pruned.mode !== "random"
      ? { ...pruned, mode: "random" }
      : pruned;
  }

  if (hasLevel && targetIds.every((id) => hasLevel(id))) {
    return null;
  }

  const currentWordId = session.wordIds[session.currentIndex];
  // 随机：保留本轮已定顺序（含已勾选），再追加目标池里尚未入队的词
  const targetSet = new Set(targetIds);
  const kept = session.wordIds.filter((id) => targetSet.has(id));
  const inSession = new Set(kept);
  const wordIds = [...kept, ...targetIds.filter((id) => !inSession.has(id))];

  const preferredId =
    currentWordId != null && wordIds.includes(currentWordId)
      ? currentWordId
      : undefined;

  return {
    mode: "random",
    wordIds,
    currentIndex: clampSessionIndex(
      wordIds,
      preferredId,
      session.currentIndex
    ),
  };
}

/** 列表点选或恢复抽查时，定位到点击的词；否则跳到第一个未勾选的词 */
export function resolveJpVocabTeacherQuizResumeIndex(
  session: JpVocabTeacherQuizSession,
  preferredWordId: number | undefined,
  hasLevel: (wordId: number) => boolean
): number {
  if (preferredWordId != null) {
    const preferredIndex = session.wordIds.indexOf(preferredWordId);
    if (preferredIndex >= 0) return preferredIndex;
  }
  const firstUnchecked = session.wordIds.findIndex((id) => !hasLevel(id));
  if (firstUnchecked >= 0) return firstUnchecked;
  return Math.max(
    0,
    Math.min(session.currentIndex, session.wordIds.length - 1)
  );
}

/**
 * 刷新/掉线恢复：定位到本会话内第一个尚未勾选熟悉程度的词（正序即「下一个待抽查」）；
 * 若已全部勾选，则落到会话内最后一词或起始索引。
 */
export function resolveJpVocabTeacherQuizRefreshResumeIndex(
  session: JpVocabTeacherQuizSession,
  _wordsById: ReadonlyMap<number, JpVocabWord>,
  _sessionReviewAt: Readonly<Record<number, number>>,
  hasLevel: (wordId: number) => boolean
): number {
  return resolveJpVocabTeacherQuizResumeIndex(session, undefined, hasLevel);
}
