const api = require("../../utils/api");
const { normalizeJpVocabReviewProgress } = require("../../utils/review-session");
const {
  jpVocabRiskIndex,
  formatJpVocabTotalReviewsDisplay,
  effectiveTodayCheckCount,
  beijingDateString,
} = require("../../utils/vocab-shared");

const app = getApp();
const LEVELS = [
  { key: "very", label: "非常熟悉" },
  { key: "normal", label: "一般" },
  { key: "weak", label: "不熟悉" },
];

function isReviewToday(lastAt) {
  if (!lastAt) return false;
  return lastAt.slice(0, 10) === beijingDateString();
}

function displayLevel(word) {
  if (
    effectiveTodayCheckCount(word.today_check_count, word.today_check_date) <= 0
  ) {
    return "";
  }
  if (!isReviewToday(word.last_review_at)) return "";
  const level = word.last_review_level;
  if (level === "very" || level === "normal" || level === "weak") return level;
  return "";
}

Page({
  data: {
    recording: false,
    word: null,
    kindLabel: "",
    dailySeq: null,
    reviewed: false,
    progressLabel: "",
    sessionReviewed: 0,
    sessionTotal: 0,
    sessionPct: 0,
    cumulativeCount: 0,
    canGoPrev: false,
    isLast: false,
    levels: LEVELS,
    selectedLevel: "",
    risk: "0.0",
    riskTier: "mid",
    todayChecks: 0,
    totalLabel: "",
    notesText: "",
    hasNotes: false,
    showNotesPreview: false,
  },

  onLoad() {
    this.session = app.globalData.reviewSession;
    if (!this.session || !this.session.wordIds.length) {
      wx.showToast({ title: "无复习会话", icon: "none" });
      setTimeout(() => wx.navigateBack(), 500);
      return;
    }
    this.reviewedSet = new Set(app.globalData.reviewProgress.reviewed_word_ids);
    this.renderCurrent();
  },

  onUnload() {
    app.globalData.reviewSession = this.session;
  },

  getCurrentWord() {
    const id = this.session.wordIds[this.session.currentIndex];
    return app.globalData.wordsById[id] || null;
  },

  renderCurrent() {
    const word = this.getCurrentWord();
    if (!word) {
      wx.navigateBack();
      return;
    }
    const sortMode = app.globalData.sortMode;
    const seqMap =
      sortMode === "seq"
        ? app.globalData.fullDailySeqMap
        : app.globalData.dailySeqMap;
    const sessionTotal = this.session.wordIds.length;
    let sessionReviewed = 0;
    this.session.wordIds.forEach((id) => {
      if (this.reviewedSet.has(id)) sessionReviewed += 1;
    });
    const risk = jpVocabRiskIndex(word);
    const riskTier = risk >= 2 ? "high" : risk <= 0 ? "low" : "mid";
    const totalDisplay = formatJpVocabTotalReviewsDisplay(word);
    const notes = (word.class_notes || "").trim();
    const hasNotes = Boolean(notes || word.class_notes_present);
    const showNotesPreview = notes.length > 0 && notes.length <= 200;

    this.setData({
      word: {
        id: word.id,
        word: word.word,
        reading: (word.reading || "").trim(),
        meaning: (word.meaning || "").trim(),
        pos: (word.pos || "").trim(),
        mnemonic: (word.mnemonic || "").trim(),
        kind: word.kind,
        cntVery: word.cnt_very || 0,
        cntNormal: word.cnt_normal || 0,
        cntWeak: word.cnt_weak || 0,
      },
      kindLabel: word.kind === "grammar" ? "语法" : "单词",
      dailySeq: seqMap[word.id] || null,
      reviewed: this.reviewedSet.has(word.id),
      progressLabel: `${this.session.currentIndex + 1} / ${sessionTotal}`,
      sessionReviewed,
      sessionTotal,
      sessionPct:
        sessionTotal > 0
          ? Math.min(100, Math.round((sessionReviewed / sessionTotal) * 100))
          : 0,
      cumulativeCount: app.globalData.reviewProgress.count,
      canGoPrev: this.session.currentIndex > 0,
      isLast: this.session.currentIndex >= sessionTotal - 1,
      selectedLevel: displayLevel(word),
      risk: risk.toFixed(1),
      riskTier,
      todayChecks: effectiveTodayCheckCount(
        word.today_check_count,
        word.today_check_date
      ),
      totalLabel: totalDisplay.label,
      notesText: notes,
      hasNotes,
      showNotesPreview,
    });

    if (word.class_notes_present && !word.class_notes) {
      api.getClassNotes(word.id).then((data) => {
        if (!data.ok || !data.word || data.word.id !== word.id) return;
        app.globalData.wordsById[word.id] = data.word;
        const text = (data.word.class_notes || "").trim();
        this.setData({
          notesText: text,
          hasNotes: Boolean(text || data.word.class_notes_present),
          showNotesPreview: text.length > 0 && text.length <= 200,
        });
      }).catch(() => {});
    }
  },

  onClose() {
    wx.navigateBack();
  },

  onPrev() {
    if (this.data.recording || !this.data.canGoPrev) return;
    this.session.currentIndex -= 1;
    this.renderCurrent();
  },

  onNext() {
    if (this.data.recording) return;
    const word = this.getCurrentWord();
    if (!word) return;
    this.setData({ recording: true });
    api
      .reviewNext(word.id)
      .then((data) => {
        if (!data.ok || !data.review_progress) {
          throw new Error(data.error || "记录失败");
        }
        const progress = normalizeJpVocabReviewProgress(data.review_progress);
        app.globalData.reviewProgress = progress;
        this.reviewedSet = new Set(progress.reviewed_word_ids);
        if (this.data.isLast) {
          wx.showToast({ title: "本轮复习完成", icon: "success" });
          setTimeout(() => wx.navigateBack(), 400);
          return;
        }
        this.session.currentIndex += 1;
        this.renderCurrent();
      })
      .catch((err) => {
        wx.showToast({ title: err.message || "记录失败", icon: "none" });
      })
      .finally(() => {
        this.setData({ recording: false });
      });
  },

  onViewNotes() {
    if (!this.data.notesText) {
      wx.showToast({ title: "暂无备注", icon: "none" });
      return;
    }
    wx.showModal({
      title: "备注",
      content: this.data.notesText,
      showCancel: false,
    });
  },
});
