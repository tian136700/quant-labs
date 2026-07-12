const api = require("../../utils/api");
const app = getApp();

Page({
  data: {
    username: "",
    password: "",
    loading: false,
    error: "",
  },

  onLoad() {
    app.checkAuth().then((user) => {
      if (user && app.isAdmin(user)) {
        wx.reLaunch({ url: "/pages/index/index" });
      }
    });
  },

  onUsernameInput(e) {
    this.setData({ username: e.detail.value, error: "" });
  },

  onPasswordInput(e) {
    this.setData({ password: e.detail.value, error: "" });
  },

  onLogin() {
    const { username, password, loading } = this.data;
    if (loading) return;
    if (!username.trim() || !password) {
      this.setData({ error: "请输入用户名和密码" });
      return;
    }
    this.setData({ loading: true, error: "" });
    api
      .login(username.trim(), password)
      .then((data) => {
        if (!data.ok || !data.user) {
          throw new Error(data.error || "登录失败");
        }
        if (data.user.role !== "admin") {
          throw new Error("仅管理员可使用日语复习");
        }
        app.globalData.user = data.user;
        wx.reLaunch({ url: "/pages/index/index" });
      })
      .catch((err) => {
        this.setData({ error: err.message || "登录失败" });
      })
      .finally(() => {
        this.setData({ loading: false });
      });
  },
});
