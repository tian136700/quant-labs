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
