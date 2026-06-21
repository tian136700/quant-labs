-- jp-vocab 语法 + 共用参考资料（在已有库上增量执行）
CREATE TABLE IF NOT EXISTS jp_vocab_ref (
  ref_key    TEXT    PRIMARY KEY,
  title      TEXT,
  media_type TEXT    NOT NULL DEFAULT 'image',
  r2_key     TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

ALTER TABLE jp_vocab_word ADD COLUMN kind TEXT NOT NULL DEFAULT 'word';
ALTER TABLE jp_vocab_word ADD COLUMN ref_key TEXT;

CREATE INDEX IF NOT EXISTS idx_jp_vocab_ref_key ON jp_vocab_word (ref_key);
