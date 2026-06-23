(function () {
  var seo = (typeof TREND_BLOG_SEO !== "undefined" && TREND_BLOG_SEO) || {
    siteUrl: "https://blog.info-quests.com",
    title: "AI Trend Digest 2026 — ChatGPT, Gemini & GitHub Trends Daily",
    description:
      "Daily 2026 AI trends and news: ChatGPT, Gemini, GPT updates, GitHub trending repos, prompt engineering tips, and open-source tools.",
    keywords:
      "AI trends 2026, ChatGPT, Gemini, GPT, GitHub trending, prompt engineering",
    headline: "AI Trend Digest 2026: ChatGPT, Gemini & GitHub Trends",
    deck:
      "Daily coverage of ChatGPT, Gemini, GPT, and GitHub trending AI repos — your 2026 developer briefing.",
  };

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

  function setJsonLd(id, data) {
    var el = document.getElementById(id);
    if (!el || !data) return;
    el.textContent = JSON.stringify(data);
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

    var title = post.title || seo.title;
    var description = post.meta_description || seo.description;
    var headline = post.headline || seo.headline;
    var pageUrl = seo.siteUrl.replace(/\/$/, "") + "/";

    document.title = title;
    setMeta("description", description);
    setMetaProperty("og:title", title);
    setMetaProperty("og:description", description);
    setMetaProperty("og:url", pageUrl);
    setMeta("twitter:title", title);
    setMeta("twitter:description", description);

    var headlineEl = document.querySelector("h1[itemprop='headline']");
    if (headlineEl && headline) headlineEl.textContent = headline;

    var deckEl = document.getElementById("article-deck");
    if (deckEl && post.meta_description) deckEl.textContent = post.meta_description;

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

    var keywords = (post.tags || []).concat(seo.keywords.split(", ")).slice(0, 24).join(", ");
    setJsonLd("jsonld-article", {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: headline,
      description: description,
      author: { "@type": "Person", name: post.author || "Alex Chen" },
      publisher: { "@type": "Organization", name: "AI Trend Digest" },
      datePublished: post.published_at || undefined,
      dateModified: post.updated_at || post.published_at || undefined,
      mainEntityOfPage: { "@type": "WebPage", "@id": pageUrl },
      keywords: keywords,
    });
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
      /* 保留页面内置占位内容与默认 SEO */
    });
})();
