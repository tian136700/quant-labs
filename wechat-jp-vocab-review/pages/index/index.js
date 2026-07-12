const api = require("../../utils/api");
const { readReviewPrefs, writeReviewPrefs } = require("../../utils/storage");
const {
  buildJpVocabReviewWordList,
  buildJpVocabReviewDailySeqMap,
  buildJpVocabDailySeqMap,
  normalizeJpVocabReviewCount,
} = require("../../utils/review-plan");
const {
  normalizeJpVocabReviewProgress,
  createJpVocabReviewSession,
  resolveJpVocabReviewResumeIndex,
} = require("../../utils/review-session");
const {
  jpVocabRiskIndex,
  formatJpVocabTotalReviewsDisplay,
} = require("../../utils/vocab-shared");

const app = getApp();

Page({
  data: {
    loading: true,
    refreshing: false,
    clearBusy: false,
    clearPercent: 0,
    status: "",
    countInput: "30",
    sortMode: "seq",
    totalWords: 0,
    reviewWords: [],
    sessionReviewed: 0,
    reviewTotal: 0,
    cumulativeReviewed: 0,
    username: "",
  },

  onShow() {
    app.checkAuth().then((user) => {
      if (!user || !app.isAdmin(user)) {
        wx.reLaunch({ url: "/pages/login/login" });
        return;
      }
      this.setData({ username: user.username || "" });
      this.loadData();
    });
  },

  onPullDownRefresh() {
    this.loadData(true).finally(() => wx.stopPullDownRefresh());
  },

  loadData(isRefresh) {
    if (isRefresh) {
      this.setData({ refreshing: true });
    } else {
      this.setData({ loading: true });
    }
    const prefs = readReviewPrefs();
    return Promise.all([api.getVocab(), api.getReviewProgress()])
      .then(([vocab, reviewRes]) => {
        if (!vocab.ok || !Array.isArray(vocab.words)) {
          throw new Error(vocab.error || "加载词表失败");
        }
        if (!reviewRes.ok) {
          throw new Error(reviewRes.error || "加载复习进度失败");
        }
        const words = vocab.words;
        const displayOrder = vocab.display_order || { date: "", ids: [], round_checked_ids: [] };
        const reviewProgress = normalizeJpVocabReviewProgress(reviewRes.review_progress);
        const reviewedSet = new Set(reviewProgress.reviewed_word_ids);
        const count = normalizeJpVocabReviewCount(prefs.count, words.length);
        const reviewWords = buildJpVocabReviewWordList(words, displayOrder, {
          count,
          sortMode: prefs.sortMode,
        });
        const wordsById = {};
        words.forEach((w) => {
          wordsById[w.id] = w;
        });
        app.globalData.wordsById = wordsById;
        app.globalData.refs = vocab.refs || {};
        app.globalData.displayOrder = displayOrder;
        app.globalData.reviewProgress = reviewProgress;
        app.globalData.sortMode = prefs.sortMode;
        app.globalData.dailySeqMap = buildJpVocabReviewDailySeqMap(
          reviewWords,
          displayOrder,
          prefs.sortMode
        );
        app.globalData.fullDailySeqMap = buildJpVocabDailySeqMap(displayOrder.ids || []);

        const list = reviewWords.map((w) => {
          const totalDisplay = formatJpVocabTotalReviewsDisplay(w);
          const seq =
            prefs.sortMode === "seq"
              ? app.globalData.fullDailySeqMap[w.id]
              : app.globalData.dailySeqMap[w.id];
          return {
            id: w.id,
            word: w.word,
            reading: w.reading || "",
            meaning: w.meaning || "—",
            risk: jpVocabRiskIndex(w).toFixed(1),
            totalLabel: totalDisplay.label,
            seq: seq || "—",
            reviewed: reviewedSet.has(w.id),
          };
        });

        const sessionReviewed = reviewWords.filter((w) => reviewedSet.has(w.id)).length;
        this.setData({
          loading: false,
          refreshing: false,
          status: "",
          countInput: String(count),
          sortMode: prefs.sortMode,
          totalWords: words.length,
          reviewWords: list,
          sessionReviewed,
          reviewTotal: reviewWords.length,
          cumulativeReviewed: reviewProgress.count,
        });
      })
      .catch((err) => {
        this.setData({
          loading: false,
          refreshing: false,
          status: err.message || "加载失败",
        });
      });
  },

  onCountInput(e) {
    this.setData({ countInput: e.detail.value });
  },

  onCountBlur() {
    const count = normalizeJpVocabReviewCount(
      this.data.countInput,
      this.data.totalWords || 9999
    );
    writeReviewPrefs({ count, sortMode: this.data.sortMode });
    this.loadData(true);
  },

  onSortChange(e) {
    const sortMode = e.detail.value;
    const count = normalizeJpVocabReviewCount(
      this.data.countInput,
      this.data.totalWords || 9999
    );
    writeReviewPrefs({ count, sortMode });
    this.setData({ sortMode });
    this.loadData(true);
  },

  startReview(e) {
    const startWordId = e.currentTarget.dataset.wordId
      ? Number(e.currentTarget.dataset.wordId)
      : undefined;
    const reviewWordIds = this.data.reviewWords.map((w) => w.id);
    if (!reviewWordIds.length) {
      wx.showToast({ title: "没有可复习的词条", icon: "none" });
      return;
    }
    const reviewedSet = new Set(app.globalData.reviewProgress.reviewed_word_ids);
    const targetId =
      startWordId ||
      reviewWordIds[resolveJpVocabReviewResumeIndex(reviewWordIds, reviewedSet).index] ||
      reviewWordIds[0];
    const session = createJpVocabReviewSession(reviewWordIds, targetId);
    if (!session) {
      wx.showToast({ title: "无法开始复习", icon: "none" });
      return;
    }
    app.globalData.reviewSession = session;
    wx.navigateTo({ url: "/pages/flashcard/flashcard" });
  },

  onClearReview() {
    if (this.data.clearBusy || this.data.cumulativeReviewed === 0) return;
    wx.showModal({
      title: "清除已复习",
      content: "确定清除全部已复习记录？此操作不可撤销。",
      confirmColor: "#e85d6f",
      success: (res) => {
        if (!res.confirm) return;
        this.setData({ clearBusy: true, clearPercent: 12 });
        const timer = setInterval(() => {
          const p = Math.min(95, this.data.clearPercent + 8);
          this.setData({ clearPercent: p });
        }, 120);
        api
          .clearReviewProgress()
          .then((data) => {
            if (!data.ok) throw new Error(data.error || "清除失败");
            clearInterval(timer);
            this.setData({ clearPercent: 100 });
            setTimeout(() => {
              this.setData({ clearBusy: false, clearPercent: 0 });
              this.loadData(true);
              wx.showToast({ title: "已清除", icon: "success" });
            }, 200);
          })
          .catch((err) => {
            clearInterval(timer);
            this.setData({ clearBusy: false, clearPercent: 0 });
            wx.showToast({ title: err.message || "清除失败", icon: "none" });
          });
      },
    });
  },

  onLogout() {
    wx.showModal({
      title: "退出登录",
      content: "确定退出当前账号？",
      success: (res) => {
        if (!res.confirm) return;
        api.logout().finally(() => {
          app.globalData.user = null;
          wx.reLaunch({ url: "/pages/login/login" });
        });
      },
    });
  },
});
