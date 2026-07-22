#!/usr/bin/env python3
"""Regression: 韩语分类必须是 辅音/双辅音/单元音/双元音（拆开，不用「元音/复合元音」）。"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SEED = ROOT / "src" / "lib" / "ko-pron-seed.ts"
DB = ROOT / "src" / "lib" / "ko-pron-db.ts"


def fail(msg: str) -> int:
    print(f"[check_ko_pron_vowel_categories] FAIL: {msg}", file=sys.stderr)
    return 1


def main() -> int:
    seed = SEED.read_text(encoding="utf-8")
    db = DB.read_text(encoding="utf-8")

    cats = re.search(
        r"export const KO_PRON_CATEGORIES = \[([\s\S]*?)\] as const",
        seed,
    )
    if not cats:
        return fail("KO_PRON_CATEGORIES missing")
    block = cats.group(1)
    for required in ("辅音", "双辅音", "单元音", "双元音"):
        if f'"{required}"' not in block:
            return fail(f'KO_PRON_CATEGORIES missing "{required}"')
    for banned in ("复合元音",):
        if f'"{banned}"' in block:
            return fail(f'KO_PRON_CATEGORIES must not use "{banned}"')
    # bare「元音」as its own category is banned; 「单元音」「双元音」ok
    if re.search(r'"元音"', block):
        return fail('use "单元音" not bare "元音"')

    # Seed letters: ㅏ class → 单元音；ㅐ class → 双元音
    if not re.search(r'letter:\s*"ㅏ"[^}]*category:\s*"单元音"', seed):
        return fail('ㅏ must be category "单元音"')
    if not re.search(r'letter:\s*"ㅐ"[^}]*category:\s*"双元音"', seed):
        return fail('ㅐ must be category "双元音"')

    if "vowel_category_rename_v1" not in db:
        return fail("missing vowel_category_rename_v1 migration for existing D1 rows")
    if "migrateVowelCategoryRenameOnce" not in db:
        return fail("missing migrateVowelCategoryRenameOnce")

    print("[check_ko_pron_vowel_categories] OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
