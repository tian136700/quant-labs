(function () {
  function pageLocale() {
    var lang = (document.documentElement.lang || "en").toLowerCase();
    return lang.indexOf("zh") === 0 ? "zh" : "en";
  }

  function setMeta(name, content) {
    if (!content) return;
    var el = document.querySelector('meta[name="' + name + '"]');
    if (el) el.setAttribute("content", content);
  }

  function setMetaProperty(property, content) {
    if (!content) return;
    var el = document.querySelector('meta[property="' + property + '"]');
    if (el) el.setAttribute("content", content);
  }

  function formatDate(isoDate, locale) {
    if (!isoDate) return "";
    try {
      var d = new Date(isoDate + "T00:00:00");
      if (locale === "zh") {
        return (
          d.getFullYear() +
          " 年 " +
          (d.getMonth() + 1) +
          " 月 " +
          d.getDate() +
          " 日"
        );
      }
      return d.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch (e) {
      return isoDate;
    }
  }

  function renderTags(container, tags) {
    if (!container || !tags || !tags.length) return;
    container.innerHTML = "";
    tags.forEach(function (tag) {
      var span = document.createElement("span");
      span.className = "tag";
      span.textContent = tag;
      container.appendChild(span);
    });
  }

  function applyPost(post) {
    if (!post) return;

    if (post.title) document.title = post.title;
    setMeta("description", post.meta_description || "");
    setMetaProperty("og:title", post.title || "");
    setMetaProperty("og:description", post.meta_description || post.headline || "");

    var headline = document.querySelector("h1[itemprop='headline']");
    if (headline && post.headline) headline.textContent = post.headline;

    var content = document.getElementById("content-area");
    if (content && post.content_html) content.innerHTML = post.content_html;

    var timeEl = document.querySelector("article time[itemprop], article time");
    if (timeEl && post.published_at) {
      timeEl.setAttribute("datetime", post.published_at);
      timeEl.textContent = formatDate(post.published_at, post.locale);
    }

    var authorEl = document.querySelector("span[itemprop='author']");
    if (authorEl && post.author) authorEl.textContent = post.author;

    var readEl = document.getElementById("article-read-minutes");
    if (readEl && post.read_minutes) {
      readEl.textContent =
        post.locale === "zh"
          ? "约 " + post.read_minutes + " 分钟阅读"
          : post.read_minutes + " min read";
    }

    var tagsEl = document.getElementById("article-tags");
    renderTags(tagsEl, post.tags);

    var publishedMeta = document.querySelector("meta[itemprop='datePublished']");
    if (publishedMeta && post.published_at) {
      publishedMeta.setAttribute("content", post.published_at);
    }
  }

  var locale = pageLocale();
  fetch("/api/trend-blog/latest?locale=" + encodeURIComponent(locale))
    .then(function (res) {
      return res.json();
    })
    .then(function (data) {
      if (data && data.ok && data.post) applyPost(data.post);
    })
    .catch(function () {
      /* 保留页面内置占位内容 */
    });
})();
