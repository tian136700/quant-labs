-- 日语新课上课老师：独立课时费列 + 从旧版「名称-80/h」拆分（在已有库上增量执行）
ALTER TABLE jp_lesson_teacher ADD COLUMN hourly_rate REAL;

-- 拆分逻辑请用 scripts/migrate-jp-lesson-teacher-hourly-rate.py（含逐行解析与更新）
