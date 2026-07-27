#!/usr/bin/env python3
"""Regression: admin-only manual fill examples button + API wiring."""

from __future__ import annotations

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]


def must_contain(path: Path, needle: str) -> None:
    text = path.read_text(encoding="utf-8")
    if needle not in text:
        raise SystemExit(f"FAIL {path.relative_to(ROOT)}: missing {needle!r}")


def main() -> int:
    route = ROOT / "src/app/api/jp-vocab/manual-fill-examples/route.ts"
    lib = ROOT / "src/lib/jp-vocab-manual-fill-examples.ts"
    btn = (
        ROOT
        / "src/components/jp-vocab-teacher-quiz-flashcard/JpVocabFlashcardManualFillExamples.tsx"
    )
    modal = ROOT / "src/components/JpVocabTeacherQuizFlashcardModal.tsx"
    modals = ROOT / "src/components/jp-vocab-page/JpVocabPageModals.tsx"
    paired = ROOT / "src/components/JpVocabUsageExamplesPairedContent.tsx"

    must_contain(route, "requireAdmin")
    must_contain(route, "runJpVocabManualFillExamplesForWord")
    must_contain(lib, "buildJpVocabWordManualFillPrompt")
    must_contain(lib, "星期三是学校")
    must_contain(btn, "/api/jp-vocab/manual-fill-examples")
    must_contain(btn, "手动补全例句")
    # readApiJson 返回 { ok, data }，禁止把外层当业务 body
    must_contain(btn, "parsed.data")
    btn_text = btn.read_text(encoding="utf-8")
    if "const data = await readApiJson" in btn_text:
        raise SystemExit(
            "FAIL: use parsed = await readApiJson; then parsed.data (not data = readApiJson)"
        )
    must_contain(modal, "canManualFillExamples")
    must_contain(modal, "JpVocabFlashcardManualFillExamples")
    must_contain(modal, "JpVocabUsageExamplesPairedContent")
    must_contain(modals, "canManualFillExamples={props.isAdmin}")
    # 无用法时例句仍须带序号
    must_contain(paired, "jp-usage-ex-paired-example-row")
    # 禁止老师 canOperate 误开手动补全
    modals_text = modals.read_text(encoding="utf-8")
    if "canManualFillExamples={props.canOperate}" in modals_text:
        raise SystemExit("FAIL: manual fill must not use canOperate")
    print("ok: jp-vocab manual fill examples admin-only")
    return 0


if __name__ == "__main__":
    sys.exit(main())
