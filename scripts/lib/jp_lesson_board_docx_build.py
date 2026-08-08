#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""日语新课板书 Word：词卡行切图 + 图下对齐读音表（OJAD）。

依赖：Pillow、python-docx（见 setup 脚本里的 venv）。
算法与 src/lib/jp-vocab-ref-card-grid-crop.ts / check_vocab_ref_card_grid_crop.py 一致。
"""

from __future__ import annotations

import hashlib
import io
import json
import re
from pathlib import Path
from typing import Any

from PIL import Image

WORDS_PER_ROW = 3
PART_GAP_MM = 25


def parse_lesson_content(raw: str) -> list[str]:
    text = (raw or "").strip()
    if not text:
        return []
    # 与 jp-lesson-shared parseLessonContent 对齐：逗号/顿号/中文逗号
    parts = re.split(r"[,，、\n]+", text)
    return [p.strip() for p in parts if p.strip()]


def pitch_type_label(pattern: str) -> str:
    p = (pattern or "").strip().upper()
    if not p:
        return ""
    n = p.find("N")
    if n < 0:
        if p.startswith("L") and re.fullmatch(r"LH+", p):
            return "平板"
        if p.startswith("H"):
            return "头高"
        return "平板"
    if n == 0:
        return "头高"
    if n == len(p) - 1:
        return "尾高"
    return "中高"


def parse_pitch_json(raw: str | None) -> dict[str, Any] | None:
    text = (raw or "").strip()
    if not text:
        return None
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict):
        return None
    kana = str(data.get("kana") or "").strip()
    pattern = str(data.get("pattern") or "").strip()
    moras = data.get("moras")
    if not kana or not isinstance(moras, list) or not moras:
        return None
    return {"kana": kana, "pattern": pattern or "".join(str(m.get("p") or "") for m in moras)}


def pitch_digest(pitch_accent: str | None, pitch_source: str | None) -> str:
    src = (pitch_source or "").strip()
    if src == "OJAD_NONE":
        return "OJAD_NONE"
    parsed = parse_pitch_json(pitch_accent)
    if not parsed:
        return ""
    return f"{parsed['kana']}|{parsed['pattern']}"


def format_pitch_cell(word: str, pitch_accent: str | None, reading: str | None = None) -> str:
    w = (word or "").strip()
    parsed = parse_pitch_json(pitch_accent)
    if not parsed:
        r = (reading or "").strip()
        return f"{w}\n{r}" if r else w
    typ = pitch_type_label(parsed["pattern"])
    line2 = (
        f"{parsed['kana']}　{parsed['pattern']}／{typ}"
        if typ
        else f"{parsed['kana']}　{parsed['pattern']}"
    )
    return f"{w}\n{line2}"


def fnv1a_hex(text: str) -> str:
    """与 src/lib/jp-lesson-board-docx.ts buildJpLessonBoardDocxFingerprint 一致。"""
    h = 0x811C9DC5
    for ch in text:
        h ^= ord(ch)
        h = (h * 0x01000193) & 0xFFFFFFFF
    return f"v1-{h:08x}"


def build_fingerprint(
    *,
    ref_updated_at: str,
    content: str,
    meanings: str | None,
    pitch_digests: list[str],
) -> str:
    meanings_s = (meanings or "").strip()
    pitches = "\n".join((d or "").strip() for d in pitch_digests)
    raw = "\n---\n".join(
        [
            (ref_updated_at or "").strip(),
            (content or "").strip(),
            meanings_s,
            pitches,
        ]
    )
    return fnv1a_hex(raw)


def _row_ink_fraction(px, w: int, y: int) -> float:
    x0 = max(0, int(w * 0.04))
    x1 = min(w, int(w * 0.96))
    ink = total = 0
    for x in range(x0, x1, 2):
        r, g, b = px[x, y][:3]
        total += 1
        if not (r > 245 and g > 245 and b > 245):
            ink += 1
    return ink / total if total else 0.0


def _mean_ink(px, w: int, h: int, y0: int, y1: int) -> float:
    a = max(0, y0)
    b = min(h, y1)
    if b <= a:
        return 0.0
    return sum(_row_ink_fraction(px, w, y) for y in range(a, b)) / (b - a)


def _dark_frac(px, w: int, h: int, y0: int, y1: int) -> float:
    a = max(0, y0)
    b = min(h, y1)
    if b <= a:
        return 0.0
    x0 = max(0, int(w * 0.04))
    x1 = min(w, int(w * 0.96))
    dark = total = 0
    for y in range(a, b):
        for x in range(x0, x1, 4):
            r, g, b_ = px[x, y][:3]
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

    ink = [_row_ink_fraction(px, w, y) for y in range(h)]
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
        above = _mean_ink(px, w, h, mid - 90, mid - 8)
        below = _mean_ink(px, w, h, mid + 8, mid + 90)
        if above < 0.25 or below < 0.25:
            continue
        dark_above = _dark_frac(px, w, h, mid - 120, mid - 8)
        if mid < h * 0.28 and dark_above > 0.25:
            continue
        if splits and mid - splits[-1] < 80:
            continue
        splits.append(mid)

    if len(splits) < 1:
        return None

    if len(splits) >= 2:
        edges = [0, *splits, h]
        heights = []
        for i in range(1, len(edges)):
            if i == 1:
                continue
            heights.append(edges[i] - edges[i - 1])
        if len(heights) >= 2:
            avg = sum(heights) / len(heights)
            weird = [hh for hh in heights if hh < avg * 0.45 or hh > avg * 1.85]
            if len(weird) > len(heights) / 2:
                return None
    return splits


def card_grid_splits_to_bounds(splits: list[int], height: int) -> list[tuple[int, int]]:
    if not splits:
        return [(0, height)]
    bounds: list[tuple[int, int]] = []
    y0 = 0
    for y in splits:
        y1 = max(y0 + 1, min(height, y))
        bounds.append((y0, y1))
        y0 = y1
    if y0 < height:
        bounds.append((y0, height))
    return bounds


def group_sections_into_pages(sections: list[tuple[int, int]]) -> list[list[tuple[int, int]]]:
    """两行一块页（与 exportJpVocabRefPaginatedDocx 一致）。"""
    pages: list[list[tuple[int, int]]] = []
    i = 0
    while i < len(sections):
        pages.append(sections[i : i + 2])
        i += 2
    return pages or [[(0, 1)]]


def _png_bytes(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def build_board_docx_bytes(
    *,
    image: Image.Image,
    words: list[dict[str, Any]],
) -> bytes:
    """words: [{word, pitch_accent?, reading?}, ...] 按课 content 顺序。"""
    try:
        from docx import Document
        from docx.enum.text import WD_ALIGN_PARAGRAPH
        from docx.oxml.ns import qn
        from docx.shared import Mm, Pt
    except ImportError as exc:
        raise SystemExit(
            "需要 python-docx。请先: bash scripts/setup-jp-lesson-board-docx-mac.sh"
        ) from exc

    img = image.convert("RGB")
    w, h = img.size
    splits = detect_word_card_grid_row_splits(img)
    if splits is None:
        # 整图一页兜底
        sections = [(0, h)]
    else:
        sections = card_grid_splits_to_bounds(splits, h)

    pages = group_sections_into_pages(sections)
    surfaces = [str(x.get("word") or "").strip() for x in words]
    # 按行对齐：第 i 行对应 words[i*3 : i*3+3]
    row_words: list[list[dict[str, Any]]] = []
    for ri in range(len(sections)):
        start = ri * WORDS_PER_ROW
        row_words.append(words[start : start + WORDS_PER_ROW])

    doc = Document()
    section = doc.sections[0]
    section.top_margin = Mm(12)
    section.bottom_margin = Mm(12)
    section.left_margin = Mm(12)
    section.right_margin = Mm(12)

    usable_w_mm = 210 - 24  # A4 approx minus margins
    max_img_w = Mm(usable_w_mm)

    for page_idx, page_secs in enumerate(pages):
        if page_idx > 0:
            doc.add_page_break()
        for part_idx, (y0, y1) in enumerate(page_secs):
            if part_idx > 0:
                p = doc.add_paragraph()
                p.paragraph_format.space_before = Mm(PART_GAP_MM)
                p.paragraph_format.space_after = Mm(4)

            crop = img.crop((0, y0, w, y1))
            # 缩放：宽贴页，高按比例
            crop_w, crop_h = crop.size
            target_w_mm = usable_w_mm
            target_h_mm = target_w_mm * (crop_h / max(crop_w, 1))
            # 两行页时限制高度
            max_h_mm = 110 if len(page_secs) > 1 else 180
            if target_h_mm > max_h_mm:
                scale = max_h_mm / target_h_mm
                target_w_mm *= scale
                target_h_mm = max_h_mm

            png = _png_bytes(crop)
            p_img = doc.add_paragraph()
            p_img.alignment = WD_ALIGN_PARAGRAPH.CENTER
            run = p_img.add_run()
            run.add_picture(io.BytesIO(png), width=Mm(target_w_mm))

            # 图下读音表：与词卡列对齐
            sec_index = sections.index((y0, y1)) if (y0, y1) in sections else 0
            # 更稳：按 page 内全局 section 序号
            global_sec = 0
            for pi in range(page_idx):
                global_sec += len(pages[pi])
            global_sec += part_idx
            cells_src = row_words[global_sec] if global_sec < len(row_words) else []
            cols = max(len(cells_src), 1)
            table = doc.add_table(rows=1, cols=cols)
            table.autofit = True
            for ci in range(cols):
                cell = table.rows[0].cells[ci]
                if ci < len(cells_src):
                    item = cells_src[ci]
                    text = format_pitch_cell(
                        str(item.get("word") or ""),
                        item.get("pitch_accent"),
                        item.get("reading"),
                    )
                else:
                    text = ""
                cell.text = text
                for paragraph in cell.paragraphs:
                    paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
                    for run in paragraph.runs:
                        run.font.size = Pt(11)
                        run.font.name = "PingFang SC"
                        r = run._element
                        r.rPr.rFonts.set(qn("w:eastAsia"), "PingFang SC")

    out = io.BytesIO()
    doc.save(out)
    return out.getvalue()


def dry_run_lesson_148_fixture(fixture_path: Path, out_path: Path) -> dict[str, Any]:
    """本地 dry-run：用 fixture 图 + 假词表生成 docx。"""
    img = Image.open(fixture_path)
    # lesson-148 样例约 18 词 / 6 行（与切点一致）
    demo_words = [
        {"word": f"词{i+1}", "reading": "あ", "pitch_accent": None}
        for i in range(18)
    ]
    # 给前几个假 OJAD
    demo_words[0]["pitch_accent"] = json.dumps(
        {"kana": "こども", "pattern": "HLL", "moras": [{"c": "こ", "p": "H"}, {"c": "ど", "p": "L"}, {"c": "も", "p": "L"}]},
        ensure_ascii=False,
    )
    splits = detect_word_card_grid_row_splits(img)
    blob = build_board_docx_bytes(image=img, words=demo_words)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(blob)
    fp = build_fingerprint(
        ref_updated_at="fixture",
        content=",".join(w["word"] for w in demo_words),
        meanings=None,
        pitch_digests=[pitch_digest(w.get("pitch_accent"), None) for w in demo_words],
    )
    return {
        "ok": True,
        "splits": splits,
        "bytes": len(blob),
        "out": str(out_path),
        "fingerprint": fp,
        "sha256": hashlib.sha256(blob).hexdigest()[:16],
    }


if __name__ == "__main__":
    root = Path(__file__).resolve().parents[1]
    fixture = root / "scripts" / "fixtures" / "jp-lesson-148-word-card-grid.png"
    out = root / "tmp" / "lesson-148-board-dryrun.docx"
    if not fixture.is_file():
        raise SystemExit(f"missing fixture: {fixture}")
    info = dry_run_lesson_148_fixture(fixture, out)
    print(json.dumps(info, ensure_ascii=False, indent=2))
