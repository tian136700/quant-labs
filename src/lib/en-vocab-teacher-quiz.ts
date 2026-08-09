import type { EnVocabWord } from "@/lib/types";

export type EnVocabTeacherQuizMode = "sequential" | "random";

/** 英语抽问会话（与日语同形：正序 / 随机） */
export type EnVocabTeacherQuizSession = {
  mode: EnVocabTeacherQuizMode;
  wordIds: number[];
  currentIndex: number;
};

/**
 * 老师端抽查固定随机（禁止正序）。
 * 正序易让学生背住当日序号顺序；与韩语抽问一致，不提供手选。
 */
export function pickRandomEnVocabTeacherQuizMode(): EnVocabTeacherQuizMode {
  return "random";
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

/** 备注 GET 后合并：GET 只回 class_notes（防 1102）；禁止 ...fetched 整词覆盖冲掉例句。 */
export function mergeEnVocabWordAfterClassNotesFetch(
  base: EnVocabWord,
  fetched: EnVocabWord
): EnVocabWord {
  return {
    ...base,
    class_notes: fetched.class_notes ?? null,
    class_notes_present:
      Boolean((fetched.class_notes || "").trim()) ||
      fetched.class_notes_present === true,
    updated_at: fetched.updated_at || base.updated_at,
  };
}

/**
 * 勾选熟悉程度 / share 响应合并进列表项：响应常省略 class_notes 正文，勿整词替换冲掉本地已拉备注。
 */
export function mergeEnVocabWordAfterReviewResponse(
  base: EnVocabWord,
  fetched: EnVocabWord
): EnVocabWord {
  return {
    ...base,
    ...fetched,
    class_notes: fetched.class_notes ?? base.class_notes ?? null,
    class_notes_present:
      fetched.class_notes != null
        ? Boolean(String(fetched.class_notes).trim())
        : (fetched.class_notes_present ??
          base.class_notes_present ??
          Boolean((base.class_notes || "").trim())),
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
    mnemonic: fetched.mnemonic ?? base.mnemonic ?? null,
    last_usage_levels:
      fetched.last_usage_levels ?? base.last_usage_levels ?? null,
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

/** 抽查队列辅助：尚未勾选熟悉程度的词（用于进度 / 跳「下一个」） */
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
 * 注意：进行中的抽查导航（上一个/下一个）不要靠这个剪队列——应保留完整本轮顺序以便回看。
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

/**
 * 开始抽查：本轮只把「开局时尚未勾选」的词入队并打乱一次（老师端固定随机）。
 * 开局后本轮内勾过的词仍留在 wordIds（禁止中途剪队列），便于「上一个」回看。
 * 不含开局前已勾选的词，避免同日第二轮「上一个」串到上一轮。
 * 全部已勾选时返回 null。
 * `_mode` 保留兼容旧调用；新会话一律 `"random"`，忽略传入的正序。
 */
export function createEnVocabTeacherQuizSession(
  _mode: EnVocabTeacherQuizMode,
  quizTargetWords: EnVocabWord[],
  dailySeqByWordId: ReadonlyMap<number, number>,
  startWordId?: number,
  hasLevel?: (wordId: number) => boolean
): EnVocabTeacherQuizSession | null {
  const mode: EnVocabTeacherQuizMode = "random";
  const pool =
    hasLevel != null
      ? filterEnVocabTeacherQuizUncheckedWords(quizTargetWords, hasLevel)
      : quizTargetWords;
  const wordIds = buildEnVocabTeacherQuizWordIds(
    mode,
    pool,
    dailySeqByWordId
  );
  if (!wordIds.length) return null;

  let currentIndex = 0;
  if (startWordId != null) {
    const foundIndex = wordIds.indexOf(startWordId);
    if (foundIndex >= 0) {
      currentIndex = foundIndex;
    }
  }
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
 * 保留已勾选词（「上一个」可回看）；仅当目标池内全部已勾选时返回 null。
 */
export function expandEnVocabTeacherQuizSessionForTarget(
  session: EnVocabTeacherQuizSession,
  quizTargetWords: EnVocabWord[],
  dailySeqByWordId: ReadonlyMap<number, number>,
  hasLevel?: (wordId: number) => boolean
): EnVocabTeacherQuizSession | null {
  // 新词追加顺序也按随机池；遗留正序会话一并收成 random
  const targetIds = buildEnVocabTeacherQuizWordIds(
    "random",
    quizTargetWords,
    dailySeqByWordId
  );
  if (!targetIds.length) {
    if (!hasLevel) {
      return session.mode === "random" ? session : { ...session, mode: "random" };
    }
    // 禁止 `prune ?? session`：全部勾选后 prune 为 null 时若回退旧会话，弹窗会永远关不掉
    const pruned = pruneEnVocabTeacherQuizSessionChecked(session, hasLevel);
    return pruned && pruned.mode !== "random"
      ? { ...pruned, mode: "random" }
      : pruned;
  }

  if (hasLevel && targetIds.every((id) => hasLevel(id))) {
    return null;
  }

  const currentWordId = session.wordIds[session.currentIndex];
  // 随机：保留本轮已定顺序（含本轮已勾选），再只追加目标池里尚未入队且仍未勾选的词
  const targetSet = new Set(targetIds);
  const kept = session.wordIds.filter((id) => targetSet.has(id));
  const inSession = new Set(kept);
  const wordIds = [
    ...kept,
    ...targetIds.filter(
      (id) => !inSession.has(id) && (!hasLevel || !hasLevel(id))
    ),
  ];
  if (!wordIds.length) return null;

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

/**
 * 刷新 / 掉线 / 中途退出再进：回到离开时正在看的词（`session.currentIndex`）。
 * 该下标越界或队列为空时，再回退到「第一个未勾选」。
 * 不要跳到第一个未勾选——老师中途关页再打开应仍是当时那一词。
 */
export function resolveEnVocabTeacherQuizRefreshResumeIndex(
  session: EnVocabTeacherQuizSession,
  _wordsById: ReadonlyMap<number, EnVocabWord>,
  _sessionReviewAt: Readonly<Record<number, number>>,
  hasLevel: (wordId: number) => boolean
): number {
  if (!session.wordIds.length) return 0;
  const saved = Math.max(
    0,
    Math.min(session.currentIndex, session.wordIds.length - 1)
  );
  if (Number.isFinite(saved) && session.wordIds[saved] != null) {
    return saved;
  }
  return resolveEnVocabTeacherQuizResumeIndex(session, undefined, hasLevel);
}
