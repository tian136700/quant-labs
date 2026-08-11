#!/usr/bin/env python3
"""扫 / 修日语例句：助词左右与相邻词粘连（はいくら / は高い / 料金は…）。

展示层 sanitize 也会自动插空格；本脚本用于把**线上存库**一并修好（复制/导出也正确）。

用法：
  # 只扫本地 D1（默认）
  python3 scripts/jp-vocab-fix-example-particle-spaces.py --scan

  # 扫完后经 API apply 写回线上（Agent / 运维）
  python3 scripts/jp-vocab-fix-example-particle-spaces.py --apply-remote

鉴权：Bearer $JP_REVIEW_UPLOAD_TOKEN（~/.config/info-quests/jp-review-sync.env）
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

LEARNER_KANA = sorted(
    [
        "いつも",
        "いつ",
        "いくら",
        "いくつ",
        "いかが",
        "どうして",
        "どうやって",
        "どんな",
        "どこ",
        "どれ",
        "どちら",
        "どっち",
        "どの",
        "どう",
        "だれ",
        "どなた",
        "なにか",
        "なに",
        "なんの",
        "なんで",
        "なぜ",
        "とても",
        "あまり",
        "すこし",
        "ちょっと",
        "たくさん",
        "みんな",
        "いろいろ",
        "ほんとうに",
        "はっきり",
        "ゆっくり",
        "ちゃんと",
        "ください",
        "たぶん",
        "きっと",
        "ぜひ",
        "やはり",
        "やっぱり",
        "かなり",
        "もっと",
        "ずっと",
        "もう",
        "まだ",
        "すぐ",
        "よく",
        "ここ",
        "そこ",
        "あそこ",
        "こちら",
        "そちら",
        "あちら",
        "こんなに",
        "そんなに",
        "あんなに",
        "こんな",
        "そんな",
        "あんな",
        "あります",
        "いません",
        "います",
        "ある",
        "いる",
    ],
    key=len,
    reverse=True,
)
# 假名词白名单含「も」；内容两侧不含「も」（防拆いつも）
PARTICLE_LEARNER = "はがをにでともへのや"
PARTICLE_CONTENT = "はがをにでへとのや"
PARTICLE_RE = re.compile(
    rf"([{PARTICLE_LEARNER}])({'|'.join(map(re.escape, LEARNER_KANA))})"
)
KATA_WORD = r"[ァ-ンヴヵヶ][ァ-ンヴヵヶー]*"
CONTENT_BEFORE_PARTICLE_RE = re.compile(
    rf"(\x00P\d+\x00|[\u4E00-\u9FFF々]+|{KATA_WORD})([{PARTICLE_CONTENT}])"
)
PARTICLE_BEFORE_CONTENT_RE = re.compile(
    rf"([{PARTICLE_CONTENT}])(\x00P\d+\x00|[\u4E00-\u9FFF々]+|{KATA_WORD})"
)
DE_COPULA_RE = re.compile(r"^(す|した|しょう|ござ|あり|ある|あっ|は|も)")
# Mirror VALID_KANJI_FURIGANA_CHUNK（勿吃助词；勿拆读音）
FURI_RE = re.compile(
    r"[\u4E00-\u9FFF々]+"
    r"(?:(?![はがをにでとへもやの])[ぁ-んァ-ンヴヵヶー]+[\u4E00-\u9FFF々]+)*"
    r"[ぁ-んァ-ンヴヵヶー]*"
    r"[（(][ぁ-んァ-ンヴヵヶー]+[）)]"
)
GLOSS_RE = re.compile(r"^(译文|訳文|翻譯|翻译)\s*[:：]")


def insert_particle_spaces(line: str) -> str:
    """与 TS insertJpVocabLearnerParticleSpaces 对齐：先保护假名括注。"""
    protected: list[str] = []

    def protect(m: re.Match[str]) -> str:
        protected.append(m.group(0))
        return f"\x00P{len(protected) - 1}\x00"

    work = FURI_RE.sub(protect, line)

    def ga_okurigana(after: str) -> bool:
        if not after:
            return False
        if after.startswith("\x00P"):
            return False
        if re.match(r"^[\u4E00-\u9FFF々ァ-ンヴヵヶ]", after):
            return False
        for w in LEARNER_KANA:
            if after.startswith(w):
                return False
        return bool(re.match(r"^[ぁ-ん]", after))

    def left_repl(m: re.Match[str]) -> str:
        left, particle = m.group(1), m.group(2)
        after = work[m.end() :]
        if particle == "で" and DE_COPULA_RE.match(after):
            return m.group(0)
        if particle == "が" and ga_okurigana(after):
            return m.group(0)
        return f"{left} {particle}"

    work = CONTENT_BEFORE_PARTICLE_RE.sub(left_repl, work)

    def right_content_repl(m: re.Match[str]) -> str:
        particle, right = m.group(1), m.group(2)
        if particle == "で":
            after = work[m.start() + len(particle) :]
            if DE_COPULA_RE.match(after):
                return m.group(0)
        return f"{particle} {right}"

    work = PARTICLE_BEFORE_CONTENT_RE.sub(right_content_repl, work)

    def learner_repl(m: re.Match[str]) -> str:
        particle, word = m.group(1), m.group(2)
        if word == "ください" and particle == "で":
            prev = work[m.start() - 1] if m.start() > 0 else ""
            if prev in "なんいてり":
                return m.group(0)
        return f"{particle} {word}"

    work = PARTICLE_RE.sub(learner_repl, work)

    def restore(m: re.Match[str]) -> str:
        i = int(m.group(1))
        return protected[i] if 0 <= i < len(protected) else ""

    return re.sub(r"\x00P(\d+)\x00", restore, work)


def find_local_db() -> Path:
    paths = sorted(
        (ROOT / ".wrangler/state/v3/d1/miniflare-D1DatabaseObject").glob("*.sqlite"),
        key=lambda p: p.stat().st_size,
        reverse=True,
    )
    if not paths:
        raise SystemExit("本地 D1 sqlite 未找到；先 npm run db:sync-remote-to-local")
    return paths[0]


def collect_updates(db: Path) -> list[dict]:
    con = sqlite3.connect(str(db))
    rows = con.execute(
        "SELECT id, word, example_sentences FROM jp_vocab_word "
        "WHERE example_sentences IS NOT NULL AND TRIM(example_sentences) != ''"
    ).fetchall()
    updates: list[dict] = []
    for wid, word, ex in rows:
        new_lines: list[str] = []
        changed = False
        for line in str(ex).splitlines():
            if GLOSS_RE.match(line.strip()):
                new_lines.append(line)
                continue
            nxt = insert_particle_spaces(line)
            # collapse like sanitize
            nxt2 = re.sub(r"\s{2,}", " ", nxt).strip() if nxt != line else nxt
            if nxt2 != line:
                changed = True
            new_lines.append(nxt2 if nxt != line else line)
        if changed:
            updates.append(
                {
                    "word_id": wid,
                    "word": word,
                    "example_sentences": "\n".join(new_lines),
                    "source": "Agent现写",
                }
            )
    return updates


def load_token() -> str:
    token = os.environ.get("JP_REVIEW_UPLOAD_TOKEN", "").strip()
    if token:
        return token
    cfg = Path.home() / ".config/info-quests/jp-review-sync.env"
    if cfg.is_file():
        for line in cfg.read_text(encoding="utf-8").splitlines():
            if line.startswith("JP_REVIEW_UPLOAD_TOKEN="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("缺少 JP_REVIEW_UPLOAD_TOKEN")


def apply_remote(updates: list[dict], *, batch_size: int = 3) -> None:
    token = load_token()
    ok_ids: list[int] = []
    fail: list[int] = []
    for i in range(0, len(updates), batch_size):
        batch = updates[i : i + batch_size]
        ids = [u["word_id"] for u in batch]
        print(f"batch {i // batch_size + 1}: {ids}", flush=True)
        body = {
            "mode": "apply",
            "source": "Agent现写",
            "allow_overwrite": True,
            "validate_format": False,
            "updates": [
                {
                    "word_id": u["word_id"],
                    "example_sentences": u["example_sentences"],
                    "source": "Agent现写",
                }
                for u in batch
            ],
        }
        with tempfile.NamedTemporaryFile(
            "w", suffix=".json", delete=False, encoding="utf-8"
        ) as f:
            json.dump(body, f, ensure_ascii=False)
            path = f.name
        cmd = [
            "curl",
            "-sS",
            "-X",
            "POST",
            "https://finance.info-quests.com/api/jp-vocab/fill-example-sentences",
            "-H",
            f"Authorization: Bearer {token}",
            "-H",
            "Content-Type: application/json",
            "-H",
            "User-Agent: jp-vocab-fix-example-particle-spaces/2.0",
            "--data-binary",
            f"@{path}",
        ]
        data: dict | None = None
        for attempt in range(1, 8):
            try:
                out = subprocess.check_output(cmd, text=True)
                data = json.loads(out)
            except Exception as e:
                print("  err", e)
                data = None
            if data and data.get("ok"):
                break
            err = str((data or {}).get("error") or "")
            if data and "rate" in err.lower():
                wait = 12 * attempt
                print(f"  rate_limited, sleep {wait}s (attempt {attempt})")
                time.sleep(wait)
                continue
            break
        if not data or not data.get("ok"):
            print("  FAIL", (data or {}).get("error"), str((data or {}).get("rejected"))[:300])
            fail.extend(ids)
            time.sleep(3)
            continue
        applied = [a.get("id") for a in (data.get("applied") or [])]
        print(f"  updated={data.get('updated')} applied={applied}")
        ok_ids.extend(applied)
        time.sleep(4)
    print(f"DONE ok={len(ok_ids)} fail={fail}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--scan", action="store_true", help="只扫描本地 D1")
    ap.add_argument("--apply-remote", action="store_true", help="扫完写回线上")
    ap.add_argument("--limit", type=int, default=0, help="最多处理 N 条（0=全部）")
    args = ap.parse_args()
    if not args.scan and not args.apply_remote:
        args.scan = True

    db = find_local_db()
    updates = collect_updates(db)
    if args.limit and args.limit > 0:
        updates = updates[: args.limit]
    print(f"db={db.name} stuck_or_unspaced={len(updates)}")
    for u in updates[:30]:
        first = next(
            (
                ln
                for ln in u["example_sentences"].splitlines()
                if not GLOSS_RE.match(ln.strip())
            ),
            "",
        )
        print(f"  id={u['word_id']} {u['word']}: {first[:80]}")
    if len(updates) > 30:
        print(f"  … +{len(updates) - 30} more")

    if args.apply_remote:
        if not updates:
            print("nothing to apply")
            return 0
        apply_remote(updates)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
