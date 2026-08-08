#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Regression: 标日图片版单词教案按行间通栏白缝横切（分页 Word/PDF）。"""

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


def row_ink_fraction(px, w: int, y: int) -> float:
    x0 = max(0, int(w * 0.04))
    x1 = min(w, int(w * 0.96))
    ink = total = 0
    for x in range(x0, x1, 2):
        r, g, b = px[x, y]
        total += 1
        if not (r > 245 and g > 245 and b > 245):
            ink += 1
    return ink / total if total else 0.0


def mean_ink(px, w: int, h: int, y0: int, y1: int) -> float:
    a = max(0, y0)
    b = min(h, y1)
    if b <= a:
        return 0.0
    return sum(row_ink_fraction(px, w, y) for y in range(a, b)) / (b - a)


def dark_frac(px, w: int, h: int, y0: int, y1: int) -> float:
    a = max(0, y0)
    b = min(h, y1)
    if b <= a:
        return 0.0
    x0 = max(0, int(w * 0.04))
    x1 = min(w, int(w * 0.96))
    dark = total = 0
    for y in range(a, b):
        for x in range(x0, x1, 4):
            r, g, b_ = px[x, y]
            total += 1
            if (r + g + b_) / 3 < 90:
                dark += 1
    return dark / total if total else 0.0


def detect_word_card_grid_row_splits(img: Image.Image) -> list[int] | None:
    img = img.convert("RGB")
    w, h = img.size
    px = img.load()
    if w < 200 or h < 280:
        return None

    ink = [row_ink_fraction(px, w, y) for y in range(h)]
    smooth = []
    for y in range(h):
        a = max(0, y - 1)
        b = min(h, y + 2)
        smooth.append(sum(ink[a:b]) / (b - a))

    gutters: list[tuple[int, int]] = []
    run_start = None
    for y in range(h):
        on = smooth[y] < 0.08
        if on:
            if run_start is None:
                run_start = y
        elif run_start is not None:
            if y - run_start >= 3:
                gutters.append((run_start, y - 1))
            run_start = None
    if run_start is not None and h - run_start >= 3:
        gutters.append((run_start, h - 1))

    splits: list[int] = []
    for start, end in gutters:
        mid = (start + end) // 2
        if mid <= 40:
            continue
        above = mean_ink(px, w, h, mid - 90, mid - 8)
        below = mean_ink(px, w, h, mid + 8, mid + 90)
        if above < 0.25 or below < 0.25:
            continue
        dark_above = dark_frac(px, w, h, mid - 120, mid - 8)
        if mid < h * 0.28 and dark_above > 0.25:
            continue
        if splits and mid - splits[-1] < 80:
            continue
        splits.append(mid)

    if len(splits) < 1:
        return None
    return splits


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
            "darkAbove",
            "0.08",
        ):
            if needle not in text:
                errors.append(f"card-grid crop missing {needle}")

    export_ts = ROOT / "src/lib/jp-vocab-ref-pdf-export.ts"
    export_text = export_ts.read_text(encoding="utf-8") if export_ts.is_file() else ""
    for needle in (
        "detectWordCardGridRowSplits",
        "cardGridSplitsToSectionBounds",
        "jp-vocab-ref-card-grid-crop",
    ):
        if needle not in export_text:
            errors.append(f"pdf-export must wire {needle}")

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
        if splits is None:
            errors.append("lesson-148 card-grid detect returned null")
        elif len(splits) < 3:
            errors.append(f"lesson-148 expected ≥3 row splits (got {splits!r})")
        elif splits[0] < 200:
            errors.append(
                f"first split too early ({splits[0]}); header must stay with row 1"
            )
        else:
            print(
                f"ok: lesson-148 card-grid splits={splits} sections={len(splits)+1}"
            )
    else:
        errors.append("no lesson-148 image for runtime crop check")

    if errors:
        print("FAIL: vocab-ref card-grid crop")
        for e in errors:
            print(f"  - {e}")
        return 1

    print("OK: vocab-ref card-grid crop guards")
    return 0


if __name__ == "__main__":
    sys.exit(main())
