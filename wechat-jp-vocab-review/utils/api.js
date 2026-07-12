const { BASE_URL } = require("../config");

function request(path, options = {}) {
  const method = options.method || "GET";
  const data = options.data;
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${BASE_URL}${path}`,
      method,
      data,
      header: {
        "Content-Type": "application/json",
        ...(options.header || {}),
      },
      enableCookie: true,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
        } else {
          const err = (res.data && res.data.error) || `HTTP ${res.statusCode}`;
          reject(new Error(err));
        }
      },
      fail(err) {
        reject(new Error(err.errMsg || "网络请求失败"));
      },
    });
  });
}

function getAuth() {
  return request("/api/english-teacher-review/auth");
}

function login(username, password) {
  return request("/api/english-teacher-review/auth", {
    method: "POST",
    data: { action: "login", username, password },
  });
}

function logout() {
  return request("/api/english-teacher-review/auth", {
    method: "POST",
    data: { action: "logout" },
  });
}

function getVocab() {
  return request("/api/jp-vocab");
}

function getReviewProgress() {
  return request("/api/jp-vocab/review");
}

function reviewNext(wordId) {
  return request("/api/jp-vocab/review", {
    method: "POST",
    data: { action: "review_next", word_id: wordId },
  });
}

function clearReviewProgress() {
  return request("/api/jp-vocab/review", {
    method: "POST",
    data: { action: "clear" },
  });
}

function getClassNotes(wordId) {
  return request(`/api/jp-vocab/class-notes?word_id=${encodeURIComponent(String(wordId))}`);
}

module.exports = {
  getAuth,
  login,
  logout,
  getVocab,
  getReviewProgress,
  reviewNext,
  clearReviewProgress,
  getClassNotes,
};
