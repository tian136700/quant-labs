-- 日语新课：上课老师 + 多对多关联（在已有库上增量执行）
CREATE TABLE IF NOT EXISTS jp_lesson_teacher (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL UNIQUE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_jp_lesson_teacher_sort ON jp_lesson_teacher (sort_order ASC, id ASC);

-- 旧版单列 teacher_id（若已存在则保留；数据会迁移到 link 表）
ALTER TABLE jp_lesson ADD COLUMN teacher_id INTEGER REFERENCES jp_lesson_teacher (id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS jp_lesson_teacher_link (
  lesson_id  INTEGER NOT NULL,
  teacher_id INTEGER NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (lesson_id, teacher_id),
  FOREIGN KEY (lesson_id) REFERENCES jp_lesson (id) ON DELETE CASCADE,
  FOREIGN KEY (teacher_id) REFERENCES jp_lesson_teacher (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_jp_lesson_teacher_link_teacher ON jp_lesson_teacher_link (teacher_id);

INSERT OR IGNORE INTO jp_lesson_teacher_link (lesson_id, teacher_id)
SELECT id, teacher_id FROM jp_lesson WHERE teacher_id IS NOT NULL;
