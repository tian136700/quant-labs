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
  disabled      INTEGER NOT NULL DEFAULT 0,
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

-- 一次性登录链接（管理员生成，兑换后 30 天会话）
CREATE TABLE IF NOT EXISTS etr_login_links (
  token               TEXT    NOT NULL PRIMARY KEY,
  user_id             INTEGER NOT NULL,
  link_expires_at     TEXT    NOT NULL,
  consumed_at         TEXT,
  created_by_admin_id INTEGER NOT NULL,
  created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES etr_users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_etr_login_links_user ON etr_login_links (user_id);

-- 管理员：复制登录链接时可选附带的文字模板（支持 {login_url} 占位符）
CREATE TABLE IF NOT EXISTS etr_login_link_templates (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  body       TEXT    NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_etr_login_link_templates_sort ON etr_login_link_templates (sort_order ASC, id ASC);

-- RBAC：角色 → 权限（admin 在代码层始终拥有全部权限）
CREATE TABLE IF NOT EXISTS etr_role_permissions (
  role           TEXT    NOT NULL,
  permission_key TEXT    NOT NULL,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (role, permission_key)
);

CREATE INDEX IF NOT EXISTS idx_etr_role_permissions_role ON etr_role_permissions (role);

-- 登录失败限速（按 IP 撞库防护）
CREATE TABLE IF NOT EXISTS etr_login_guard (
  client_key   TEXT    NOT NULL PRIMARY KEY,
  fail_count   INTEGER NOT NULL DEFAULT 0,
  window_start TEXT    NOT NULL,
  updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

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
  geo_region   TEXT,
  geo_region_code TEXT,
  geo_city     TEXT,
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
  geo_region   TEXT,
  geo_region_code TEXT,
  geo_city     TEXT,
  username     TEXT,
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
  pos        TEXT,
  kind       TEXT    NOT NULL DEFAULT 'word',
  ref_key    TEXT,
  cnt_very   INTEGER NOT NULL DEFAULT 0,
  cnt_normal INTEGER NOT NULL DEFAULT 0,
  cnt_weak   INTEGER NOT NULL DEFAULT 0,
  today_check_count INTEGER NOT NULL DEFAULT 0,
  today_check_date  TEXT,
  class_notes TEXT,
  last_review_level TEXT,
  last_review_at TEXT,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (ref_key) REFERENCES jp_vocab_ref (ref_key) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_jp_vocab_word ON jp_vocab_word (word);
CREATE INDEX IF NOT EXISTS idx_jp_vocab_weak ON jp_vocab_word (cnt_weak DESC, cnt_normal ASC);
CREATE INDEX IF NOT EXISTS idx_jp_vocab_ref_key ON jp_vocab_word (ref_key);
CREATE INDEX IF NOT EXISTS idx_jp_vocab_updated_at ON jp_vocab_word (updated_at);

-- 日语单词抽问：站点级配置（如今日前 20 条标记样式，管理员统一设置）
CREATE TABLE IF NOT EXISTS jp_vocab_setting (
  key        TEXT    PRIMARY KEY,
  value      TEXT    NOT NULL,
  updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- 日语单词抽问：老师共享给学生「今日背单词」（北京时间 0 点按 share_date 自然清空）
CREATE TABLE IF NOT EXISTS jp_vocab_shared (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  word_id    INTEGER NOT NULL,
  shared_by  TEXT    NOT NULL,
  shared_at  TEXT    NOT NULL,
  share_date TEXT    NOT NULL,
  FOREIGN KEY (word_id) REFERENCES jp_vocab_word (id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_jp_vocab_shared_day_word
  ON jp_vocab_shared (share_date, word_id);
CREATE INDEX IF NOT EXISTS idx_jp_vocab_shared_date ON jp_vocab_shared (share_date);

-- 日语新课：上课老师（管理员维护，仅管理员可见）
CREATE TABLE IF NOT EXISTS jp_lesson_teacher (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL UNIQUE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_jp_lesson_teacher_sort ON jp_lesson_teacher (sort_order ASC, id ASC);

-- 日语新课：学习清单 + 教案（API 在此上传，逗号分隔学习内容）
CREATE TABLE IF NOT EXISTS jp_lesson (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT    NOT NULL DEFAULT 'word',
  content     TEXT    NOT NULL,
  title       TEXT,
  ref_key     TEXT,
  completed           INTEGER NOT NULL DEFAULT 0,
  learning            INTEGER NOT NULL DEFAULT 0,
  status_updated_at   TEXT,
  status_updated_by   TEXT,
  teacher_other       TEXT,
  /** 下次上课时间（北京时间 YYYY-MM-DD HH:mm:ss；仅管理员可见与编辑） */
  next_class_at       TEXT,
  /** 上课时长（分钟：20 / 30 / 45 / 55 / 60；仅管理员可见与编辑） */
  class_duration_minutes INTEGER,
  uploaded_at         TEXT    NOT NULL DEFAULT (datetime('now')),
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (ref_key) REFERENCES jp_vocab_ref (ref_key) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_jp_lesson_uploaded ON jp_lesson (uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_jp_lesson_ref ON jp_lesson (ref_key);

-- 日语新课：课程与上课老师（多对多，仅管理员可见）
CREATE TABLE IF NOT EXISTS jp_lesson_teacher_link (
  lesson_id  INTEGER NOT NULL,
  teacher_id INTEGER NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (lesson_id, teacher_id),
  FOREIGN KEY (lesson_id) REFERENCES jp_lesson (id) ON DELETE CASCADE,
  FOREIGN KEY (teacher_id) REFERENCES jp_lesson_teacher (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_jp_lesson_teacher_link_teacher ON jp_lesson_teacher_link (teacher_id);

-- 日语新课：多条预约上课时间（仅管理员可见与编辑）
CREATE TABLE IF NOT EXISTS jp_lesson_class_schedule (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  lesson_id        INTEGER NOT NULL,
  class_at         TEXT    NOT NULL,
  duration_minutes INTEGER,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (lesson_id) REFERENCES jp_lesson (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_jp_lesson_class_schedule_lesson ON jp_lesson_class_schedule (lesson_id, sort_order ASC, class_at ASC);

-- 日语新课：上课老师评价（管理员维护，参照英语老师评价：0～10 分 + 备注）
CREATE TABLE IF NOT EXISTS jp_lesson_teacher_review (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_id  INTEGER NOT NULL,
  class_date  TEXT    NOT NULL,
  score       INTEGER NOT NULL,
  remark      TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (teacher_id) REFERENCES jp_lesson_teacher (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_jp_lesson_teacher_review_teacher ON jp_lesson_teacher_review (teacher_id);
CREATE INDEX IF NOT EXISTS idx_jp_lesson_teacher_review_class_date ON jp_lesson_teacher_review (class_date);
CREATE INDEX IF NOT EXISTS idx_jp_lesson_teacher_review_updated_at ON jp_lesson_teacher_review (updated_at);

-- 日语新课：课堂笔记（每条笔记归属 content 中的某一单词/语法）
CREATE TABLE IF NOT EXISTS jp_lesson_note (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  lesson_id  INTEGER NOT NULL,
  item_word  TEXT    NOT NULL,
  body       TEXT    NOT NULL,
  created_by TEXT,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (lesson_id) REFERENCES jp_lesson (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_jp_lesson_note_lesson ON jp_lesson_note (lesson_id);

-- 已有库升级（仅需执行一次）：
-- ALTER TABLE user_feedback ADD COLUMN geo_region TEXT;
-- ALTER TABLE user_feedback ADD COLUMN geo_region_code TEXT;
-- ALTER TABLE user_feedback ADD COLUMN geo_city TEXT;
-- ALTER TABLE visit_logs ADD COLUMN geo_region TEXT;
-- ALTER TABLE visit_logs ADD COLUMN geo_region_code TEXT;
-- ALTER TABLE visit_logs ADD COLUMN geo_city TEXT;
-- ALTER TABLE visit_logs ADD COLUMN username TEXT;
-- CREATE TABLE IF NOT EXISTS jp_vocab_ref (...);  -- 同上
-- ALTER TABLE jp_vocab_word ADD COLUMN kind TEXT NOT NULL DEFAULT 'word';
-- ALTER TABLE jp_vocab_word ADD COLUMN ref_key TEXT;
-- CREATE INDEX IF NOT EXISTS idx_jp_vocab_ref_key ON jp_vocab_word (ref_key);
-- ALTER TABLE jp_vocab_word ADD COLUMN pos TEXT;
-- CREATE TABLE IF NOT EXISTS jp_vocab_setting (...);  -- 同上
-- ALTER TABLE jp_lesson ADD COLUMN teacher_other TEXT;
-- ALTER TABLE jp_lesson ADD COLUMN next_class_at TEXT;
-- ALTER TABLE jp_lesson ADD COLUMN class_duration_minutes INTEGER;
-- CREATE TABLE IF NOT EXISTS jp_lesson_class_schedule (...);  -- 同上

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

-- AI Trend Digest 博客：手动/API 发布的文章（按 locale + slug 唯一）
CREATE TABLE IF NOT EXISTS trend_blog_publish (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  locale           TEXT    NOT NULL,
  slug             TEXT    NOT NULL DEFAULT 'featured',
  title            TEXT    NOT NULL,
  meta_description TEXT,
  headline         TEXT    NOT NULL,
  author           TEXT,
  published_at     TEXT    NOT NULL,
  read_minutes     INTEGER,
  tags_json        TEXT,
  content_html     TEXT    NOT NULL,
  is_published     INTEGER NOT NULL DEFAULT 1,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (locale, slug)
);

CREATE INDEX IF NOT EXISTS idx_trend_blog_publish_locale ON trend_blog_publish (locale, slug, is_published, updated_at DESC);

-- 在线工具站（tool.info-quests.com）：兑换码，一码一次
CREATE TABLE IF NOT EXISTS tool_dot_codes (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  code                 TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  tool_type            TEXT    NOT NULL,
  label                TEXT,
  consumed_at          TEXT,
  consumed_ip          TEXT,
  consumed_filename    TEXT,
  created_by_admin_id  INTEGER,
  created_at           TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tool_dot_codes_consumed ON tool_dot_codes (consumed_at);
