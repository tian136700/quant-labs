#!/usr/bin/env python3
"""One-shot: strip「译文：/ …」and stacked「译文：」from remote D1 example_sentences."""
from __future__ import annotations

import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GLOSS_LABEL = "译文："
GLOSS_LABEL_RE = re.compile(r"^(译文|翻譯|翻译|译|譯)\s*[:：]\s*")
LEADING_INDEX_RE = re.compile(r"^\s*\d+[.、．)\]]\s*")
KANA_RE = re.compile(r"[\u3040-\u309F\u30A0-\u30FF]")
HAN_RE = re.compile(r"[\u4E00-\u9FFF]")


def format_gloss(text: str) -> str:
    body = (text or "").strip()
    for _ in range(8):
        nxt = GLOSS_LABEL_RE.sub("", body)
        nxt = re.sub(r"^[\s／/]+", "", nxt).strip()
        if nxt == body:
            break
        body = nxt
    return f"{GLOSS_LABEL}{body}" if body else ""


def is_japanese_line(text: str) -> bool:
    t = GLOSS_LABEL_RE.sub("", text).strip()
    if GLOSS_LABEL_RE.match(text.strip()):
        return False
    kana = len(KANA_RE.findall(t))
    if kana == 0:
        return False
    han = len(HAN_RE.findall(t))
    if han >= 2 and kana > 0 and han >= kana * 3:
        return False
    return True


def is_gloss_line(text: str) -> bool:
    if not text.strip():
        return False
    if GLOSS_LABEL_RE.match(text.strip()):
        return True
    if is_japanese_line(text):
        return False
    body = format_gloss(text).removeprefix(GLOSS_LABEL) if format_gloss(text) else text
    # After stripping label/slash, chinese?
    body = GLOSS_LABEL_RE.sub("", text).strip()
    body = re.sub(r"^[\s／/]+", "", body).strip()
    body = GLOSS_LABEL_RE.sub("", body).strip()
    kana = len(KANA_RE.findall(body))
    han = len(HAN_RE.findall(body))
    return han > 0 and kana == 0


def normalize_block(raw: str) -> str | None:
    lines = [
        LEADING_INDEX_RE.sub("", x).strip() for x in raw.splitlines() if x.strip()
    ]
    items: list[tuple[str, list[str]]] = []
    for line in lines:
        if items and is_gloss_line(line):
            items[-1][1].append(line)
            continue
        items.append((line, []))
    blocks: list[str] = []
    for jp, glosses in items:
        jp = jp.strip()
        if not jp:
            continue
        gloss_lines = [format_gloss(g) for g in glosses if format_gloss(g)]
        if gloss_lines:
            blocks.append(jp + "\n" + "\n".join(gloss_lines))
        else:
            blocks.append(jp)
    normalized = "\n".join(blocks)
    original = (raw or "").strip()
    return None if normalized == original else normalized


def wrangler_json(sql: str) -> list[dict]:
    proc = subprocess.run(
        [
            "npx",
            "wrangler",
            "d1",
            "execute",
            "strategy-compare-db",
            "--remote",
            "--json",
            "--command",
            sql,
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr or proc.stdout)
    payload = json.loads(proc.stdout)
    if isinstance(payload, list) and payload:
        return list(payload[0].get("results") or [])
    return []


def sql_quote(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def main() -> int:
    rows = wrangler_json(
        "SELECT id, word, example_sentences FROM jp_vocab_word "
        "WHERE example_sentences IS NOT NULL AND TRIM(example_sentences) != '' "
        "AND ("
        "example_sentences LIKE '%译文：/%' OR "
        "example_sentences LIKE '%译文：／%' OR "
        "example_sentences LIKE '%译文:/ %' OR "
        "example_sentences LIKE '%译文：译文：%'"
        ") ORDER BY id"
    )
    if not rows:
        print("No bad gloss rows found.")
        return 0

    updates: list[tuple[int, str, str]] = []
    for row in rows:
        wid = int(row["id"])
        word = str(row["word"])
        raw = str(row["example_sentences"] or "")
        next_text = normalize_block(raw)
        if not next_text:
            print(f"skip id={wid} word={word} (no change)")
            continue
        if "译文：/" in next_text or "译文：／" in next_text or "译文：译文：" in next_text:
            print(f"FAIL still dirty id={wid} word={word}", file=sys.stderr)
            return 1
        updates.append((wid, word, next_text))

    print(f"Will update {len(updates)} rows:")
    for wid, word, _ in updates:
        print(f"  - {wid} {word}")

    # Batch as one SQL file for wrangler
    stmts = [
        f"UPDATE jp_vocab_word SET example_sentences = {sql_quote(text)}, "
        f"updated_at = datetime('now') WHERE id = {wid};"
        for wid, _word, text in updates
    ]
    with tempfile.NamedTemporaryFile(
        "w", suffix=".sql", delete=False, encoding="utf-8"
    ) as fh:
        fh.write("\n".join(stmts) + "\n")
        sql_path = fh.name

    proc = subprocess.run(
        [
            "npx",
            "wrangler",
            "d1",
            "execute",
            "strategy-compare-db",
            "--remote",
            "--file",
            sql_path,
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    Path(sql_path).unlink(missing_ok=True)
    if proc.returncode != 0:
        print(proc.stderr or proc.stdout, file=sys.stderr)
        return 1
    print(proc.stdout[-500:] if len(proc.stdout) > 500 else proc.stdout)
    print(f"Updated {len(updates)} rows.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
