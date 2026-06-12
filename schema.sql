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
