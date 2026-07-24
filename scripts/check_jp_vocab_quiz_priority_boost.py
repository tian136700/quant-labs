#!/usr/bin/env python3
"""回归：管理员「明日优先抽查」排序须先于从未抽查置顶。"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SHARED = ROOT / "src/lib/jp-vocab-shared.ts"
BOOST = ROOT / "src/lib/jp-vocab-quiz-priority-boost.ts"
DB = ROOT / "src/lib/jp-vocab-db.ts"
DB_DIR = ROOT / "src/lib/jp-vocab-db"
ROUTE = ROOT / "src/app/api/jp-vocab/route.ts"
TABLE = ROOT / "src/components/jp-vocab-page/JpVocabWordTable.tsx"

errors: list[str] = []


def read_jp_vocab_db() -> str:
    parts = [DB.read_text(encoding="utf-8")]
    if DB_DIR.is_dir():
        for p in sorted(DB_DIR.glob("*.ts")):
            parts.append(p.read_text(encoding="utf-8"))
    return "\n".join(parts)


def must_contain(path: Path, needle: str, msg: str) -> None:
    text = path.read_text(encoding="utf-8") if path != DB else read_jp_vocab_db()
    if needle not in text:
        label = "src/lib/jp-vocab-db/" if path == DB else path.relative_to(ROOT)
        errors.append(f"{label}: {msg}")


def must_match(path: Path, pattern: str, msg: str) -> None:
    text = path.read_text(encoding="utf-8")
    if not re.search(pattern, text, re.MULTILINE | re.DOTALL):
        errors.append(f"{path.relative_to(ROOT)}: {msg}")


must_contain(SHARED, "boostSeqByWordId", "sortJpVocabWordsForDailyOrder 须接受 boost 参数")
must_match(
    SHARED,
    r"aHasBoost !== bHasBoost.*?return aHasBoost \? -1 : 1",
    "boost 词条须排在非 boost 之前",
)
must_contain(BOOST, "appendJpVocabQuizPriorityBoostEntry", "缺少追加 boost 队列 helper")
must_contain(DB, "JP_VOCAB_QUIZ_PRIORITY_BOOST_KEY", "缺少 setting 键")
must_contain(DB, "boostJpVocabQuizPriority", "缺少写库入口")
must_contain(ROUTE, 'body.action === "boost_quiz_priority"', "缺少 API action")
must_contain(TABLE, "明日优先抽查", "管理员操作列缺少按钮文案")

if errors:
    print("check_jp_vocab_quiz_priority_boost FAILED:", file=sys.stderr)
    for err in errors:
        print(f"  - {err}", file=sys.stderr)
    sys.exit(1)

print("check_jp_vocab_quiz_priority_boost OK")
