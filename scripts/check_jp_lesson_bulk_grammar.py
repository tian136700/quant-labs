#!/usr/bin/env python3
"""回归：日语新课批量新增语法（粘贴解析 + API action + 标注别名）。"""

from __future__ import annotations

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]

SAMPLE = """
1. ～の＋は＋形容詞
释义：把动词小句名词化后加「は」，后接形容词说明对这件事的感受。
标注：考试和口语常用
口语频次：8
考试频次：8

2. ～の＋を＋动词
释义：动词小句名词化后加「を」。
标注：考试和口语常用
口语频次：8
考试频次：8

3. ～でしょう
释义：推测。
标注：考试和口语常用
口语频次：9
考试频次：9

4. ～かもしれません
释义：可能性较低。
标注：考试和口语常用
口语频次：9
考试频次：9

5. もしかしたら～かもしれません／もしかしたら～ではありませんか
释义：加强不确定语气。
标注：考试和口语常用
口语频次：7
考试频次：6

6. それで
释义：因此、所以。
标注：考试和口语常用
口语频次：8
考试频次：6

7. つい～てしまいます
释义：不由自主地做了某事。
标注：考试和口语常用
口语频次：7
考试频次：6
""".strip()


def must_contain(path: pathlib.Path, needle: str, label: str) -> None:
    text = path.read_text(encoding="utf-8")
    if needle not in text:
        raise SystemExit(
            f"FAIL {label}: missing {needle!r} in {path.relative_to(ROOT)}"
        )


def main() -> int:
    parse = ROOT / "src/lib/jp-lesson-bulk-grammar-parse.ts"
    bulk = ROOT / "src/lib/jp-lesson-bulk-grammar.ts"
    route = ROOT / "src/app/api/jp-lesson/route.ts"
    ann = ROOT / "src/lib/jp-vocab-annotation.ts"
    lesson_upsert = ROOT / "src/lib/jp-vocab-db/lesson.ts"
    modal = ROOT / "src/components/JpLessonBulkGrammarModal.tsx"
    page = ROOT / "src/components/JpLessonPage.tsx"
    docs = ROOT / "docs/jp-lesson-bulk-grammar-api.txt"
    rule = ROOT / ".cursor/rules/jp-lesson-bulk-grammar.mdc"

    must_contain(parse, "parseJpLessonBulkGrammarText", "parse export")
    must_contain(parse, "口语(?:频次|频率)", "oral freq regex")
    must_contain(parse, "考试(?:频次|频率)", "exam freq regex")
    must_contain(parse, 'join(", ")', "content join")
    must_contain(parse, 'join("|")', "meanings join")
    must_contain(ann, "canonicalizeJpVocabAnnotationAlias", "annotation alias")
    must_contain(ann, "考试和口语常用", "alias text")
    must_contain(bulk, "bulkCreateJpLessonGrammar", "bulk create")
    must_contain(bulk, "skipExistingGrammar: true", "skip existing")
    must_contain(route, 'action === "bulk_create_grammar"', "API action")
    must_contain(lesson_upsert, "skipExistingGrammar", "upsert option")
    must_contain(lesson_upsert, "oral_frequency", "upsert oral")
    must_contain(modal, "JpLessonBulkGrammarModal", "modal")
    must_contain(page, "bulkGrammarOpen", "page wire")
    must_contain(docs, "bulk_create_grammar", "api docs action")
    must_contain(rule, "skipExistingGrammar", "rule")

    heads = re.findall(r"(?m)^\d+[\.．、]\s*", SAMPLE)
    if len(heads) != 7:
        raise SystemExit(f"FAIL sample heads: expected 7 got {len(heads)}")

    print("[check_jp_lesson_bulk_grammar] OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
