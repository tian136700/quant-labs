export const GITHUB_API_BASE = "https://api.github.com";
export const GITHUB_SEARCH_REPOS_PATH = "/search/repositories";

export const GITHUB_AI_KEYWORDS = [
  "AI",
  "LLM",
  "GPT",
  "prompt",
  "ChatGPT",
  "Claude",
  "openai",
  "langchain",
  "RAG",
  "agent",
  "copilot",
];

export const GITHUB_PUSHED_WITHIN_DAYS = 1;
export const GITHUB_MIN_STARS = 10;
export const GITHUB_MAX_OR_OPERATORS_PER_QUERY = 5;
export const GITHUB_SEARCH_PER_PAGE = 30;

export const REDDIT_RSS_FEEDS: ReadonlyArray<readonly [string, string]> = [
  ["ChatGPT", "https://www.reddit.com/r/ChatGPT/top/.rss?t=day"],
  ["PromptEngineering", "https://www.reddit.com/r/PromptEngineering/top/.rss?t=day"],
  ["LocalLLaMA", "https://www.reddit.com/r/LocalLLaMA/top/.rss?t=day"],
  ["OpenAI", "https://www.reddit.com/r/OpenAI/top/.rss?t=day"],
];

export const REDDIT_USER_AGENT =
  process.env.REDDIT_USER_AGENT ??
  "trend-aggregator/1.0 (RSS client; contact: admin@info-quests.com)";

export const GITHUB_USER_AGENT =
  process.env.GITHUB_USER_AGENT ??
  "trend-aggregator/1.0 (GitHub Search API client)";

export const REDDIT_MAX_ENTRIES_PER_FEED = 15;
export const REQUEST_TIMEOUT_MS = 30_000;
export const REQUEST_RETRY_COUNT = 2;
export const REQUEST_RETRY_BACKOFF_MS = 2_000;
export const DEDUP_TITLE_SIMILARITY_THRESHOLD = 0.85;

export const GITHUB_SLOTS = 7;
export const REDDIT_SLOTS = 3;
export const TOTAL_SELECTED = 10;

export const SUBREDDIT_PRIORITY: Record<string, number> = {
  PromptEngineering: 4,
  LocalLLaMA: 3,
  OpenAI: 2,
  ChatGPT: 1,
};

export function githubToken(): string | undefined {
  return (
    process.env.GITHUB_TOKEN?.trim() ||
    process.env.GH_TOKEN?.trim() ||
    undefined
  );
}
