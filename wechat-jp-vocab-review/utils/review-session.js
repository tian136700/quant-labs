function normalizeJpVocabReviewProgress(raw) {
  const reviewed_word_ids = Array.isArray(raw && raw.reviewed_word_ids)
    ? [...new Set(raw.reviewed_word_ids.map((id) => Number(id)).filter((id) => id > 0))]
    : [];
  return {
    count: reviewed_word_ids.length,
    reviewed_word_ids,
  };
}

function createJpVocabReviewSession(orderedWordIds, startWordId) {
  if (!orderedWordIds.length) return null;
  const foundIndex = orderedWordIds.indexOf(startWordId);
  return {
    wordIds: orderedWordIds,
    currentIndex: foundIndex >= 0 ? foundIndex : 0,
  };
}

function resolveJpVocabReviewResumeIndex(orderedWordIds, reviewedSet) {
  if (!orderedWordIds.length) {
    return { index: 0, allReviewed: false };
  }
  const firstUnreviewed = orderedWordIds.findIndex((id) => !reviewedSet.has(id));
  if (firstUnreviewed >= 0) {
    return { index: firstUnreviewed, allReviewed: false };
  }
  return { index: 0, allReviewed: true };
}

module.exports = {
  normalizeJpVocabReviewProgress,
  createJpVocabReviewSession,
  resolveJpVocabReviewResumeIndex,
};
