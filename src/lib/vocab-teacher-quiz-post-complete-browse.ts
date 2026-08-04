/**
 * 今日抽查全部勾完后：保留本轮词序，便于「查看上一个单词」回看卡片。
 */

export type VocabTeacherQuizBrowseSession = {
  mode: "random";
  wordIds: number[];
  currentIndex: number;
};

export function buildVocabTeacherQuizPostCompleteBrowseSession(
  wordIds: number[],
  preferredWordId?: number | null
): VocabTeacherQuizBrowseSession | null {
  const ids = wordIds.filter((id) => Number.isFinite(id) && id > 0);
  if (!ids.length) return null;
  let currentIndex = ids.length - 1;
  if (preferredWordId != null) {
    const found = ids.indexOf(preferredWordId);
    if (found >= 0) currentIndex = found;
  }
  return { mode: "random", wordIds: ids, currentIndex };
}

export function clampVocabTeacherQuizBrowseIndex(
  session: VocabTeacherQuizBrowseSession,
  index: number
): VocabTeacherQuizBrowseSession {
  if (!session.wordIds.length) return session;
  const currentIndex = Math.max(
    0,
    Math.min(Math.floor(index), session.wordIds.length - 1)
  );
  if (currentIndex === session.currentIndex) return session;
  return { ...session, currentIndex };
}
