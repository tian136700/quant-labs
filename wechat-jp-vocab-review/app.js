const api = require("./utils/api");

App({
  globalData: {
    user: null,
    reviewSession: null,
    wordsById: {},
    refs: {},
    displayOrder: { date: "", ids: [], round_checked_ids: [] },
    reviewProgress: { count: 0, reviewed_word_ids: [] },
    sortMode: "seq",
    dailySeqMap: {},
    fullDailySeqMap: {},
  },

  onLaunch() {
    this.checkAuth();
  },

  checkAuth() {
    return api
      .getAuth()
      .then((data) => {
        if (data.authenticated && data.user) {
          this.globalData.user = data.user;
          return data.user;
        }
        this.globalData.user = null;
        return null;
      })
      .catch(() => {
        this.globalData.user = null;
        return null;
      });
  },

  isAdmin(user) {
    return user && user.role === "admin";
  },
});
