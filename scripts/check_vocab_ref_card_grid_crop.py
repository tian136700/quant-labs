#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Regression: 标日图片版单词教案按行间白缝横切（双列 / 三卡；分页 Word 每页两行）。"""

from __future__ import annotations

import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

try:
    from PIL import Image
except ImportError:
    print("FAIL: need Pillow (pip install pillow)")
    sys.exit(1)

# 与生产算法同源
sys.path.insert(0, str(ROOT / "scripts"))
from lib.jp_lesson_board_docx_build import (  # noqa: E402
    detect_word_card_grid_row_splits,
    estimate_word_card_columns,
    group_sections_into_pages,
    resolve_card_grid_sections,
)


def main() -> int:
    errors: list[str] = []

    crop_ts = ROOT / "src/lib/jp-vocab-ref-card-grid-crop.ts"
    if not crop_ts.is_file():
        errors.append("missing jp-vocab-ref-card-grid-crop.ts")
    else:
        text = crop_ts.read_text(encoding="utf-8")
        for needle in (
            "detectWordCardGridRowSplits",
            "cardGridSplitsToSectionBounds",
            "estimateWordCardColumns",
            "refineCardGridSplitsForRowCount",
            "minFirst",
        ):
            if needle not in text:
                errors.append(f"card-grid crop missing {needle}")

    export_ts = ROOT / "src/lib/jp-vocab-ref-pdf-export.ts"
    export_text = export_ts.read_text(encoding="utf-8") if export_ts.is_file() else ""
    for needle in (
        "detectWordCardGridRowSplits",
        "cardGridSplitsToSectionBounds",
        "jp-vocab-ref-card-grid-crop",
        "partGapMm = 32",
    ):
        if needle not in export_text:
            errors.append(f"pdf-export must wire {needle}")

    # 分页 Word 须两两成页
    pages = group_sections_into_pages([(0, 10), (10, 20), (20, 30), (30, 40), (40, 50)])
    if pages != [[(0, 10), (10, 20)], [(20, 30), (30, 40)], [(40, 50)]]:
        errors.append(f"group_sections_into_pages must pair 2 rows/page, got {pages}")

    fixture = ROOT / "scripts/fixtures/jp-lesson-148-word-card-grid.png"
    img_path = fixture if fixture.is_file() else None
    if img_path is None:
        tmp = Path("/tmp/lesson-148.png")
        if not tmp.is_file():
            url = (
                "https://finance.info-quests.com/api/jp-vocab/ref/lesson-148"
                "?v=2026-08-08%2004:25:09"
            )
            try:
                urllib.request.urlretrieve(url, tmp)
            except Exception as exc:  # noqa: BLE001
                errors.append(f"cannot fetch lesson-148 sample: {exc}")
                tmp = None  # type: ignore[assignment]
        if tmp is not None and tmp.is_file():
            img_path = tmp

    if img_path and img_path.is_file():
        img = Image.open(img_path)
        splits = detect_word_card_grid_row_splits(img)
        cols = estimate_word_card_columns(img)
        if cols != 3:
            errors.append(f"lesson-148 expected 3 columns, got {cols}")
        if splits is None:
            errors.append("lesson-148 card-grid detect returned null")
        elif splits != [381, 630, 870, 1095, 1295]:
            errors.append(
                f"lesson-148 expected splits [381, 630, 870, 1095, 1295], got {splits!r}"
            )
        elif splits[0] < 200:
            errors.append(
                f"first split too early ({splits[0]}); header must stay with row 1"
            )
        else:
            print(
                f"ok: lesson-148 card-grid splits={splits} sections={len(splits)+1} cols={cols}"
            )
    else:
        errors.append("no lesson-148 image for runtime crop check")

    # 双列样例（第26课）：可选本地 /tmp
    two_col = Path("/tmp/lesson-149.png")
    if two_col.is_file():
        img149 = Image.open(two_col)
        cols149 = estimate_word_card_columns(img149)
        if cols149 != 2:
            errors.append(f"lesson-149 expected 2 columns, got {cols149}")
        sections, wpr = resolve_card_grid_sections(img149, n_words=20)
        pages149 = group_sections_into_pages(sections)
        if wpr != 2:
            errors.append(f"lesson-149 words_per_row expected 2, got {wpr}")
        if len(sections) < 8:
            errors.append(
                f"lesson-149 expected ≥8 row sections for 20 words / 2 cols, got {len(sections)}"
            )
        if any(len(p) > 2 for p in pages149):
            errors.append("lesson-149 Word pages must have at most 2 rows")
        # 首页不应塞进大半页词卡（旧 bug：第一节 0–783）
        first_h = sections[0][1] - sections[0][0]
        if first_h > img149.size[1] * 0.35:
            errors.append(
                f"lesson-149 first section too tall ({first_h}); rows not split"
            )
        else:
            print(
                f"ok: lesson-149 sections={len(sections)} pages={len(pages149)} "
                f"first_h={first_h} cols={cols149}"
            )

    if errors:
        print("FAIL: vocab-ref card-grid crop")
        for e in errors:
            print(f"  - {e}")
        return 1

    print("OK: vocab-ref card-grid crop guards")
    return 0


if __name__ == "__main__":
    sys.exit(main())
