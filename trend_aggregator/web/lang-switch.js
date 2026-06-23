(function () {
  var LS_LOCALE = "strategy_compare_locale";

  function resolvePaths() {
    var p = location.pathname;
    if (p.indexOf("/trend-blog/zh") === 0) {
      return { current: "zh", en: "/trend-blog/", zh: "/trend-blog/zh/" };
    }
    if (p.indexOf("/trend-blog") === 0 || p === "/trend-blog") {
      return { current: "en", en: "/trend-blog/", zh: "/trend-blog/zh/" };
    }
    if (p.indexOf("/zh/trend-blog") === 0 || p === "/zh/trend-blog") {
      return { current: "zh", en: "/trend-blog", zh: "/zh/trend-blog" };
    }
    if (p === "/zh" || p.indexOf("/zh/") === 0) {
      return { current: "zh", en: "/", zh: "/zh" };
    }
    return { current: "en", en: "/", zh: "/zh" };
  }

  function persistLocale(locale) {
    try {
      localStorage.setItem(LS_LOCALE, locale);
    } catch (e) {
      /* ignore */
    }
    try {
      document.cookie =
        LS_LOCALE +
        "=" +
        encodeURIComponent(locale) +
        ";path=/;max-age=31536000;SameSite=Lax";
    } catch (e) {
      /* ignore */
    }
  }

  function mount() {
    var el = document.getElementById("lang-switch");
    if (!el) return;

    var paths = resolvePaths();
    var isZhPage = document.documentElement.lang.indexOf("zh") === 0;
    var label = isZhPage ? "切换语言" : "Switch language";

    el.setAttribute("aria-label", label);
    el.innerHTML =
      '<button type="button" class="lang-switch-btn' +
      (paths.current === "en" ? " is-active" : "") +
      '" data-locale="en" aria-pressed="' +
      (paths.current === "en" ? "true" : "false") +
      '">English</button>' +
      '<span class="lang-switch-sep" aria-hidden="true">|</span>' +
      '<button type="button" class="lang-switch-btn' +
      (paths.current === "zh" ? " is-active" : "") +
      '" data-locale="zh" aria-pressed="' +
      (paths.current === "zh" ? "true" : "false") +
      '">中文</button>';

    el.querySelectorAll("[data-locale]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var next = btn.getAttribute("data-locale");
        if (!next || next === paths.current) return;
        persistLocale(next);
        location.href = next === "zh" ? paths.zh : paths.en;
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
