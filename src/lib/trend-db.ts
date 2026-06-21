import type { TrendFetchRunRecord, TrendItemRecord } from "./types";

let devStoreEnabled = false;

type DevRun = TrendFetchRunRecord & {
  raw_payload: string;
  batch_full_prompt: string | null;
};

type DevItem = TrendItemRecord & {
  item_json: string;
};

const devRuns: DevRun[] = [];
const devItems: DevItem[] = [];
let devRunIdSeq = 1;
let devItemIdSeq = 1;

export function enableTrendDevStore() {
  devStoreEnabled = true;
}

function nowIso(): string {
  return new Date().toISOString();
}

export type TrendIngestSelectedItem = {
  source?: string;
  id?: string;
  title?: string;
  description?: string;
  url?: string;
  stars?: number;
  language?: string;
  subreddit?: string;
  topics?: string[];
  published?: string;
  _heat_score?: number;
  _selection_rank?: number;
  full_prompt?: string;
  [key: string]: unknown;
};

export type TrendIngestPayload = {
  fetched_at: string;
  github_count: number;
  reddit_count: number;
  combined_count: number;
  raw: Record<string, unknown>;
  processed: Record<string, unknown>;
  selected: TrendIngestSelectedItem[];
  batch_full_prompt?: string;
};

function normalizeExternalId(item: TrendIngestSelectedItem): string {
  const id = String(item.id || item.url || item.title || "").trim();
  return id.slice(0, 512) || "unknown";
}

function itemFromGithubOrReddit(
  item: Record<string, unknown>,
  runId: number,
  selected: boolean,
  selectionRank: number | null,
  heatScore: number,
  fullPrompt: string | null
): Omit<DevItem, "id"> {
  const source = String(item.source || "unknown");
  const topics = item.topics;
  return {
    run_id: runId,
    source,
    external_id: normalizeExternalId(item as TrendIngestSelectedItem),
    title: String(item.title || item.id || "untitled").slice(0, 512),
    description: item.description ? String(item.description).slice(0, 4000) : null,
    url: item.url ? String(item.url).slice(0, 1024) : null,
    stars: typeof item.stars === "number" ? item.stars : null,
    language: item.language ? String(item.language) : null,
    subreddit: item.subreddit ? String(item.subreddit) : null,
    topics_json: Array.isArray(topics) ? JSON.stringify(topics) : null,
    published_at: item.published ? String(item.published) : null,
    heat_score: heatScore,
    selected: selected ? 1 : 0,
    selection_rank: selectionRank,
    item_json: JSON.stringify(item),
    system_prompt: null,
    user_prompt: null,
    full_prompt: fullPrompt,
    created_at: nowIso(),
  };
}

function allProcessedItems(processed: Record<string, unknown>): Record<string, unknown>[] {
  const github = Array.isArray(processed.github)
    ? (processed.github as Record<string, unknown>[])
    : [];
  const reddit = Array.isArray(processed.reddit)
    ? (processed.reddit as Record<string, unknown>[])
    : [];
  return [...github, ...reddit];
}

export async function ingestTrendFetch(
  db: D1Database,
  payload: TrendIngestPayload
): Promise<{ run_id: number; item_count: number; selected_count: number }> {
  const fetchedAt = payload.fetched_at || nowIso();
  const rawPayload = JSON.stringify({
    raw: payload.raw,
    processed: payload.processed,
  });
  const selectedList = payload.selected || [];
  const selectedKeys = new Set(
    selectedList.map((s) => `${s.source || ""}:${normalizeExternalId(s)}`)
  );
  const selectedMeta = new Map<
    string,
    { rank: number; heat: number; full: string | null }
  >();
  for (const s of selectedList) {
    const key = `${s.source || ""}:${normalizeExternalId(s)}`;
    selectedMeta.set(key, {
      rank: Number(s._selection_rank) || 0,
      heat: Number(s._heat_score) || 0,
      full: s.full_prompt ?? null,
    });
  }

  const batchFull = payload.batch_full_prompt ?? null;

  if (devStoreEnabled) {
    const runId = devRunIdSeq++;
    devRuns.unshift({
      id: runId,
      fetched_at: fetchedAt,
      github_count: payload.github_count,
      reddit_count: payload.reddit_count,
      combined_count: payload.combined_count,
      selected_count: selectedList.length,
      created_at: nowIso(),
      raw_payload: rawPayload,
      batch_full_prompt: batchFull,
    });

    let itemCount = 0;
    for (const item of allProcessedItems(payload.processed)) {
      const key = `${String(item.source || "")}:${normalizeExternalId(item as TrendIngestSelectedItem)}`;
      const isSelected = selectedKeys.has(key);
      const meta = selectedMeta.get(key);
      devItems.push({
        id: devItemIdSeq++,
        ...itemFromGithubOrReddit(
          item,
          runId,
          isSelected,
          isSelected ? meta?.rank ?? null : null,
          meta?.heat ?? 0,
          isSelected ? meta?.full ?? null : null
        ),
      });
      itemCount += 1;
    }

    return {
      run_id: runId,
      item_count: itemCount,
      selected_count: selectedList.length,
    };
  }

  const runResult = await db
    .prepare(
      `INSERT INTO trend_fetch_run (
         fetched_at, github_count, reddit_count, combined_count, selected_count,
         raw_payload, batch_system_prompt, batch_user_prompt, batch_full_prompt, created_at
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, NULL, ?7, ?8)`
    )
    .bind(
      fetchedAt,
      payload.github_count,
      payload.reddit_count,
      payload.combined_count,
      selectedList.length,
      rawPayload,
      batchFull,
      nowIso()
    )
    .run();

  const runId = Number(runResult.meta?.last_row_id ?? 0);
  if (!runId) throw new Error("trend_ingest_run_failed");

  const statements: D1PreparedStatement[] = [];
  let itemCount = 0;

  for (const item of allProcessedItems(payload.processed)) {
    const key = `${String(item.source || "")}:${normalizeExternalId(item as TrendIngestSelectedItem)}`;
    const isSelected = selectedKeys.has(key);
    const meta = selectedMeta.get(key);
    const row = itemFromGithubOrReddit(
      item,
      runId,
      isSelected,
      isSelected ? meta?.rank ?? null : null,
      meta?.heat ?? 0,
      isSelected ? meta?.full ?? null : null
    );

    statements.push(
      db
        .prepare(
          `INSERT INTO trend_item (
             run_id, source, external_id, title, description, url, stars, language,
             subreddit, topics_json, published_at, heat_score, selected, selection_rank,
             item_json, system_prompt, user_prompt, full_prompt, created_at
           ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)`
        )
        .bind(
          row.run_id,
          row.source,
          row.external_id,
          row.title,
          row.description,
          row.url,
          row.stars,
          row.language,
          row.subreddit,
          row.topics_json,
          row.published_at,
          row.heat_score,
          row.selected,
          row.selection_rank,
          row.item_json,
          row.system_prompt,
          row.user_prompt,
          row.full_prompt,
          row.created_at
        )
    );
    itemCount += 1;
  }

  if (statements.length) {
    await db.batch(statements);
  }

  return {
    run_id: runId,
    item_count: itemCount,
    selected_count: selectedList.length,
  };
}

export async function listTrendFetchRuns(
  db: D1Database,
  page = 1,
  pageSize = 20
): Promise<{
  records: TrendFetchRunRecord[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}> {
  const safePage = Math.max(1, page);
  const safeSize = Math.min(100, Math.max(1, pageSize));
  const offset = (safePage - 1) * safeSize;

  if (devStoreEnabled) {
    const total = devRuns.length;
    const records = devRuns.slice(offset, offset + safeSize).map((r) => ({
      id: r.id,
      fetched_at: r.fetched_at,
      github_count: r.github_count,
      reddit_count: r.reddit_count,
      combined_count: r.combined_count,
      selected_count: r.selected_count,
      created_at: r.created_at,
    }));
    return {
      records,
      page: safePage,
      pageSize: safeSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / safeSize)),
    };
  }

  const totalRow = await db
    .prepare(`SELECT COUNT(*) AS cnt FROM trend_fetch_run`)
    .first<{ cnt: number }>();
  const total = Number(totalRow?.cnt ?? 0);

  const { results } = await db
    .prepare(
      `SELECT id, fetched_at, github_count, reddit_count, combined_count,
              selected_count, created_at
       FROM trend_fetch_run
       ORDER BY fetched_at DESC
       LIMIT ?1 OFFSET ?2`
    )
    .bind(safeSize, offset)
    .all<TrendFetchRunRecord>();

  return {
    records: results ?? [],
    page: safePage,
    pageSize: safeSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / safeSize)),
  };
}

export type TrendRunDetail = TrendFetchRunRecord & {
  batch_full_prompt: string | null;
  /** @deprecated 旧数据兼容 */
  batch_system_prompt?: string | null;
  batch_user_prompt?: string | null;
  items: TrendItemRecord[];
};

function resolveRunFullPrompt(run: {
  batch_full_prompt?: string | null;
  batch_user_prompt?: string | null;
  batch_system_prompt?: string | null;
}): string | null {
  if (run.batch_full_prompt?.trim()) return run.batch_full_prompt;
  if (run.batch_user_prompt?.trim()) return run.batch_user_prompt;
  const sys = run.batch_system_prompt?.trim();
  const user = run.batch_user_prompt?.trim();
  if (sys && user) return `${user}\n\n---\n\n${sys}`;
  return sys || user || null;
}

export async function getTrendFetchRun(
  db: D1Database,
  runId: number
): Promise<TrendRunDetail | null> {
  if (devStoreEnabled) {
    const run = devRuns.find((r) => r.id === runId);
    if (!run) return null;
    const items = devItems
      .filter((i) => i.run_id === runId)
      .sort((a, b) => {
        if (a.selected !== b.selected) return b.selected - a.selected;
        if (a.selection_rank != null && b.selection_rank != null) {
          return a.selection_rank - b.selection_rank;
        }
        return b.heat_score - a.heat_score;
      })
      .map(({ item_json: _, ...rest }) => rest);
    return {
      id: run.id,
      fetched_at: run.fetched_at,
      github_count: run.github_count,
      reddit_count: run.reddit_count,
      combined_count: run.combined_count,
      selected_count: run.selected_count,
      created_at: run.created_at,
      batch_full_prompt: resolveRunFullPrompt(run),
      items,
    };
  }

  const run = await db
    .prepare(
      `SELECT id, fetched_at, github_count, reddit_count, combined_count,
              selected_count, created_at, batch_full_prompt,
              batch_system_prompt, batch_user_prompt
       FROM trend_fetch_run WHERE id = ?1 LIMIT 1`
    )
    .bind(runId)
    .first<TrendRunDetail>();

  if (!run) return null;

  const { results } = await db
    .prepare(
      `SELECT id, run_id, source, external_id, title, description, url, stars,
              language, subreddit, topics_json, published_at, heat_score,
              selected, selection_rank, system_prompt, user_prompt, full_prompt, created_at
       FROM trend_item
       WHERE run_id = ?1
       ORDER BY selected DESC, selection_rank ASC, heat_score DESC`
    )
    .bind(runId)
    .all<TrendItemRecord>();

  return {
    ...run,
    batch_full_prompt: resolveRunFullPrompt(run),
    items: results ?? [],
  };
}

export async function getTrendItem(
  db: D1Database,
  itemId: number
): Promise<(TrendItemRecord & { item_json: string }) | null> {
  if (devStoreEnabled) {
    const item = devItems.find((i) => i.id === itemId);
    return item ?? null;
  }

  return (
    (await db
      .prepare(
        `SELECT id, run_id, source, external_id, title, description, url, stars,
                language, subreddit, topics_json, published_at, heat_score,
                selected, selection_rank, item_json, system_prompt, user_prompt,
                full_prompt, created_at
         FROM trend_item WHERE id = ?1 LIMIT 1`
      )
      .bind(itemId)
      .first<TrendItemRecord & { item_json: string }>()) ?? null
  );
}

export function resolveItemFullPrompt(item: TrendItemRecord): string | null {
  if (item.full_prompt?.trim()) return item.full_prompt;
  if (item.user_prompt?.trim() && item.system_prompt?.trim()) {
    return `${item.user_prompt}\n\n---\n\n${item.system_prompt}`;
  }
  return item.user_prompt || item.system_prompt || null;
}
