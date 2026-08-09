#!/usr/bin/env python3
"""回归：日语/英语教案 R2 前缀必须隔离，禁止英语再写 vocab-ref/。"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


def main() -> int:
    errors: list[str] = []

    jp = read("src/lib/jp-vocab-ref-shared.ts")
    en = read("src/lib/en-vocab-ref-shared.ts")
    review = read("src/lib/jp-review.ts")
    en_server = read("src/lib/en-vocab-ref-server.ts")

    if 'JP_VOCAB_REF_R2_PREFIX = "vocab-ref/"' not in jp:
        errors.append("jp-vocab-ref-shared must keep JP_VOCAB_REF_R2_PREFIX = vocab-ref/")
    if 'EN_VOCAB_REF_R2_PREFIX = "en-vocab-ref/"' not in en:
        errors.append("en-vocab-ref-shared must set EN_VOCAB_REF_R2_PREFIX = en-vocab-ref/")
    if 'return `en-lesson-${lessonId}`' not in en and 'return "en-lesson-"' not in en:
        if "en-lesson-${lessonId}" not in en:
            errors.append("enLessonRefKey must return en-lesson-{id}, not lesson-{id}")
    if re.search(
        r"export function enLessonRefKey[\s\S]*?return `lesson-\$\{lessonId\}`",
        en,
    ):
        errors.append("enLessonRefKey must NOT return bare lesson-{id}")
    if re.search(r'JP_VOCAB_REF_R2_PREFIX\s*=\s*"vocab-ref/"', en):
        errors.append("en-vocab-ref-shared must NOT redefine JP prefix as vocab-ref/")
    if "EN_VOCAB_REF_R2_PREFIX" not in en or "enVocabRefR2Key" not in en:
        errors.append("enVocabRefR2Key must use EN_VOCAB_REF_R2_PREFIX")
    if "EN_VOCAB_REF_R2_PREFIX" not in en.split("export function enVocabRefR2Key", 1)[-1][:400]:
        errors.append("enVocabRefR2Key body must reference EN_VOCAB_REF_R2_PREFIX")

    if "EN_VOCAB_REF_R2_PREFIX" not in review:
        errors.append("jp-review assertReviewOwnedKeys must protect EN_VOCAB_REF_R2_PREFIX")
    if "JP_VOCAB_REF_R2_PREFIX" not in review:
        errors.append("jp-review must still protect JP_VOCAB_REF_R2_PREFIX")

    # 上传路径不得手写 vocab-ref/ 拼英语 key
    if re.search(r'["`]vocab-ref/\$\{', en_server) or 'vocab-ref/" +' in en_server:
        errors.append("en-vocab-ref-server must not hardcode vocab-ref/ for EN puts")

    rule = ROOT / ".cursor/rules/vocab-ref-r2-prefix-namespace.mdc"
    if not rule.is_file():
        errors.append("missing .cursor/rules/vocab-ref-r2-prefix-namespace.mdc")

    if errors:
        print("FAIL check_vocab_ref_r2_prefix_namespace:")
        for e in errors:
            print(f"  - {e}")
        return 1
    print("OK check_vocab_ref_r2_prefix_namespace")
    return 0


if __name__ == "__main__":
    sys.exit(main())
