import { TREND_SYSTEM_PROMPT_RAW } from "@/lib/trend-prompt-raw";

const REPLACEMENTS: ReadonlyArray<readonly [string, string]> = [
  [
    "输入：raw_trends.json 中的 GitHub 趋势数据（JSON 或 parse_github_json 文本）",
    "输入：见本文最上方 INPUT DATA 中的 JSON（已嵌入，勿再读取外部文件）",
  ],
  [
    "用途：作为 DeepSeek / OpenAI 兼容 API 的 system message",
    "用途：复制整段到 DeepSeek / OpenAI API 即可",
  ],
  ["注入 web/index.html 的 #content-area", "输出 Markdown 博客正文"],
  ["see `output/raw_trends.json`", "见本文最上方 INPUT DATA"],
  ["`output/raw_trends.json`", "本文 INPUT DATA"],
  [
    "from our aggregator pipeline",
    "in the INPUT DATA section at the top of this message",
  ],
  [
    "The input JSON follows this schema (见本文最上方 INPUT DATA):",
    "The real input JSON is at the top of this message (INPUT DATA). " +
      "The schema example below is for reference only — use INPUT DATA as source of truth:",
  ],
  [
    "The user will send parsed GitHub trend data (JSON or pre-formatted text). " +
      "Treat it as the single source of truth and produce the blog post immediately.",
    "The INPUT DATA JSON is already included at the top of this message. " +
      "Use it as the single source of truth and produce the blog post immediately.",
  ],
];

function sanitizeInstructions(text: string): string {
  let cleaned = text;
  for (const [old, replacement] of REPLACEMENTS) {
    cleaned = cleaned.split(old).join(replacement);
  }
  return cleaned.trim();
}

export function getSanitizedInstructions(): string {
  return sanitizeInstructions(TREND_SYSTEM_PROMPT_RAW);
}

const INTERNAL_KEYS = new Set([
  "_heat_score",
  "_selection_rank",
  "system_prompt",
  "user_prompt",
  "full_prompt",
]);

export type TrendRecord = Record<string, unknown>;

export function cleanItemForPrompt(item: TrendRecord): TrendRecord {
  const out: TrendRecord = {};
  for (const [key, value] of Object.entries(item)) {
    if (INTERNAL_KEYS.has(key) || key.startsWith("_")) continue;
    out[key] = value;
  }
  return out;
}

export function buildTrendJsonPayload(
  items: TrendRecord[],
  fetchedAt?: string
): TrendRecord {
  const github: TrendRecord[] = [];
  const reddit: TrendRecord[] = [];

  for (const item of items) {
    const cleaned = cleanItemForPrompt(item);
    const source = String(cleaned.source || "github");
    if (source === "reddit") reddit.push(cleaned);
    else github.push(cleaned);
  }

  const processed: TrendRecord = {};
  if (github.length) processed.github = github;
  if (reddit.length) processed.reddit = reddit;

  const payload: TrendRecord = { processed };
  if (fetchedAt) payload.fetched_at = fetchedAt;
  return payload;
}

export function buildInputDataJson(items: TrendRecord[], fetchedAt?: string): string {
  return JSON.stringify(buildTrendJsonPayload(items, fetchedAt), null, 2);
}

export function buildFullPrompt(items: TrendRecord[], fetchedAt?: string): string {
  const dataJson = buildInputDataJson(items, fetchedAt);
  const instructions = getSanitizedInstructions();
  return (
    "=== INPUT DATA (GitHub / Reddit trends — use as single source of truth) ===\n\n" +
    `${dataJson}\n\n` +
    "=== INSTRUCTIONS ===\n\n" +
    instructions
  );
}

export function attachPromptsToItems(
  items: TrendRecord[],
  fetchedAt?: string
): TrendRecord[] {
  return items.map((item) => ({
    ...item,
    full_prompt: buildFullPrompt([item], fetchedAt),
  }));
}
