#!/usr/bin/env python3
"""Regression: board docx fixture dry-run + fingerprint helper present."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VENV_PY = ROOT / "scripts" / ".venv-board-docx" / "bin" / "python"
API = ROOT / "scripts" / "jp-lesson-board-docx-api.py"
BUILD = ROOT / "scripts" / "lib" / "jp_lesson_board_docx_build.py"
ROUTE = ROOT / "src" / "app" / "api" / "jp-lesson" / "board-docx" / "route.ts"
DOC = ROOT / "docs" / "jp-lesson-board-docx-api.txt"
STAGE = ROOT / "scripts" / "jp-lesson-board-docx-stage.sh"
SETUP = ROOT / "scripts" / "setup-jp-lesson-board-docx-mac.sh"
MENU = ROOT / "src" / "components" / "JpVocabRefDownloadMenu.tsx"


def main() -> int:
    for p in (API, BUILD, ROUTE, DOC, STAGE, SETUP, MENU):
        if not p.is_file():
            raise SystemExit(f"FAIL: missing {p.relative_to(ROOT)}")

    menu = MENU.read_text(encoding="utf-8")
    if "board-docx?lesson_id=" not in menu:
        raise SystemExit("FAIL: download menu must keep board-docx URL for when pitch re-enabled")
    if "JP_LESSON_BOARD_DOCX_PITCH_ENABLED" not in menu:
        raise SystemExit("FAIL: download menu must expose JP_LESSON_BOARD_DOCX_PITCH_ENABLED flag")
    if "读音版生成中" not in menu:
        raise SystemExit("FAIL: download menu must keep pitch fallback hint for re-enable")
    # 用户暂缓读音版：开关须为 false，菜单勿再标「含读音」为主路径
    if "JP_LESSON_BOARD_DOCX_PITCH_ENABLED = false" not in menu and "JP_LESSON_BOARD_DOCX_PITCH_ENABLED=false" not in menu:
        raise SystemExit("FAIL: pitch board-docx must stay paused (ENABLED = false) until user asks")
    if 'jp-ref-download-item-title">分页 Word（含读音）' in menu:
        raise SystemExit("FAIL: while pitch paused, menu must not title Word as 含读音")
    if "每页两行单词，中间约 1/3 页空白供板书" not in menu:
        raise SystemExit("FAIL: Word menu desc must mention 每页两行 + 1/3 空白")

    stage = STAGE.read_text(encoding="utf-8")
    if "vocab_fill_assert_quiz_gate_ok" not in stage:
        raise SystemExit("FAIL: stage must call quiz gate")

    sys.path.insert(0, str(ROOT / "scripts"))
    from maintenance_center.cron_tasks.registry import CRON_TASKS

    task = next((t for t in CRON_TASKS if t.id == "jp-lesson-board-docx"), None)
    if task is None:
        raise SystemExit("FAIL: registry missing jp-lesson-board-docx")
    if "音调" not in task.fill_content:
        raise SystemExit("FAIL: fill_content must include 音调")

    py = str(VENV_PY if VENV_PY.is_file() else Path(sys.executable))
    proc = subprocess.run(
        [py, str(API), "--fixture-dry-run"],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        raise SystemExit(f"FAIL fixture dry-run: {proc.stderr or proc.stdout}")
    text = proc.stdout.strip()
    try:
        info = json.loads(text)
    except json.JSONDecodeError:
        # tolerate trailing logs: find outermost object
        start = text.find("{")
        end = text.rfind("}")
        if start < 0 or end <= start:
            raise SystemExit(f"FAIL: no JSON from dry-run: {text[:400]}")
        info = json.loads(text[start : end + 1])
    if not info.get("ok"):
        raise SystemExit(f"FAIL: dry-run not ok: {info}")
    splits = info.get("splits") or []
    if splits != [381, 630, 870, 1095, 1295]:
        raise SystemExit(f"FAIL: unexpected splits {splits}")
    if not str(info.get("format") or "").startswith("pitch-overline"):
        raise SystemExit(f"FAIL: expected pitch-overline format, got {info.get('format')}")
    if not str(info.get("fingerprint") or "").startswith("v2-"):
        raise SystemExit(f"FAIL: fingerprint must be v2- for overline rebuild, got {info.get('fingerprint')}")
    # 禁止旧版 NLLL／头高 文案路径残留
    build = BUILD.read_text(encoding="utf-8")
    if "头高" in build and "pitch_type_label" in build:
        raise SystemExit("FAIL: board docx must not use 头高/NLLL text labels anymore")
    if "render_ojad_pitch_reading_png" not in build:
        raise SystemExit("FAIL: missing OJAD overline PNG renderer")
    if "to_hiragana" not in build:
        raise SystemExit("FAIL: board docx must convert kanji to hiragana")
    if "pitch-overline-v7" not in build:
        raise SystemExit("FAIL: format version must be pitch-overline-v7")
    if "PART_GAP_MM = 99" not in build:
        raise SystemExit("FAIL: board docx PART_GAP_MM must be 99 (~1/3 A4)")
    if 'BOARD_PITCH_NOT_FOUND_LABEL = ""' not in build and "BOARD_PITCH_NOT_FOUND_LABEL = ''" not in build:
        raise SystemExit("FAIL: not-found pitch label must be blank")
    if "暂时没有在词典里面查到该词" in build:
        raise SystemExit("FAIL: must not show not-found tip text anymore")
    ts = (ROOT / "src" / "lib" / "jp-lesson-board-docx.ts").read_text(encoding="utf-8")
    if "pitch-overline-v7" not in ts:
        raise SystemExit("FAIL: TS format version must match Python v7")
    if 'JP_LESSON_BOARD_PITCH_NOT_FOUND_LABEL = ""' not in ts:
        raise SystemExit("FAIL: TS not-found label must be blank")
    if "暂时没有在词典里面查到该词" in ts:
        raise SystemExit("FAIL: TS must not keep not-found tip text")
    setup = SETUP.read_text(encoding="utf-8")
    if "pykakasi" not in setup:
        raise SystemExit("FAIL: setup must install pykakasi")
    api = API.read_text(encoding="utf-8")
    if "OJAD reject mismatch" not in api:
        raise SystemExit("FAIL: board cron must reject OJAD kana mismatch")

    # 连续横线 + 假名转换：必须用 board venv（含 pykakasi）
    check_py = f"""
import io, json, sys
sys.path.insert(0, {str(ROOT / "scripts" / "lib")!r})
from jp_lesson_board_docx_build import render_ojad_pitch_reading_png, to_hiragana
from PIL import Image

if to_hiragana("お元気で") != "おげんきで":
    raise SystemExit(f"FAIL: to_hiragana お元気で got {{to_hiragana('お元気で')!r}}")
if to_hiragana("お気をつけて") != "おきをつけて":
    raise SystemExit(
        f"FAIL: to_hiragana お気をつけて got {{to_hiragana('お気をつけて')!r}}"
    )

multi_h = json.dumps(
    {{
        "kana": "おきにいり",
        "pattern": "LHHHH",
        "moras": [
            {{"c": "お", "p": "L"}},
            {{"c": "き", "p": "H"}},
            {{"c": "に", "p": "H"}},
            {{"c": "い", "p": "H"}},
            {{"c": "り", "p": "H"}},
        ],
    }},
    ensure_ascii=False,
)
png = render_ojad_pitch_reading_png(multi_h, reading="おきにいり", word="おきにいり")
if not png:
    raise SystemExit("FAIL: expected pitch PNG for LHHHH")
img = Image.open(io.BytesIO(png)).convert("RGB")
w, h = img.size
bar_row = None
for y in range(min(h, 20)):
    row = [img.getpixel((x, y)) for x in range(w)]
    dark = [i for i, px in enumerate(row) if px[0] < 80 and px[1] < 80 and px[2] < 80]
    if len(dark) >= 8:
        bar_row = dark
        break
if not bar_row:
    raise SystemExit("FAIL: no continuous dark bar row found in pitch PNG")
gaps = 0
for a, b in zip(bar_row, bar_row[1:]):
    if b - a > 2:
        gaps += 1
if gaps > 0:
    raise SystemExit(f"FAIL: pitch overline fragmented gaps={{gaps}} dark_xs={{bar_row[:20]}}")
print("ok-render")
"""
    proc2 = subprocess.run(
        [py, "-c", check_py],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        check=False,
    )
    if proc2.returncode != 0:
        raise SystemExit(f"FAIL render checks: {proc2.stderr or proc2.stdout}")

    print("ok: jp-lesson-board-docx")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
