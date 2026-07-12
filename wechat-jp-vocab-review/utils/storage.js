const PREFS_KEY = "jp_vocab_review_prefs";

function readReviewPrefs() {
  try {
    const raw = wx.getStorageSync(PREFS_KEY);
    if (!raw) return { count: 30, sortMode: "seq" };
    return {
      count: Number(raw.count) > 0 ? Number(raw.count) : 30,
      sortMode: raw.sortMode === "risk" ? "risk" : "seq",
    };
  } catch {
    return { count: 30, sortMode: "seq" };
  }
}

function writeReviewPrefs(prefs) {
  try {
    wx.setStorageSync(PREFS_KEY, prefs);
  } catch {
    /* ignore */
  }
}

module.exports = {
  readReviewPrefs,
  writeReviewPrefs,
};
