#!/usr/bin/env python3
"""Regression: 韩语勾选总库 → 抽问池 / 复习池拆分 + 复习页."""

from pathlib import Path
import sys
import re

ROOT = Path(__file__).resolve().parents[1]


def read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


db = read("src/lib/ko-pron-db.ts")
schema = read("schema.sql")
select_page = read("src/components/KoPronSelectPage.tsx")
select_api = read("src/app/api/ko-pron/select/route.ts")
quiz_page = read("src/components/KoPronPage.tsx")
review_page = read("src/components/KoPronReviewPage.tsx")
review_card = read("src/components/KoPronReviewFlashcardModal.tsx")
review_api = read("src/app/api/ko-pron/review/route.ts")
feature = read("docs/feature-index.md")
rule = read(".cursor/rules/ko-pron-select-quiz-split.mdc")
messages = read("src/i18n/messages.ts")
nav_items = read("src/hooks/useSiteNavItems.ts")
nav_config = read("src/lib/site-nav-config.ts")

assert "ko_pron_catalog" in schema, "schema missing ko_pron_catalog"
assert "review_selected_at" in schema
assert "ko_pron_review_done" in schema
assert "CREATE TABLE IF NOT EXISTS ko_pron_catalog" in db
assert "seedCatalogIfEmpty" in db
assert "selectKoPronCatalogIntoQuiz" in db
assert "selectKoPronCatalogBatchIntoQuiz" in db
assert "selectKoPronCatalogBatchIntoReview" in db
assert "quiz_pool_split_v1" in db, "missing one-time quiz pool clear migration"
assert "async function seedIfEmpty" not in db, "old seedIfEmpty must be removed"
assert "INSERT OR IGNORE INTO ko_pron_catalog" in db

seed_letter_inserts = re.findall(
    r"INSERT[^;]*ko_pron_letter[^;]*KO_PRON_SEED", db, flags=re.S
)
assert not seed_letter_inserts, "must not seed quiz table from KO_PRON_SEED_LETTERS"

# Select UI + API（批量：抽问 / 复习）
assert "韩语发音勾选" in select_page
assert "批量加入抽问" in select_page
assert "批量加入复习" in select_page
assert "checkbox" in select_page
assert "catalog_ids" in select_page
assert "select_review" in select_page
assert "handleCopyLetter" in select_page or "copyTextToClipboard" in select_page or "KoPronLetterCopyButton" in select_page
assert "CopyToast" in select_page
assert "selectKoPronCatalogBatchIntoReview" in select_api
assert 'action !== "select"' in select_api or 'action === "select_review"' in select_api
assert "requireKoPronAdmin" in select_api
assert "await db.batch" in db or "db.batch(" in db

# Review page + card
assert "开始复习" in review_page
assert "显示读音" in review_card
assert "speakKoPronLetter" in review_card
# 未揭示时不应渲染 Speak 按钮（只在 revealed 分支）
assert "KoPronSpeakButton" in review_card
assert re.search(
    r"!\s*revealed\s*\?[\s\S]*?显示读音[\s\S]*?:\s*\([\s\S]*?KoPronSpeakButton",
    review_card,
) or (
    "{!revealed ?" in review_card
    and review_card.index("{!revealed ?") < review_card.index("KoPronSpeakButton")
), "Speak must appear only after reveal"
assert "review_next" in review_api
assert "clearKoPronReviewDone" in review_api or 'action === "clear"' in review_api
assert "requireKoPronAdmin" in review_api
assert (ROOT / "src/app/ko-pron/review/page.tsx").is_file()
assert (ROOT / "src/lib/ko-pron-review-session.ts").is_file()

# Quiz empty pool points to select
assert "koPronSelectPath" in quiz_page
assert "抽问池为空" in quiz_page

# 导出随机卡片：按本次乱序标序号（老师对照「第几个」）
export_card = read("src/lib/ko-pron-quiz-card-export.ts")
assert "exportKoPronRandomQuizCard" in export_card
assert "const seq = i + 1" in export_card
assert "乱序编号" in export_card or "本次导出序号" in export_card
assert "import(" not in export_card and "from \"html2canvas\"" not in export_card
assert "from \"jspdf\"" not in export_card and "from 'jspdf'" not in export_card
assert "createElement(\"canvas\")" in export_card or 'createElement("canvas")' in export_card

# Nav / docs
assert "koPronSelect" in messages
assert "koPronReview" in messages
assert "韩语发音复习" in messages
assert "koPronReviewPath" in read("src/lib/locale-path.ts")
assert 'id: "koPronReview"' in nav_items
assert "koPronReview" in nav_config
assert "韩语发音勾选" in feature
assert "/ko-pron/review" in feature
assert "左上角" in feature and "序号" in feature
assert "review_selected_at" in rule or "加入复习" in rule
assert "禁止" in rule and ("seed" in rule.lower() or "全量" in rule)

print("ok: ko-pron select → quiz/review pools + review page")
sys.exit(0)
