import { isStorePlatformId } from "./platforms";
import type {
  PublicStoreReview,
  SaveStoreReviewInput,
  SaveStoreReviewResult,
  StoreReviewDish,
  StoreReviewDishInput,
  StoreReviewSortField,
  StoreReviewWithDishes,
} from "./types";
import { maskUsername } from "./username";

const SORT_COLUMNS: Record<StoreReviewSortField, string> = {
  store_name: "r.store_name",
  platform: "r.platform",
  score: "r.score",
  updated_at: "r.updated_at",
};

let devStoreEnabled = false;
const devReviews: StoreReviewWithDishes[] = [];
const devDishes: StoreReviewDish[] = [];
let devReviewIdSeq = 1;
let devDishIdSeq = 1;

export function enableStoreReviewDevStore() {
  devStoreEnabled = true;
}

function nowIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function normalizeDishInputs(
  items: StoreReviewDishInput[] | undefined
): StoreReviewDishInput[] {
  if (!items?.length) return [];
  const out: StoreReviewDishInput[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const dishName = (item.dish_name || "").trim();
    if (!dishName) continue;
    const key = dishName.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const remark = (item.remark || "").trim() || null;
    out.push({ dish_name: dishName, remark });
    if (out.length >= 30) break;
  }
  return out;
}

function attachDishes(
  review: Omit<StoreReviewWithDishes, "good_dishes" | "bad_dishes">
): StoreReviewWithDishes {
  const dishes = devDishes.filter((d) => d.review_id === review.id);
  return {
    ...review,
    good_dishes: dishes.filter((d) => d.kind === "good"),
    bad_dishes: dishes.filter((d) => d.kind === "bad"),
  };
}

function replaceDevDishes(
  reviewId: number,
  good: StoreReviewDishInput[],
  bad: StoreReviewDishInput[]
) {
  for (let i = devDishes.length - 1; i >= 0; i--) {
    if (devDishes[i].review_id === reviewId) {
      devDishes.splice(i, 1);
    }
  }
  for (const item of good) {
    devDishes.push({
      id: devDishIdSeq++,
      review_id: reviewId,
      kind: "good",
      dish_name: item.dish_name,
      remark: item.remark ?? null,
    });
  }
  for (const item of bad) {
    devDishes.push({
      id: devDishIdSeq++,
      review_id: reviewId,
      kind: "bad",
      dish_name: item.dish_name,
      remark: item.remark ?? null,
    });
  }
}

export async function saveStoreReview(
  db: D1Database,
  input: SaveStoreReviewInput
): Promise<SaveStoreReviewResult> {
  const storeName = (input.store_name || "").trim();
  if (!storeName) {
    return { ok: false, error: "store_name_required" };
  }

  if (!isStorePlatformId(input.platform)) {
    return { ok: false, error: "platform_invalid" };
  }

  const platformOther =
    input.platform === "other" ? (input.platform_other || "").trim() || null : null;
  if (input.platform === "other" && !platformOther) {
    return { ok: false, error: "platform_other_required" };
  }

  const score = Number(input.score);
  if (!Number.isInteger(score) || score < 1 || score > 10) {
    return { ok: false, error: "score_invalid" };
  }

  const remark = (input.remark || "").trim() || null;
  const goodDishes = normalizeDishInputs(input.good_dishes);
  const badDishes = normalizeDishInputs(input.bad_dishes);
  const isPublic = input.is_public ? 1 : 0;
  const id = input.id && input.id > 0 ? input.id : 0;
  const ts = nowIso();

  if (devStoreEnabled) {
    if (id > 0) {
      const idx = devReviews.findIndex(
        (r) => r.id === id && r.user_id === input.user_id
      );
      if (idx < 0) return { ok: false, error: "not_found" };
      const updated = {
        ...devReviews[idx],
        platform: input.platform,
        platform_other: platformOther,
        store_name: storeName,
        score,
        remark,
        is_public: isPublic,
        updated_at: ts,
      };
      replaceDevDishes(id, goodDishes, badDishes);
      devReviews[idx] = attachDishes(updated);
      return { ok: true, record: devReviews[idx] };
    }

    const created = {
      id: devReviewIdSeq++,
      user_id: input.user_id,
      platform: input.platform,
      platform_other: platformOther,
      store_name: storeName,
      score,
      remark,
      is_public: isPublic,
      created_at: ts,
      updated_at: ts,
    };
    replaceDevDishes(created.id, goodDishes, badDishes);
    const record = attachDishes(created);
    devReviews.unshift(record);
    return { ok: true, record };
  }

  if (id > 0) {
    const owner = await db
      .prepare(`SELECT id FROM store_review WHERE id = ?1 AND user_id = ?2 LIMIT 1`)
      .bind(id, input.user_id)
      .first<{ id: number }>();
    if (!owner?.id) return { ok: false, error: "not_found" };

    const result = await db
      .prepare(
        `UPDATE store_review
         SET platform = ?1, platform_other = ?2, store_name = ?3, score = ?4,
             remark = ?5, is_public = ?6, updated_at = ?7
         WHERE id = ?8 AND user_id = ?9`
      )
      .bind(
        input.platform,
        platformOther,
        storeName,
        score,
        remark,
        isPublic,
        ts,
        id,
        input.user_id
      )
      .run();

    if (!result.meta?.changes) {
      return { ok: false, error: "not_found" };
    }
  } else {
    await db
      .prepare(
        `INSERT INTO store_review
         (user_id, platform, platform_other, store_name, score, remark, is_public, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`
      )
      .bind(
        input.user_id,
        input.platform,
        platformOther,
        storeName,
        score,
        remark,
        isPublic,
        ts,
        ts
      )
      .run();
  }

  const savedId =
    id > 0
      ? id
      : (
          await db
            .prepare(`SELECT last_insert_rowid() AS id`)
            .first<{ id: number }>()
        )?.id;

  if (!savedId) {
    return { ok: false, error: "save_failed" };
  }

  await db
    .prepare(`DELETE FROM store_review_dish WHERE review_id = ?1`)
    .bind(savedId)
    .run();

  for (const item of goodDishes) {
    await db
      .prepare(
        `INSERT INTO store_review_dish (review_id, kind, dish_name, remark)
         VALUES (?1, 'good', ?2, ?3)`
      )
      .bind(savedId, item.dish_name, item.remark)
      .run();
  }
  for (const item of badDishes) {
    await db
      .prepare(
        `INSERT INTO store_review_dish (review_id, kind, dish_name, remark)
         VALUES (?1, 'bad', ?2, ?3)`
      )
      .bind(savedId, item.dish_name, item.remark)
      .run();
  }

  const record = await getStoreReviewById(db, savedId, input.user_id);
  if (!record) {
    return { ok: false, error: "save_failed" };
  }
  return { ok: true, record };
}

async function loadDishesForReviews(
  db: D1Database,
  reviewIds: number[]
): Promise<Map<number, { good: StoreReviewDish[]; bad: StoreReviewDish[] }>> {
  const map = new Map<number, { good: StoreReviewDish[]; bad: StoreReviewDish[] }>();
  if (!reviewIds.length) return map;

  if (devStoreEnabled) {
    for (const id of reviewIds) {
      const dishes = devDishes.filter((d) => d.review_id === id);
      map.set(id, {
        good: dishes.filter((d) => d.kind === "good"),
        bad: dishes.filter((d) => d.kind === "bad"),
      });
    }
    return map;
  }

  const placeholders = reviewIds.map((_, i) => `?${i + 1}`).join(", ");
  const { results } = await db
    .prepare(
      `SELECT id, review_id, kind, dish_name, remark
       FROM store_review_dish
       WHERE review_id IN (${placeholders})
       ORDER BY id ASC`
    )
    .bind(...reviewIds)
    .all<StoreReviewDish>();

  for (const row of results ?? []) {
    const bucket = map.get(row.review_id) ?? { good: [], bad: [] };
    if (row.kind === "good") bucket.good.push(row);
    else bucket.bad.push(row);
    map.set(row.review_id, bucket);
  }
  return map;
}

function withDishes(
  row: Omit<StoreReviewWithDishes, "good_dishes" | "bad_dishes">,
  dishMap: Map<number, { good: StoreReviewDish[]; bad: StoreReviewDish[] }>
): StoreReviewWithDishes {
  const dishes = dishMap.get(row.id) ?? { good: [], bad: [] };
  return {
    ...row,
    good_dishes: dishes.good,
    bad_dishes: dishes.bad,
  };
}

export async function getStoreReviewById(
  db: D1Database,
  reviewId: number,
  userId?: number
): Promise<StoreReviewWithDishes | null> {
  if (devStoreEnabled) {
    const row = devReviews.find((r) =>
      userId != null ? r.id === reviewId && r.user_id === userId : r.id === reviewId
    );
    return row ?? null;
  }

  const row = userId
    ? await db
        .prepare(
          `SELECT id, user_id, platform, platform_other, store_name, score, remark,
                  is_public, created_at, updated_at
           FROM store_review WHERE id = ?1 AND user_id = ?2 LIMIT 1`
        )
        .bind(reviewId, userId)
        .first<Omit<StoreReviewWithDishes, "good_dishes" | "bad_dishes">>()
    : await db
        .prepare(
          `SELECT id, user_id, platform, platform_other, store_name, score, remark,
                  is_public, created_at, updated_at
           FROM store_review WHERE id = ?1 LIMIT 1`
        )
        .bind(reviewId)
        .first<Omit<StoreReviewWithDishes, "good_dishes" | "bad_dishes">>();

  if (!row) return null;
  const dishMap = await loadDishesForReviews(db, [row.id]);
  return withDishes(row, dishMap);
}

export async function listStoreReviewHistory(
  db: D1Database,
  userId: number,
  sortField: StoreReviewSortField = "updated_at",
  sortOrder: "asc" | "desc" = "desc",
  limit = 500
): Promise<StoreReviewWithDishes[]> {
  const col = SORT_COLUMNS[sortField] ?? SORT_COLUMNS.updated_at;
  const order = sortOrder === "asc" ? "ASC" : "DESC";
  const safeLimit = Math.min(Math.max(1, limit), 2000);

  if (devStoreEnabled) {
    const sorted = devReviews
      .filter((r) => r.user_id === userId)
      .sort((a, b) => {
        const key = sortField as keyof StoreReviewWithDishes;
        const av = a[key];
        const bv = b[key];
        if (av === bv) return sortOrder === "asc" ? a.id - b.id : b.id - a.id;
        if (av == null) return 1;
        if (bv == null) return -1;
        return sortOrder === "asc" ? (av < bv ? -1 : 1) : av > bv ? -1 : 1;
      });
    return sorted.slice(0, safeLimit);
  }

  const { results } = await db
    .prepare(
      `SELECT r.id, r.user_id, r.platform, r.platform_other, r.store_name, r.score, r.remark,
              r.is_public, r.created_at, r.updated_at
       FROM store_review r
       WHERE r.user_id = ?1
       ORDER BY ${col} ${order}, r.id ${order}
       LIMIT ?2`
    )
    .bind(userId, safeLimit)
    .all<Omit<StoreReviewWithDishes, "good_dishes" | "bad_dishes">>();

  const rows = results ?? [];
  const dishMap = await loadDishesForReviews(
    db,
    rows.map((r) => r.id)
  );
  return rows.map((row) => withDishes(row, dishMap));
}

export async function listPublicStoreReviews(
  db: D1Database,
  options: {
    platform?: string | null;
    storeQuery?: string | null;
    sortField?: StoreReviewSortField;
    sortOrder?: "asc" | "desc";
    limit?: number;
  } = {}
): Promise<PublicStoreReview[]> {
  const sortField = options.sortField ?? "updated_at";
  const sortOrder = options.sortOrder === "asc" ? "ASC" : "DESC";
  const col = SORT_COLUMNS[sortField] ?? SORT_COLUMNS.updated_at;
  const safeLimit = Math.min(Math.max(1, options.limit ?? 200), 500);
  const platform = (options.platform || "").trim();
  const storeQuery = (options.storeQuery || "").trim().toLowerCase();

  if (devStoreEnabled) {
    let rows = devReviews.filter((r) => r.is_public === 1);
    if (platform && isStorePlatformId(platform)) {
      rows = rows.filter((r) => r.platform === platform);
    }
    if (storeQuery) {
      rows = rows.filter((r) => r.store_name.toLowerCase().includes(storeQuery));
    }
    return rows.slice(0, safeLimit).map((row) => ({
      ...row,
      masked_username: maskUsername(`user${row.user_id}abcdef`),
    }));
  }

  const binds: (string | number)[] = [];
  const where: string[] = ["r.is_public = 1"];

  if (platform && isStorePlatformId(platform)) {
    binds.push(platform);
    where.push(`r.platform = ?${binds.length}`);
  }
  if (storeQuery) {
    binds.push(`%${storeQuery}%`);
    where.push(`LOWER(r.store_name) LIKE ?${binds.length}`);
  }

  binds.push(safeLimit);
  const sql = `
    SELECT r.id, r.user_id, r.platform, r.platform_other, r.store_name, r.score, r.remark,
           r.is_public, r.created_at, r.updated_at, u.username
    FROM store_review r
    JOIN etr_users u ON u.id = r.user_id
    WHERE ${where.join(" AND ")}
    ORDER BY ${col} ${sortOrder}, r.id ${sortOrder}
    LIMIT ?${binds.length}`;

  const { results } = await db
    .prepare(sql)
    .bind(...binds)
    .all<
      Omit<StoreReviewWithDishes, "good_dishes" | "bad_dishes"> & {
        username: string;
      }
    >();

  const rows = results ?? [];
  const dishMap = await loadDishesForReviews(
    db,
    rows.map((r) => r.id)
  );

  return rows.map((row) => {
    const { username, ...rest } = row;
    return {
      ...withDishes(rest, dishMap),
      masked_username: maskUsername(username),
    };
  });
}

export async function deleteStoreReviewRecords(
  db: D1Database,
  userId: number,
  recordIds: number[]
): Promise<{ deleted: number }> {
  const ids = recordIds.filter((id) => Number.isInteger(id) && id > 0);
  if (!ids.length) return { deleted: 0 };

  if (devStoreEnabled) {
    const idSet = new Set(ids);
    let deleted = 0;
    for (let i = devReviews.length - 1; i >= 0; i--) {
      const row = devReviews[i];
      if (idSet.has(row.id) && row.user_id === userId) {
        devReviews.splice(i, 1);
        deleted++;
      }
    }
    for (let i = devDishes.length - 1; i >= 0; i--) {
      if (idSet.has(devDishes[i].review_id)) {
        devDishes.splice(i, 1);
      }
    }
    return { deleted };
  }

  const placeholders = ids.map((_, i) => `?${i + 2}`).join(", ");
  const result = await db
    .prepare(
      `DELETE FROM store_review WHERE user_id = ?1 AND id IN (${placeholders})`
    )
    .bind(userId, ...ids)
    .run();

  const deleted = Number(result.meta?.changes ?? 0);
  return { deleted: Number.isFinite(deleted) ? deleted : 0 };
}
