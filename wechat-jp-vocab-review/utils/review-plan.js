const { sortJpVocabWordsByStat } = require("./vocab-shared");

const JP_VOCAB_REVIEW_DEFAULT_COUNT = 30;

function normalizeJpVocabReviewCount(raw, maxCount) {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n <= 0) return JP_VOCAB_REVIEW_DEFAULT_COUNT;
  return Math.min(Math.max(1, n), Math.max(1, maxCount));
}

function normalizeJpVocabReviewSortMode(raw) {
  return raw === "risk" ? "risk" : "seq";
}

function buildJpVocabDailySeqMap(ids) {
  const map = {};
  ids.forEach((id, index) => {
    map[id] = index + 1;
  });
  return map;
}

function buildJpVocabReviewWordList(words, displayOrder, options) {
  if (!words.length) return [];
  const count = normalizeJpVocabReviewCount(options.count, words.length);
  const byId = {};
  words.forEach((w) => {
    byId[w.id] = w;
  });

  if (options.sortMode === "seq") {
    const orderedIds =
      displayOrder.ids && displayOrder.ids.length
        ? displayOrder.ids.filter((id) => byId[id])
        : words.map((w) => w.id);
    return orderedIds
      .slice(0, count)
      .map((id) => byId[id])
      .filter(Boolean);
  }

  const sorted = sortJpVocabWordsByStat(words, "risk", "desc");
  return sorted.slice(0, count);
}

function buildJpVocabReviewDailySeqMap(reviewWords, displayOrder, sortMode) {
  if (sortMode === "seq") {
    return buildJpVocabDailySeqMap(displayOrder.ids || []);
  }
  const map = {};
  reviewWords.forEach((w, index) => {
    map[w.id] = index + 1;
  });
  return map;
}

module.exports = {
  JP_VOCAB_REVIEW_DEFAULT_COUNT,
  normalizeJpVocabReviewCount,
  normalizeJpVocabReviewSortMode,
  buildJpVocabReviewWordList,
  buildJpVocabReviewDailySeqMap,
  buildJpVocabDailySeqMap,
};
