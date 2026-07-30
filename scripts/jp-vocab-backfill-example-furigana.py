#!/usr/bin/env python3
"""一次性 / 运维：给线上例句补「漢字(かな)」假名括注（页面转下方小字）。

依赖本机 venv：fugashi + unidic-lite（勿写进项目 requirements，仅运维机）。
  python3 -m venv /tmp/jp-furi-venv
  /tmp/jp-furi-venv/bin/pip install fugashi unidic-lite

用法：
  # 先 dry-run 扫缺假名
  /tmp/jp-furi-venv/bin/python3 scripts/jp-vocab-backfill-example-furigana.py --scan-only

  # 写回（走 fill-example-sentences allow_overwrite；校验不过的需 --sql-fallback）
  set -a && source .env.local && set +a
  /tmp/jp-furi-venv/bin/python3 scripts/jp-vocab-backfill-example-furigana.py --apply
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

GLOSS = re.compile(r"^(译文|翻譯|翻译|译|譯)\s*[:：]")
NUMBER = re.compile(r"^\s*\d+[.、．)\]]\s*")
JLPT_TAIL = re.compile(r"([。！？…])\s*[（(]\s*N\s*[1-5]\s*[）)]\s*$", re.I)
EXISTING = re.compile(
    r"([\u4E00-\u9FFF々]+[ぁ-んァ-ンヴヵヶー]*)[（(]([ぁ-んァ-ンヴヵヶー]+)[）)]"
)
HAN = re.compile(r"[\u4E00-\u9FFF々]")
KANA_RE = re.compile(r"[ぁ-んァ-ンヴヵヶー]")
KANJI_RE = re.compile(r"[\u4E00-\u9FFF々]")
SLASH_CN = re.compile(r"\s*/\s*[\u4e00-\u9fff].*$")


def kata_to_hira(s: str) -> str:
    return "".join(
        chr(ord(ch) - 0x60) if 0x30A1 <= ord(ch) <= 0x30F6 else ch for ch in s
    )


def hira_only(s: str) -> str:
    return "".join(
        ch for ch in kata_to_hira(s) if "\u3040" <= ch <= "\u309F" or ch == "ー"
    )


def split_furigana(surf: str, reading: str) -> str:
    reading = hira_only(reading)
    if not reading or not KANJI_RE.search(surf):
        return surf
    m = re.match(r"^([\u4E00-\u9FFF々]+)([ぁ-んァ-ンヴヵヶー]*)$", surf)
    if m:
        base, okuri = m.group(1), kata_to_hira(m.group(2))
        if okuri and reading.endswith(okuri) and len(reading) > len(okuri):
            return f"{base}({reading[: -len(okuri)]}){okuri}"
        return f"{surf}({reading})"
    chars = list(surf)
    n, mlen = len(chars), len(reading)
    memo: dict[tuple[int, int], list | None] = {}

    def solve(i: int, j: int):
        key = (i, j)
        if key in memo:
            return memo[key]
        if i == n:
            memo[key] = [] if j == mlen else None
            return memo[key]
        ch = chars[i]
        ch_h = kata_to_hira(ch)
        if KANA_RE.match(ch):
            if j < mlen and reading[j] == ch_h:
                rest = solve(i + 1, j + 1)
                if rest is not None:
                    memo[key] = [("kana", ch)] + rest
                    return memo[key]
            memo[key] = None
            return None
        k = i
        while k < n and KANJI_RE.match(chars[k]):
            k += 1
        kanji_run = "".join(chars[i:k])
        remain_kana = sum(1 for c in chars[k:] if KANA_RE.match(c))
        for t in range(1, mlen - j - remain_kana + 1):
            rest = solve(k, j + t)
            if rest is not None:
                memo[key] = [("ruby", kanji_run, reading[j : j + t])] + rest
                return memo[key]
        memo[key] = None
        return None

    parts = solve(0, 0)
    if parts is None:
        return f"{surf}({reading})"
    out: list[str] = []
    for p in parts:
        if p[0] == "kana":
            out.append(p[1])
        else:
            out.append(f"{p[1]}({p[2]})")
    return "".join(out)


def still_naked(line: str) -> bool:
    return bool(HAN.search(EXISTING.sub("", line)))


def annotate_line(tagger, text: str) -> str:
    text = JLPT_TAIL.sub(r"\1", text.strip())
    text = SLASH_CN.sub("", text).strip()
    slots: list[str] = []

    def prot(m: re.Match[str]) -> str:
        slots.append(m.group(0))
        return f"§{len(slots) - 1}§"

    t = EXISTING.sub(prot, text)
    out: list[str] = []
    for part in re.split(r"(§\d+§)", t):
        if not part:
            continue
        if re.fullmatch(r"§\d+§", part):
            out.append(part)
            continue
        for word in tagger(part):
            surf = str(word)
            kana = getattr(word.feature, "kana", None) or ""
            if KANJI_RE.search(surf) and kana:
                out.append(split_furigana(surf, kana))
            else:
                out.append(surf)
    s = "".join(out)
    return re.sub(r"§(\d+)§", lambda m: slots[int(m.group(1))], s)


def process_examples(tagger, raw: str) -> str:
    lines_out: list[str] = []
    for line in (raw or "").splitlines():
        s = line.strip()
        if not s:
            continue
        s = NUMBER.sub("", s)
        if GLOSS.match(s):
            gloss = GLOSS.sub("", s).strip()
            if gloss:
                lines_out.append(f"译文：{gloss}")
            continue
        if HAN.search(s) and not re.search(r"[ぁ-んァ-ン]", s):
            continue
        lines_out.append(annotate_line(tagger, s))
    return "\n".join(lines_out)


def jp_lines_incomplete(raw: str) -> bool:
    for line in (raw or "").splitlines():
        s = NUMBER.sub("", line.strip())
        if not s or GLOSS.match(s):
            continue
        if still_naked(s):
            return True
    return False


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--scan-only", action="store_true")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument(
        "--api-url",
        default="https://japanese.info-quests.com/api/jp-vocab/fill-example-sentences",
    )
    ap.add_argument("--dump", default="/tmp/jp_ex.json", help="wrangler --json dump path")
    args = ap.parse_args()

    if not Path(args.dump).exists():
        print(
            "先导出例句：\n"
            "  npx wrangler d1 execute strategy-compare-db --remote --json \\\n"
            "    --command \"SELECT id, word, kind, example_sentences FROM jp_vocab_word "
            "WHERE example_sentences IS NOT NULL AND TRIM(example_sentences) != ''\" "
            f"> {args.dump}",
            file=sys.stderr,
        )
        return 2

    try:
        from fugashi import Tagger
    except ImportError:
        print("需要 fugashi：见脚本顶部 venv 安装说明", file=sys.stderr)
        return 2

    tagger = Tagger()
    rows = json.loads(Path(args.dump).read_text())[0]["results"]
    incomplete = [r for r in rows if jp_lines_incomplete(r.get("example_sentences") or "")]
    print(f"with_examples={len(rows)} incomplete={len(incomplete)}")
    if args.scan_only or not args.apply:
        for r in incomplete[:30]:
            print(f"  id={r['id']} [{r['kind']}] {r['word']}")
        if len(incomplete) > 30:
            print(f"  … +{len(incomplete) - 30} more")
        return 0 if not args.apply else 0

    token = os.environ.get("JP_REVIEW_UPLOAD_TOKEN", "").strip()
    if not token:
        print("需要 JP_REVIEW_UPLOAD_TOKEN", file=sys.stderr)
        return 2

    updates = []
    for r in incomplete:
        new = process_examples(tagger, r["example_sentences"])
        if not new.strip() or any(
            still_naked(NUMBER.sub("", ln))
            for ln in new.splitlines()
            if ln.strip() and not GLOSS.match(ln)
        ):
            print(f"skip annotate fail id={r['id']} {r['word']}", file=sys.stderr)
            continue
        updates.append(
            {
                "word_id": r["id"],
                "example_sentences": new,
            }
        )

    def post(payload: dict) -> dict:
        req = urllib.request.Request(
            args.api_url,
            data=json.dumps(payload).encode(),
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
                "User-Agent": "jp-vocab-furigana-backfill/1.0",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=180) as resp:
            return json.loads(resp.read().decode())

    updated = 0
    skipped: list = []
    chunks = [updates[i : i + 40] for i in range(0, len(updates), 40)]
    for ci, chunk in enumerate(chunks):
        if ci:
            time.sleep(5.2)
        data = post(
            {
                "mode": "apply",
                "allow_overwrite": True,
                "source": "Agent现写",
                "updates": chunk,
            }
        )
        updated += int(data.get("updated") or 0)
        skipped.extend(data.get("skipped") or [])
        print(f"chunk {ci + 1}/{len(chunks)} updated={data.get('updated')} skipped={len(data.get('skipped') or [])}")

    print(f"done updated={updated} skipped={len(skipped)}")
    if skipped:
        Path("/tmp/jp_ex_furigana_skipped.json").write_text(
            json.dumps(skipped, ensure_ascii=False, indent=2)
        )
        print("skipped → /tmp/jp_ex_furigana_skipped.json（条数校验等拦下时需 D1 SQL 兜底）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
