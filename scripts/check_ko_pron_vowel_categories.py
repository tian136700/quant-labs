#!/usr/bin/env python3
"""Regression: 韩语分类名须为教材用语 辅音/双辅音/基本元音/复合元音。

字母归属不变（ㅑㅕㅛㅠ∈基本元音；ㅐㅔ∈复合元音）；禁止「单元音」「双元音」或单独「元音」。
"""

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
    for required in ("辅音", "双辅音", "基本元音", "复合元音"):
        if f'"{required}"' not in block:
            return fail(f'KO_PRON_CATEGORIES missing "{required}"')
    for banned in ("单元音", "双元音"):
        if f'"{banned}"' in block:
            return fail(f'KO_PRON_CATEGORIES must not use textbook-conflict name "{banned}"')
    if re.search(r'"元音"', block):
        return fail('use "基本元音" not bare "元音"')

    # 归属：ㅏ / ㅑ → 基本元音；ㅐ / ㅔ → 复合元音（勿语言学重划）
    for letter in ("ㅏ", "ㅑ", "ㅕ", "ㅛ", "ㅠ"):
        if not re.search(
            rf'letter:\s*"{letter}"[^}}]*category:\s*"基本元音"', seed
        ):
            return fail(f'{letter} must stay category "基本元音"')
    for letter in ("ㅐ", "ㅔ", "ㅘ", "ㅢ"):
        if not re.search(
            rf'letter:\s*"{letter}"[^}}]*category:\s*"复合元音"', seed
        ):
            return fail(f'{letter} must stay category "复合元音"')

    if "vowel_category_textbook_v2" not in db:
        return fail("missing vowel_category_textbook_v2 migration")
    if "migrateVowelCategoryTextbookOnce" not in db:
        return fail("missing migrateVowelCategoryTextbookOnce")

    print("[check_ko_pron_vowel_categories] OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
