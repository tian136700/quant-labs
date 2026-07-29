#!/usr/bin/env python3
"""Normalize remote jp_vocab_word.connection for inline 用法N + 辞书形注解.

Uses the same rules as src/lib/jp-vocab-connection-ai.ts normalize.
Writes SQL via wrangler d1 execute --remote.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

DONGCI_RE = re.compile(
    r"(?:动词辞书形|動詞辞書形)(?:（动词原形）|\(动词原形\))?"
)


def format_jishokei(s: str) -> str:
    def repl(m: re.Match[str]) -> str:
        return "動詞辞書形（动词原形）" if m.group(0).startswith("動") else "动词辞书形（动词原形）"

    return DONGCI_RE.sub(repl, s)


def expand_breaks(raw: str) -> str:
    t = raw.replace("\r\n", "\n")
    t = re.sub(r"([^\n])\s*(?=用法\s*\d+\s*[：:])", r"\1\n", t)
    t = re.sub(r"([^\n])\s*(?=(?:否定形|肯定形)\s*[：:])", r"\1\n", t)
    return t


def normalize(raw: str) -> str:
    lines = []
    for line in expand_breaks(raw).split("\n"):
        t = line.strip()
        if not t or t == "【接序】" or re.match(r"^```", t):
            continue
        lines.append(format_jishokei(t))
    return "\n".join(lines)


# 手调：【用法N·…】→ 用法N: …（展示可配对）
MANUAL: dict[int, str] = {
    441: "用法1: 動詞辞書形（动词原形）＋ことがある\n用法2: 動詞た形＋ことがある\n否定形: ことがない／ことはない",
    436: "动词辞书形（动词原形）＋前に\n名词＋の前に",
    455: (
        "用法1: 动词ます形去ます＋そうだ（样态；い形容词去い＋そうだ；な形容词词干＋そうだ；"
        "いい→よさそうだ，ない→なさそうだ）\n"
        "用法2: 普通形＋そうだ（传闻；な形容词/名词现在肯定为词干＋だ＋そうだ）"
    ),
    435: (
        "普通形（动词/形容词/名词＋だ）＋と言う（用法1～4共通）。"
        "引用可用「」；名词・な形容词词干可直接接「と言う」。"
        "常见变体：と言っていた／と言われている"
    ),
}


def sql_escape(s: str) -> str:
    return s.replace("'", "''")


def wrangler_json(sql: str) -> list:
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
        print(proc.stderr or proc.stdout, file=sys.stderr)
        raise SystemExit(proc.returncode or 1)
    data = json.loads(proc.stdout)
    if isinstance(data, list) and data:
        return data[0].get("results") or []
    return []


def main() -> None:
    rows = wrangler_json(
        "SELECT id, word, connection FROM jp_vocab_word "
        "WHERE kind = 'grammar' AND connection IS NOT NULL AND TRIM(connection) != ''"
    )
    updates: list[tuple[int, str, str, str]] = []
    for row in rows:
        wid = int(row["id"])
        word = str(row["word"])
        old = str(row["connection"] or "")
        if wid in MANUAL:
            new = MANUAL[wid]
        else:
            new = normalize(old)
        if new != old:
            updates.append((wid, word, old, new))

    if not updates:
        print("OK: no connection rows need update")
        return

    print(f"Will update {len(updates)} rows:")
    for wid, word, old, new in updates:
        print(f"--- id={wid} {word}")
        print(f"OLD: {old!r}")
        print(f"NEW: {new!r}")

    # batch as one SQL script with multiple statements
    stmts = []
    for wid, _word, _old, new in updates:
        stmts.append(
            f"UPDATE jp_vocab_word SET connection = '{sql_escape(new)}', "
            f"updated_at = datetime('now') WHERE id = {wid};"
        )
    sql = "\n".join(stmts)
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
        print(proc.stderr or proc.stdout, file=sys.stderr)
        # fallback: one by one
        print("batch failed; trying one-by-one…", file=sys.stderr)
        for wid, _word, _old, new in updates:
            one = (
                f"UPDATE jp_vocab_word SET connection = '{sql_escape(new)}', "
                f"updated_at = datetime('now') WHERE id = {wid}"
            )
            wrangler_json(one)
            print(f"OK updated id={wid}")
    else:
        print(proc.stdout)
        print(f"OK: updated {len(updates)} remote connection rows")


if __name__ == "__main__":
    main()
