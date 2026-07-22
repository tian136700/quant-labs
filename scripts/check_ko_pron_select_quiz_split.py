#!/usr/bin/env python3
"""Regression: 韩语勾选总库 → 抽问池拆分（对齐日语新课 → 日语抽问）。"""

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]


def read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


db = read("src/lib/ko-pron-db.ts")
schema = read("schema.sql")
select_page = read("src/components/KoPronSelectPage.tsx")
select_api = read("src/app/api/ko-pron/select/route.ts")
quiz_page = read("src/components/KoPronPage.tsx")
feature = read("docs/feature-index.md")
rule = read(".cursor/rules/ko-pron-select-quiz-split.mdc")

# Catalog table exists; quiz letter not seeded from KO_PRON_SEED_LETTERS wholesale
assert "ko_pron_catalog" in schema, "schema missing ko_pron_catalog"
assert "CREATE TABLE IF NOT EXISTS ko_pron_catalog" in db
assert "seedCatalogIfEmpty" in db
assert "selectKoPronCatalogIntoQuiz" in db
assert "quiz_pool_split_v1" in db, "missing one-time quiz pool clear migration"

# Must NOT insert seed letters into quiz table in a seedIfEmpty loop
assert "async function seedIfEmpty" not in db, "old seedIfEmpty must be removed"
# seed catalog inserts only into catalog
assert "INSERT OR IGNORE INTO ko_pron_catalog" in db
# quiz inserts only via select path (no KO_PRON_SEED_LETTERS.bind into letter)
import re

seed_letter_inserts = re.findall(
    r"INSERT[^;]*ko_pron_letter[^;]*KO_PRON_SEED", db, flags=re.S
)
assert not seed_letter_inserts, "must not seed quiz table from KO_PRON_SEED_LETTERS"

# Select UI + API（批量勾选入库）
assert "韩语发音勾选" in select_page
assert "已勾选" in select_page
assert "勾选时间" in select_page
assert "批量加入抽问" in select_page
assert 'type="checkbox"' in select_page or "checkbox" in select_page
assert "catalog_ids" in select_page
assert "selectKoPronCatalogBatchIntoQuiz" in db
assert "selectKoPronCatalogBatchIntoQuiz" in select_api or "catalog_ids" in select_api
assert "selectKoPronCatalogIntoQuiz" in select_api
assert "requireKoPronAdmin" in select_api
assert "db.batch" in db or "await db.batch" in db

# Quiz empty pool points to select
assert "koPronSelectPath" in quiz_page
assert "抽问池为空" in quiz_page

# Nav / docs
assert "koPronSelect" in read("src/i18n/messages.ts")
assert "koPronSelectPath" in read("src/lib/locale-path.ts")
assert "韩语发音勾选" in feature
assert "seedCatalogIfEmpty" in rule or "只进" in rule or "ko_pron_catalog" in rule
assert "selectKoPronCatalogIntoQuiz" in rule or "勾选" in rule
assert "禁止" in rule and "seed" in rule.lower() or "禁止" in rule and "全量" in rule

print("ok: ko-pron select → quiz pool split (jp-lesson → jp-vocab analog)")
sys.exit(0)
