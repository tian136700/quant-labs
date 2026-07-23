import type { EnVocabWord } from "@/lib/types";

export type EnVocabTeacherQuizMode = "sequential" | "random";

/** 英语抽问会话（与日语同形：正序 / 随机） */
export type EnVocabTeacherQuizSession = {
  mode: EnVocabTeacherQuizMode;
  wordIds: number[];
  currentIndex: number;
};

/** 老师端开始抽查时自动二选一，免去每次手选正序/随机 */
export function pickRandomEnVocabTeacherQuizMode(): EnVocabTeacherQuizMode {
  return Math.random() < 0.5 ? "sequential" : "random";
}

export function enVocabTeacherQuizModeLabel(
  mode: EnVocabTeacherQuizMode,
  locale: "zh" | "en" = "zh"
): string {
  if (locale === "en") {
    return mode === "random" ? "Random" : "Sequential";
  }
  return mode === "random" ? "随机" : "正序";
}

/** 备注 ≤ 此字数时抽查弹窗内直接展示；网页端卡片可滚动后放宽阈值 */
export const EN_VOCAB_TEACHER_QUIZ_NOTES_INLINE_MAX = 4000;

export function enVocabTeacherQuizNotesInline(
  notes: string | null | undefined
): boolean {
  return (notes || "").trim().length <= EN_VOCAB_TEACHER_QUIZ_NOTES_INLINE_MAX;
}

/** 备注 GET 后合并，避免冲掉例句等列表已有字段 */
export function mergeEnVocabWordAfterClassNotesFetch(
  base: EnVocabWord,
  fetched: EnVocabWord
): EnVocabWord {
  return {
    ...base,
    ...fetched,
    example_sentences:
      fetched.example_sentences ?? base.example_sentences ?? null,
    example_sentences_source:
      fetched.example_sentences_source ??
      base.example_sentences_source ??
      null,
    meaning_source: fetched.meaning_source ?? base.meaning_source ?? null,
    reading_source: fetched.reading_source ?? base.reading_source ?? null,
    usage: fetched.usage ?? base.usage ?? null,
    usage_source: fetched.usage_source ?? base.usage_source ?? null,
    class_notes_present:
      Boolean((fetched.class_notes || "").trim()) ||
      fetched.class_notes_present === true,
  };
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
export function sortEnVocabQuizTargetWordsByDailySeq(
  words: EnVocabWord[],
  dailySeqByWordId: ReadonlyMap<number, number>
): EnVocabWord[] {
  return [...words].sort((a, b) => {
    const seqA = dailySeqByWordId.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const seqB = dailySeqByWordId.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    return seqA - seqB;
  });
}

/** 抽查队列只保留尚未勾选熟悉程度的词（已抽过的不再进入卡片） */
export function filterEnVocabTeacherQuizUncheckedWords(
  words: EnVocabWord[],
  hasLevel: (wordId: number) => boolean
): EnVocabWord[] {
  return words.filter((w) => !hasLevel(w.id));
}

export function buildEnVocabTeacherQuizWordIds(
  mode: EnVocabTeacherQuizMode,
  quizTargetWords: EnVocabWord[],
  dailySeqByWordId: ReadonlyMap<number, number>
): number[] {
  const ordered = sortEnVocabQuizTargetWordsByDailySeq(
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
 */
export function pruneEnVocabTeacherQuizSessionChecked(
  session: EnVocabTeacherQuizSession,
  hasLevel: (wordId: number) => boolean,
  options?: { keepWordId?: number | null }
): EnVocabTeacherQuizSession | null {
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

export function createEnVocabTeacherQuizSession(
  mode: EnVocabTeacherQuizMode,
  quizTargetWords: EnVocabWord[],
  dailySeqByWordId: ReadonlyMap<number, number>,
  startWordId?: number,
  hasLevel?: (wordId: number) => boolean
): EnVocabTeacherQuizSession | null {
  const pool = hasLevel
    ? filterEnVocabTeacherQuizUncheckedWords(quizTargetWords, hasLevel)
    : quizTargetWords;
  const wordIds = buildEnVocabTeacherQuizWordIds(
    mode,
    pool,
    dailySeqByWordId
  );
  if (!wordIds.length) return null;
  const foundIndex =
    startWordId != null ? wordIds.indexOf(startWordId) : -1;
  const currentIndex = foundIndex >= 0 ? foundIndex : 0;
  return { mode, wordIds, currentIndex };
}

/** 抽查卡片内全部词条均已勾选熟悉程度 */
export function isEnVocabTeacherQuizSessionComplete(
  session: EnVocabTeacherQuizSession,
  hasLevel: (wordId: number) => boolean
): boolean {
  return session.wordIds.every((id) => hasLevel(id));
}

/**
 * 会话内从 fromIndex 起第一个尚未勾选熟悉程度的下标；没有则返回 -1。
 */
export function findFirstUncheckedEnVocabTeacherQuizIndex(
  session: EnVocabTeacherQuizSession,
  hasLevel: (wordId: number) => boolean,
  fromIndex = 0
): number {
  for (let i = Math.max(0, fromIndex); i < session.wordIds.length; i++) {
    if (!hasLevel(session.wordIds[i]!)) return i;
  }
  return -1;
}

/** 恢复持久化会话时，剔除已不在今日抽查范围内的词并保持索引有效 */
export function reconcileEnVocabTeacherQuizSession(
  session: EnVocabTeacherQuizSession,
  validWordIds: ReadonlySet<number>
): EnVocabTeacherQuizSession | null {
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
 * 把进行中的抽查会话补全到最新目标词表。
 * 传入 hasLevel 时：队列只保留未勾选词；池空时返回 null。
 */
export function expandEnVocabTeacherQuizSessionForTarget(
  session: EnVocabTeacherQuizSession,
  quizTargetWords: EnVocabWord[],
  dailySeqByWordId: ReadonlyMap<number, number>,
  hasLevel?: (wordId: number) => boolean
): EnVocabTeacherQuizSession | null {
  const pool = hasLevel
    ? filterEnVocabTeacherQuizUncheckedWords(quizTargetWords, hasLevel)
    : quizTargetWords;
  const targetIds = buildEnVocabTeacherQuizWordIds(
    session.mode,
    pool,
    dailySeqByWordId
  );
  if (!targetIds.length) {
    if (!hasLevel) return session;
    return pruneEnVocabTeacherQuizSessionChecked(session, hasLevel);
  }

  const currentWordId = session.wordIds[session.currentIndex];
  let wordIds: number[];

  if (hasLevel) {
    if (session.mode === "sequential") {
      wordIds = targetIds;
    } else {
      const targetSet = new Set(targetIds);
      const kept = session.wordIds.filter(
        (id) => targetSet.has(id) && !hasLevel(id)
      );
      const inSession = new Set(kept);
      wordIds = [...kept, ...targetIds.filter((id) => !inSession.has(id))];
    }
  } else {
    if (session.wordIds.length >= targetIds.length) {
      return (
        reconcileEnVocabTeacherQuizSession(session, new Set(targetIds)) ??
        session
      );
    }
    if (session.mode === "sequential") {
      wordIds = targetIds;
    } else {
      const targetSet = new Set(targetIds);
      const kept = session.wordIds.filter((id) => targetSet.has(id));
      const inSession = new Set(kept);
      wordIds = [...kept, ...targetIds.filter((id) => !inSession.has(id))];
    }
  }

  const preferredId =
    currentWordId != null && (!hasLevel || !hasLevel(currentWordId))
      ? currentWordId
      : undefined;

  return {
    mode: session.mode,
    wordIds,
    currentIndex: clampSessionIndex(wordIds, preferredId, 0),
  };
}

/** 列表点选或恢复抽查时，定位到点击的词；否则跳到第一个未勾选的词 */
export function resolveEnVocabTeacherQuizResumeIndex(
  session: EnVocabTeacherQuizSession,
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

/** 刷新/掉线恢复：定位到本会话内第一个尚未勾选熟悉程度的词 */
export function resolveEnVocabTeacherQuizRefreshResumeIndex(
  session: EnVocabTeacherQuizSession,
  _wordsById: ReadonlyMap<number, EnVocabWord>,
  _sessionReviewAt: Readonly<Record<number, number>>,
  hasLevel: (wordId: number) => boolean
): number {
  return resolveEnVocabTeacherQuizResumeIndex(session, undefined, hasLevel);
}
