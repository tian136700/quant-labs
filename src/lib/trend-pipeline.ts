import {
  attachPromptsToItems,
  buildFullPrompt,
  type TrendRecord,
} from "@/lib/trend-prompt-instructions";
import {
  DEDUP_TITLE_SIMILARITY_THRESHOLD,
  GITHUB_AI_KEYWORDS,
  GITHUB_API_BASE,
  GITHUB_MAX_OR_OPERATORS_PER_QUERY,
  GITHUB_MIN_STARS,
  GITHUB_PUSHED_WITHIN_DAYS,
  GITHUB_SEARCH_PER_PAGE,
  GITHUB_SEARCH_REPOS_PATH,
  GITHUB_SLOTS,
  GITHUB_USER_AGENT,
  REDDIT_MAX_ENTRIES_PER_FEED,
  REDDIT_RSS_FEEDS,
  REDDIT_SLOTS,
  REDDIT_USER_AGENT,
  REQUEST_RETRY_BACKOFF_MS,
  REQUEST_RETRY_COUNT,
  REQUEST_TIMEOUT_MS,
  SUBREDDIT_PRIORITY,
  TOTAL_SELECTED,
  githubToken,
} from "@/lib/trend-config";
import type { TrendIngestPayload } from "@/lib/trend-db";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function httpGetJson(
  url: string,
  options: {
    headers?: Record<string, string>;
    params?: Record<string, string | number>;
  } = {}
): Promise<Record<string, unknown> | null> {
  const mergedHeaders: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": GITHUB_USER_AGENT,
    ...options.headers,
  };

  let requestUrl = url;
  if (options.params) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(options.params)) {
      qs.set(k, String(v));
    }
    requestUrl = `${url}?${qs.toString()}`;
  }

  let lastError: unknown = null;
  for (let attempt = 0; attempt <= REQUEST_RETRY_COUNT; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      const response = await fetch(requestUrl, {
        headers: mergedHeaders,
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (response.status === 403 || response.status === 422) {
        return null;
      }
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = (await response.json()) as unknown;
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        return null;
      }
      return payload as Record<string, unknown>;
    } catch (err) {
      lastError = err;
      if (attempt < REQUEST_RETRY_COUNT) {
        await sleep(REQUEST_RETRY_BACKOFF_MS * (attempt + 1));
      }
    }
  }

  if (lastError) {
    console.warn("httpGetJson failed:", lastError);
  }
  return null;
}

function chunkKeywords(keywords: string[], chunkSize: number): string[][] {
  const cleaned = keywords.map((k) => k.trim()).filter(Boolean);
  if (!cleaned.length) return [["AI"]];
  const batches: string[][] = [];
  for (let i = 0; i < cleaned.length; i += chunkSize) {
    batches.push(cleaned.slice(i, i + chunkSize));
  }
  return batches;
}

function buildGithubSearchQuery(
  keywords: string[],
  pushedWithinDays = GITHUB_PUSHED_WITHIN_DAYS,
  minStars = GITHUB_MIN_STARS
): string {
  const quoted = keywords
    .map((kw) => kw.trim())
    .filter(Boolean)
    .map((token) => (token.includes(" ") ? `"${token}"` : token));

  const keywordClause = quoted.length ? quoted.join(" OR ") : "AI";
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - pushedWithinDays);
  const sinceStr = since.toISOString().slice(0, 10);
  return `(${keywordClause}) pushed:>${sinceStr} stars:>=${minStars}`;
}

async function searchGithubRepos(
  query: string,
  token: string | undefined,
  perPage: number
): Promise<TrendRecord[]> {
  const url = `${GITHUB_API_BASE}${GITHUB_SEARCH_REPOS_PATH}`;
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const payload = await httpGetJson(url, {
    headers,
    params: {
      q: query,
      sort: "stars",
      order: "desc",
      per_page: Math.min(Math.max(perPage, 1), 100),
    },
  });
  if (!payload) return [];

  const items = payload.items;
  if (!Array.isArray(items)) return [];
  return items
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    .map(repoToRecord)
    .filter((x): x is TrendRecord => x !== null);
}

function repoToRecord(repo: Record<string, unknown>): TrendRecord | null {
  const fullName = String(repo.full_name || repo.name || "").trim();
  if (!fullName) return null;
  const topics = repo.topics;
  return {
    source: "github",
    id: fullName,
    title: String(repo.name || fullName),
    description: String(repo.description || "").trim(),
    url: String(repo.html_url || ""),
    stars: Number(repo.stargazers_count) || 0,
    language: String(repo.language || ""),
    pushed_at: String(repo.pushed_at || ""),
    topics: Array.isArray(topics) ? topics : [],
  };
}

export async function fetchGithubTrending(
  keywords: string[] = GITHUB_AI_KEYWORDS,
  token: string | undefined = githubToken(),
  perPage = GITHUB_SEARCH_PER_PAGE
): Promise<TrendRecord[]> {
  const batches = chunkKeywords(keywords, GITHUB_MAX_OR_OPERATORS_PER_QUERY);
  const merged = new Map<string, TrendRecord>();

  try {
    for (let i = 0; i < batches.length; i++) {
      const query = buildGithubSearchQuery(batches[i]);
      const repos = await searchGithubRepos(query, token, perPage);
      for (const record of repos) {
        const id = String(record.id || "");
        if (id) merged.set(id, record);
      }
      if (batches.length > 1 && i < batches.length - 1) {
        await sleep(1000);
      }
    }
  } catch (err) {
    console.warn("fetchGithubTrending:", err);
    return [];
  }

  let results = [...merged.values()].sort(
    (a, b) => Number(b.stars) - Number(a.stars)
  );
  if (perPage > 0) results = results.slice(0, perPage);
  return results;
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

function extractXmlTag(block: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = block.match(re);
  if (!m) return "";
  return decodeXmlEntities(m[1].replace(/<[^>]+>/g, " ").trim());
}

function extractAtomLink(block: string): string {
  const m =
    block.match(/<link[^>]+href=["']([^"']+)["'][^>]*\/?>/i) ||
    block.match(/<link[^>]*>([^<]+)<\/link>/i);
  return m ? decodeXmlEntities(m[1].trim()) : "";
}

function parseRssEntries(xml: string): string[] {
  const blocks: string[] = [];
  const entryRe = /<entry[\s>][\s\S]*?<\/entry>/gi;
  const itemRe = /<item[\s>][\s\S]*?<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = entryRe.exec(xml))) blocks.push(m[0]);
  if (!blocks.length) {
    while ((m = itemRe.exec(xml))) blocks.push(m[0]);
  }
  return blocks;
}

function parseRedditEntry(block: string, subreddit: string): TrendRecord | null {
  try {
    const title = extractXmlTag(block, "title");
    const link = extractAtomLink(block) || extractXmlTag(block, "link");
    if (!title || !link) return null;

    let summary =
      extractXmlTag(block, "summary") ||
      extractXmlTag(block, "content") ||
      "";
    if (summary.length > 500) summary = `${summary.slice(0, 500)}…`;

    const entryId = extractXmlTag(block, "id") || link;
    const author =
      extractXmlTag(block, "name") ||
      extractXmlTag(block, "author") ||
      "";
    const published =
      extractXmlTag(block, "published") ||
      extractXmlTag(block, "updated") ||
      extractXmlTag(block, "pubDate") ||
      "";

    return {
      source: "reddit",
      id: entryId,
      subreddit,
      title,
      description: summary,
      url: link,
      author,
      published,
    };
  } catch {
    return null;
  }
}

export async function fetchRedditPrompts(
  feeds: ReadonlyArray<readonly [string, string]> = REDDIT_RSS_FEEDS,
  maxEntriesPerFeed = REDDIT_MAX_ENTRIES_PER_FEED
): Promise<TrendRecord[]> {
  const allPosts: TrendRecord[] = [];

  for (const [subreddit, rssUrl] of feeds) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      const response = await fetch(rssUrl, {
        headers: { "User-Agent": REDDIT_USER_AGENT },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!response.ok) continue;

      const xml = await response.text();
      const blocks = parseRssEntries(xml);
      let count = 0;
      for (const block of blocks) {
        if (count >= maxEntriesPerFeed) break;
        const record = parseRedditEntry(block, subreddit);
        if (record) {
          allPosts.push(record);
          count += 1;
        }
      }
    } catch (err) {
      console.warn(`Reddit RSS r/${subreddit}:`, err);
    }
  }

  return allPosts;
}

export async function fetchAllSources(): Promise<{
  github: TrendRecord[];
  reddit: TrendRecord[];
}> {
  const [github, reddit] = await Promise.all([
    fetchGithubTrending().catch(() => [] as TrendRecord[]),
    fetchRedditPrompts().catch(() => [] as TrendRecord[]),
  ]);
  return { github, reddit };
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function lcsLength(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp = new Array(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    let prev = 0;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] =
        a[i - 1] === b[j - 1] ? prev + 1 : Math.max(dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
}

function titleSimilarity(a: string, b: string): number {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const lcs = lcsLength(na, nb);
  return (2 * lcs) / (na.length + nb.length);
}

function deduplicateItems(
  items: TrendRecord[],
  similarityThreshold = DEDUP_TITLE_SIMILARITY_THRESHOLD
): TrendRecord[] {
  const seenIds = new Set<string>();
  const seenUrls = new Set<string>();
  const kept: TrendRecord[] = [];

  for (const item of items) {
    const itemId = String(item.id || "").trim();
    const url = String(item.url || "").trim().replace(/\/$/, "");
    const title = String(item.title || "");

    if (itemId && seenIds.has(itemId)) continue;
    if (url && seenUrls.has(url)) continue;

    let duplicate = false;
    for (const existing of kept) {
      if (
        titleSimilarity(title, String(existing.title || "")) >=
        similarityThreshold
      ) {
        duplicate = true;
        break;
      }
    }
    if (duplicate) continue;

    if (itemId) seenIds.add(itemId);
    if (url) seenUrls.add(url);
    kept.push(item);
  }

  return kept;
}

function cleanItem(item: TrendRecord): TrendRecord {
  const cleaned: TrendRecord = {};
  for (const [key, value] of Object.entries(item)) {
    let v: unknown = value;
    if (typeof v === "string") {
      let text = v.trim();
      if (key === "description" && text.length > 800) {
        text = `${text.slice(0, 800)}…`;
      }
      v = text;
    }
    if (v === "" || v === null || v === undefined) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (
      typeof v === "object" &&
      v !== null &&
      !Array.isArray(v) &&
      Object.keys(v).length === 0
    ) {
      continue;
    }
    cleaned[key] = v;
  }
  return cleaned;
}

export function cleanAndDeduplicate(raw: {
  github?: TrendRecord[];
  reddit?: TrendRecord[];
}): {
  github: TrendRecord[];
  reddit: TrendRecord[];
  combined: TrendRecord[];
  stats: { github: number; reddit: number; combined: number };
} {
  const githubCleaned = (raw.github || []).map(cleanItem);
  const redditCleaned = (raw.reddit || []).map(cleanItem);
  const combined = deduplicateItems([...githubCleaned, ...redditCleaned]);

  return {
    github: githubCleaned,
    reddit: redditCleaned,
    combined,
    stats: {
      github: githubCleaned.length,
      reddit: redditCleaned.length,
      combined: combined.length,
    },
  };
}

function githubHeat(item: TrendRecord): number {
  const stars = Number(item.stars);
  return Number.isFinite(stars) ? stars : 0;
}

function redditHeat(item: TrendRecord, feedIndex: number): number {
  const sub = String(item.subreddit || "");
  const subPri = SUBREDDIT_PRIORITY[sub] ?? 0;
  return subPri * 1_000_000 - feedIndex;
}

export function selectTopItems(
  processed: { github?: TrendRecord[]; reddit?: TrendRecord[] },
  total = TOTAL_SELECTED,
  githubSlots = GITHUB_SLOTS,
  redditSlots = REDDIT_SLOTS
): TrendRecord[] {
  const github = [...(processed.github || [])];
  const reddit = [...(processed.reddit || [])];

  const githubSorted = [...github].sort(
    (a, b) => githubHeat(b) - githubHeat(a)
  );
  const githubPicked = githubSorted.slice(0, githubSlots);

  const redditScored = reddit.map((item, idx) => ({
    heat: redditHeat(item, idx),
    idx,
    item,
  }));
  redditScored.sort((a, b) => b.heat - a.heat || a.idx - b.idx);
  const redditPicked = redditScored.slice(0, redditSlots).map((t) => t.item);

  let selected: TrendRecord[] = [...githubPicked, ...redditPicked];

  if (selected.length < total && githubSorted.length > githubPicked.length) {
    const need = total - selected.length;
    selected = selected.concat(
      githubSorted.slice(githubPicked.length, githubPicked.length + need)
    );
  }

  selected = selected.slice(0, total);

  return selected.map((item, rank) => {
    const source = String(item.source || "");
    let heat: number;
    if (source === "github") {
      heat = githubHeat(item);
    } else if (source === "reddit") {
      const feedIdx = reddit.findIndex((r) => r.id === item.id);
      heat = redditHeat(item, feedIdx >= 0 ? feedIdx : rank);
    } else {
      heat = rank;
    }
    return {
      ...item,
      _heat_score: heat,
      _selection_rank: rank + 1,
    };
  });
}

export function buildIngestPayload(
  raw: { github: TrendRecord[]; reddit: TrendRecord[] },
  processed: ReturnType<typeof cleanAndDeduplicate>,
  fetchedAt?: string
): TrendIngestPayload {
  const ts = fetchedAt || new Date().toISOString();
  const selected = selectTopItems(processed);
  const fullPrompt = buildFullPrompt(selected, ts);
  const selectedWithPrompts = attachPromptsToItems(selected, ts);
  const stats = processed.stats;

  return {
    fetched_at: ts,
    github_count: stats.github,
    reddit_count: stats.reddit,
    combined_count: stats.combined,
    raw,
    processed,
    selected: selectedWithPrompts,
    batch_full_prompt: fullPrompt,
  };
}

export async function runTrendFetchPipeline(): Promise<TrendIngestPayload> {
  const raw = await fetchAllSources();
  const processed = cleanAndDeduplicate(raw);
  return buildIngestPayload(raw, processed);
}
