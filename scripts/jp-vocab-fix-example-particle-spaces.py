#!/usr/bin/env python3
"""扫 / 修日语例句：助词与常见假名词粘连（はいつ / はとても / はどこ…）。

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
        "どこ",
        "だれ",
        "どなた",
        "なにか",
        "なに",
        "なんの",
        "なんで",
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
        "もう",
        "まだ",
        "すぐ",
        "よく",
    ],
    key=len,
    reverse=True,
)
PARTICLE_RE = re.compile(
    rf"([はがをにでともへのや])({'|'.join(map(re.escape, LEARNER_KANA))})"
)
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

    def repl(m: re.Match[str]) -> str:
        particle, word = m.group(1), m.group(2)
        if word == "ください" and particle == "で":
            prev = work[m.start() - 1] if m.start() > 0 else ""
            if prev in "なんいてり":
                return m.group(0)
        return f"{particle} {word}"

    work = PARTICLE_RE.sub(repl, work)

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
            if nxt != line:
                changed = True
            new_lines.append(nxt)
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


def apply_remote(updates: list[dict], *, batch_size: int = 5) -> int:
    token = load_token()
    api = os.environ.get(
        "JP_VOCAB_FILL_EXAMPLE_SENTENCES_URL",
        "https://finance.info-quests.com/api/jp-vocab/fill-example-sentences",
    ).strip()
    ok_n = 0
    for i in range(0, len(updates), batch_size):
        batch = [
            {
                "word_id": u["word_id"],
                "example_sentences": u["example_sentences"],
                "source": "Agent现写",
            }
            for u in updates[i : i + batch_size]
        ]
        ids = [u["word_id"] for u in updates[i : i + batch_size]]
        print(f"batch {i // batch_size + 1}: {ids}", flush=True)
        body = {
            "mode": "apply",
            "source": "Agent现写",
            "allow_overwrite": True,
            "validate_format": False,
            "updates": batch,
        }
        with tempfile.NamedTemporaryFile(
            "w", suffix=".json", delete=False, encoding="utf-8"
        ) as f:
            json.dump(body, f, ensure_ascii=False)
            path = f.name
        for attempt in range(1, 6):
            proc = subprocess.run(
                [
                    "curl",
                    "-sS",
                    "-X",
                    "POST",
                    api,
                    "-H",
                    f"Authorization: Bearer {token}",
                    "-H",
                    "Content-Type: application/json",
                    "-H",
                    "User-Agent: jp-vocab-fix-example-particle-spaces/1.0",
                    "--data-binary",
                    f"@{path}",
                ],
                check=False,
                capture_output=True,
                text=True,
            )
            try:
                data = json.loads(proc.stdout or "{}")
            except json.JSONDecodeError:
                data = {"ok": False, "error": proc.stdout[:300]}
            if data.get("ok"):
                applied = [a.get("id") for a in (data.get("applied") or [])]
                skipped = data.get("skipped") or []
                print(f"  updated={data.get('updated')} applied={applied} skipped={skipped}")
                ok_n += int(data.get("updated") or 0)
                break
            if data.get("error") == "rate_limited" or proc.returncode != 0:
                wait = float(data.get("retry_after_sec") or 3) * attempt
                print(f"  rate/err, sleep {wait}s ({data.get('error')})")
                time.sleep(wait)
                continue
            print(f"  FAIL {data}")
            break
        time.sleep(3)
    return ok_n


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--scan", action="store_true", help="只扫本地库并打印")
    ap.add_argument("--apply-remote", action="store_true", help="扫完后 apply 写回线上")
    ap.add_argument("--json-out", type=Path, help="把 updates 写到文件")
    args = ap.parse_args()
    if not args.scan and not args.apply_remote:
        args.scan = True

    db = find_local_db()
    updates = collect_updates(db)
    print(f"db={db.name} stuck_words={len(updates)}")
    for u in updates[:40]:
        head = u["example_sentences"].splitlines()[0][:90]
        print(f"  {u['word_id']}|{u['word']}|{head}")
    if len(updates) > 40:
        print(f"  … +{len(updates) - 40} more")

    if args.json_out:
        args.json_out.write_text(
            json.dumps(updates, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(f"wrote {args.json_out}")

    if args.apply_remote:
        if not updates:
            print("nothing to apply")
            return 0
        n = apply_remote(updates)
        print(f"DONE applied_rows≈{n}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
