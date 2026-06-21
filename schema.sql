-- =============================================================================
-- Cloudflare D1 表结构（按需抓取 + 缓存美股日线）
-- 本地初始化：npm run db:migrate:local
-- 远程初始化：npm run db:migrate:remote
-- =============================================================================

CREATE TABLE IF NOT EXISTS daily_bars (
  symbol     TEXT    NOT NULL,
  bar_date   TEXT    NOT NULL,
  open       REAL,
  high       REAL,
  low        REAL,
  close      REAL    NOT NULL,
  volume     REAL,
  updated_at TEXT    NOT NULL,
  PRIMARY KEY (symbol, bar_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_bars_symbol ON daily_bars (symbol);
CREATE INDEX IF NOT EXISTS idx_daily_bars_symbol_date ON daily_bars (symbol, bar_date);

-- 可选：记录最近一次抓取元数据，便于排查
CREATE TABLE IF NOT EXISTS fetch_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol     TEXT    NOT NULL,
  start_date TEXT    NOT NULL,
  end_date   TEXT    NOT NULL,
  row_count  INTEGER NOT NULL,
  source     TEXT    NOT NULL DEFAULT 'yahoo',
  created_at TEXT    NOT NULL
);

-- 按 IP 记住语言偏好（中文/英文）
CREATE TABLE IF NOT EXISTS locale_prefs (
  ip         TEXT    NOT NULL PRIMARY KEY,
  locale     TEXT    NOT NULL,
  updated_at TEXT    NOT NULL
);

-- 英语老师评价：记录每次上课评分，便于选课前参考
CREATE TABLE IF NOT EXISTS english_teacher_review (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_name TEXT    NOT NULL,
  class_date   TEXT    NOT NULL,
  score        INTEGER NOT NULL,
  remark       TEXT,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_etr_teacher_name ON english_teacher_review (teacher_name);
CREATE INDEX IF NOT EXISTS idx_etr_class_date ON english_teacher_review (class_date);
CREATE INDEX IF NOT EXISTS idx_etr_updated_at ON english_teacher_review (updated_at);

-- 英语老师评价：用户与登录会话
CREATE TABLE IF NOT EXISTS etr_users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT    NOT NULL,
  role          TEXT    NOT NULL DEFAULT 'user',
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS etr_sessions (
  token      TEXT    NOT NULL PRIMARY KEY,
  user_id    INTEGER NOT NULL,
  expires_at TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES etr_users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_etr_sessions_user ON etr_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_etr_sessions_expires ON etr_sessions (expires_at);

-- 商店 / 外卖评价（用户私有 + 可选公开到广场）
CREATE TABLE IF NOT EXISTS store_review (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER NOT NULL,
  platform       TEXT    NOT NULL,
  platform_other TEXT,
  store_name     TEXT    NOT NULL,
  score          INTEGER NOT NULL,
  remark         TEXT,
  is_public      INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES etr_users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS store_review_dish (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  review_id  INTEGER NOT NULL,
  kind       TEXT    NOT NULL,
  dish_name  TEXT    NOT NULL,
  remark     TEXT,
  FOREIGN KEY (review_id) REFERENCES store_review(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_store_review_user ON store_review (user_id);
CREATE INDEX IF NOT EXISTS idx_store_review_public ON store_review (is_public, updated_at);
CREATE INDEX IF NOT EXISTS idx_store_review_platform ON store_review (platform);
CREATE INDEX IF NOT EXISTS idx_store_review_store ON store_review (store_name);
CREATE INDEX IF NOT EXISTS idx_store_review_dish_review ON store_review_dish (review_id);

-- 用户反馈（关于页面提交）
CREATE TABLE IF NOT EXISTS user_feedback (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  email        TEXT    NOT NULL,
  content      TEXT    NOT NULL,
  ip           TEXT    NOT NULL,
  country_code TEXT,
  url_path     TEXT,
  locale       TEXT,
  created_at   TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_feedback_created ON user_feedback (created_at);

-- 访问与操作日志（后台分析）
CREATE TABLE IF NOT EXISTS visit_logs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  ip           TEXT    NOT NULL,
  country_code TEXT,
  url_path     TEXT    NOT NULL,
  event_type   TEXT    NOT NULL,
  event_detail TEXT,
  locale       TEXT,
  created_at   TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_visit_logs_created ON visit_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_visit_logs_ip ON visit_logs (ip);

-- 日语单词抽问：共用参考资料（图片/PDF，多条词条可指向同一 ref_key）
CREATE TABLE IF NOT EXISTS jp_vocab_ref (
  ref_key    TEXT    PRIMARY KEY,
  title      TEXT,
  media_type TEXT    NOT NULL DEFAULT 'image',
  r2_key     TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- 日语单词抽问：单词/语法列表 + 熟悉程度统计
CREATE TABLE IF NOT EXISTS jp_vocab_word (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  word       TEXT    NOT NULL,
  reading    TEXT,
  meaning    TEXT,
  kind       TEXT    NOT NULL DEFAULT 'word',
  ref_key    TEXT,
  cnt_very   INTEGER NOT NULL DEFAULT 0,
  cnt_normal INTEGER NOT NULL DEFAULT 0,
  cnt_weak   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (ref_key) REFERENCES jp_vocab_ref (ref_key) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_jp_vocab_word ON jp_vocab_word (word);
CREATE INDEX IF NOT EXISTS idx_jp_vocab_weak ON jp_vocab_word (cnt_weak DESC, cnt_normal ASC);
CREATE INDEX IF NOT EXISTS idx_jp_vocab_ref_key ON jp_vocab_word (ref_key);

-- 已有库升级（仅需执行一次）：
-- CREATE TABLE IF NOT EXISTS jp_vocab_ref (...);  -- 同上
-- ALTER TABLE jp_vocab_word ADD COLUMN kind TEXT NOT NULL DEFAULT 'word';
-- ALTER TABLE jp_vocab_word ADD COLUMN ref_key TEXT;
-- CREATE INDEX IF NOT EXISTS idx_jp_vocab_ref_key ON jp_vocab_word (ref_key);

-- trend_aggregator：每日抓取批次 + 条目（含 AI 提示词，可溯源）
CREATE TABLE IF NOT EXISTS trend_fetch_run (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  fetched_at          TEXT    NOT NULL,
  github_count        INTEGER NOT NULL DEFAULT 0,
  reddit_count        INTEGER NOT NULL DEFAULT 0,
  combined_count      INTEGER NOT NULL DEFAULT 0,
  selected_count      INTEGER NOT NULL DEFAULT 0,
  raw_payload         TEXT    NOT NULL,
  batch_system_prompt TEXT,
  batch_user_prompt   TEXT,
  batch_full_prompt   TEXT,
  created_at          TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_trend_fetch_run_fetched ON trend_fetch_run (fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_trend_fetch_run_created ON trend_fetch_run (created_at DESC);

CREATE TABLE IF NOT EXISTS trend_item (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id          INTEGER NOT NULL,
  source          TEXT    NOT NULL,
  external_id     TEXT    NOT NULL,
  title           TEXT    NOT NULL,
  description     TEXT,
  url             TEXT,
  stars           INTEGER,
  language        TEXT,
  subreddit       TEXT,
  topics_json     TEXT,
  published_at    TEXT,
  heat_score      REAL    NOT NULL DEFAULT 0,
  selected        INTEGER NOT NULL DEFAULT 0,
  selection_rank  INTEGER,
  item_json       TEXT    NOT NULL,
  system_prompt   TEXT,
  user_prompt     TEXT,
  full_prompt     TEXT,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (run_id) REFERENCES trend_fetch_run(id) ON DELETE CASCADE,
  UNIQUE (run_id, source, external_id)
);

CREATE INDEX IF NOT EXISTS idx_trend_item_run ON trend_item (run_id);
CREATE INDEX IF NOT EXISTS idx_trend_item_selected ON trend_item (run_id, selected, selection_rank);
CREATE INDEX IF NOT EXISTS idx_trend_item_heat ON trend_item (run_id, heat_score DESC);
