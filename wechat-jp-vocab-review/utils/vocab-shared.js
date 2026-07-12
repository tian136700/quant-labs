function beijingDateString() {
  try {
    return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
  } catch {
    const offset = 8 * 60;
    const local = new Date(Date.now() + (offset + new Date().getTimezoneOffset()) * 60000);
    const y = local.getFullYear();
    const m = String(local.getMonth() + 1).padStart(2, "0");
    const d = String(local.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
}

function jpVocabTotalReviews(word) {
  return (word.cnt_very || 0) + (word.cnt_normal || 0) + (word.cnt_weak || 0);
}

function formatJpVocabTotalReviewsDisplay(word) {
  const total = jpVocabTotalReviews(word);
  if (total === 0) {
    return { label: "从未抽查", isZero: true };
  }
  return { label: String(total), isZero: false };
}

/** 抽查优先级 = 一般×1 + 不熟悉×2 − 非常熟悉×0.3 */
function jpVocabRiskIndex(word) {
  const raw =
    (word.cnt_normal || 0) * 1 +
    (word.cnt_weak || 0) * 2 -
    (word.cnt_very || 0) * 0.3;
  return Math.round(raw * 10) / 10;
}

function sortJpVocabWordsByStat(words, key, dir) {
  const mul = dir === "asc" ? 1 : -1;
  function statValue(word) {
    switch (key) {
      case "risk":
        return jpVocabRiskIndex(word);
      default:
        return 0;
    }
  }
  return words.slice().sort((a, b) => {
    const diff = statValue(a) - statValue(b);
    if (diff !== 0) return diff * mul;
    return (a.word || "").localeCompare(b.word || "", "ja");
  });
}

function effectiveTodayCheckCount(count, dateStr) {
  if (!dateStr) return 0;
  if (dateStr !== beijingDateString()) return 0;
  return Number(count) || 0;
}

module.exports = {
  beijingDateString,
  jpVocabTotalReviews,
  formatJpVocabTotalReviewsDisplay,
  jpVocabRiskIndex,
  sortJpVocabWordsByStat,
  effectiveTodayCheckCount,
};
