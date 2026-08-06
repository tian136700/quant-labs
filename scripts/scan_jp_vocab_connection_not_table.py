#!/usr/bin/env python3
"""扫本地 D1：语法词条有接续但无法拆成「词类＋接什么」表行的列表。

用法：
  python3 scripts/scan_jp_vocab_connection_not_table.py
  python3 scripts/scan_jp_vocab_connection_not_table.py --limit 20
  python3 scripts/scan_jp_vocab_connection_not_table.py --check   # 有嫌疑则 exit 1

约定见 .cursor/rules/jp-vocab-connection-table-always.mdc（用法条数保留；接续一律表）。
"""
from __future__ import annotations

import argparse
import re
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
D1_DIR = ROOT / ".wrangler" / "state" / "v3" / "d1" / "miniflare-D1DatabaseObject"

PLUS_SEG_RE = re.compile(r"^(.+?)([＋+].+)$")
USAGE_TAG_RE = re.compile(r"^用法\s*\d+\s*[：:]")
COLON_ROW_RE = re.compile(r"^(.+?)[：:]\s*(.+)$")


def local_sqlite() -> Path:
    cands = [p for p in D1_DIR.glob("*.sqlite") if p.name != "metadata.sqlite"]
    if len(cands) != 1:
        raise SystemExit(f"找不到唯一本地 D1：{cands}")
    return cands[0]


def split_semi(text: str) -> list[str]:
    parts: list[str] = []
    depth = 0
    buf = ""
    for ch in text:
        if ch in "（(":
            depth += 1
        elif ch in "）)":
            depth = max(0, depth - 1)
        if depth == 0 and ch in "；;":
            t = buf.strip()
            if t:
                parts.append(t)
            buf = ""
            continue
        buf += ch
    last = buf.strip()
    if last:
        parts.append(last)
    return parts


def can_table(connection: str) -> bool:
    """近似 parseJpVocabConnectionTableRows：有「词类＋…」或「词类：…」可上表。"""
    text = (connection or "").strip()
    if not text:
        return False
    # 剥用法标签行，看正文
    bodies: list[str] = []
    for line in text.replace("\r\n", "\n").split("\n"):
        t = line.strip()
        if not t:
            continue
        m = USAGE_TAG_RE.match(t)
        if m:
            rest = t[m.end() :].strip()
            if rest:
                bodies.append(rest)
            continue
        bodies.append(t)
    flat = "；".join(bodies)
    if not flat:
        return False
    segs = split_semi(flat) if ("；" in flat or ";" in flat) else [flat]
    ok = 0
    for seg in segs:
        s = seg.strip()
        if not s:
            continue
        if PLUS_SEG_RE.match(s):
            ok += 1
            continue
        cm = COLON_ROW_RE.match(s)
        if cm and ("＋" in cm.group(2) or "+" in cm.group(2)):
            ok += 1
            continue
        return False
    return ok >= 1


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()

    db = local_sqlite()
    con = sqlite3.connect(str(db))
    rows = con.execute(
        """
        SELECT id, word, connection
        FROM jp_vocab_word
        WHERE kind = 'grammar'
          AND connection IS NOT NULL
          AND TRIM(connection) != ''
        ORDER BY id
        """
    ).fetchall()
    bad: list[tuple[int, str, str]] = []
    for wid, word, conn in rows:
        if can_table(str(conn or "")):
            continue
        bad.append((int(wid), str(word), str(conn or "").replace("\n", " ")[:100]))

    print(f"[scan] grammar_with_connection={len(rows)} not_table={len(bad)} db={db.name}")
    show = bad if args.limit <= 0 else bad[: args.limit]
    for wid, word, head in show:
        print(f"  {wid}\t{word}\t{head}")
    if args.limit > 0 and len(bad) > args.limit:
        print(f"  … 另有 {len(bad) - args.limit} 条")

    if args.check and bad:
        print(
            "[scan] FAIL: 有接续无法上表；请改成「词类＋接什么｜说明」（见 jp-vocab-connection-table-always）",
            file=sys.stderr,
        )
        return 1
    print("[scan] OK" if not bad else "[scan] listed (not --check)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
