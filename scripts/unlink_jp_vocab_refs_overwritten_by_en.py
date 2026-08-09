#!/usr/bin/env python3
"""卸掉被英语教案盖掉的日语抽问/新课教案关联（点不进，总比打开英语图好）。

判定：jp_vocab_ref 与 en_vocab_ref 曾共用同名 ref_key，且日语仍挂 vocab-ref/、
英语已在 en-vocab-ref/（或历史上同 r2_key）。对这些 key：
  - jp_vocab_word.ref_key → NULL
  - jp_lesson.ref_key → NULL
  - 删除 jp_vocab_ref 行
  - 删除 R2 上 vocab-ref/{key}.* 脏文件（里面是英语图）

用法：
  python3 scripts/unlink_jp_vocab_refs_overwritten_by_en.py --remote --dry-run
  python3 scripts/unlink_jp_vocab_refs_overwritten_by_en.py --remote
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB = "strategy-compare-db"
BUCKET = "jp-review"


def run(cmd: list[str], *, check: bool = True) -> subprocess.CompletedProcess[str]:
    proc = subprocess.run(cmd, cwd=ROOT, text=True, capture_output=True)
    if check and proc.returncode != 0:
        raise RuntimeError((proc.stderr or proc.stdout or "fail").strip())
    return proc


def d1_json(remote: bool, sql: str) -> list:
    cmd = [
        "npx",
        "wrangler",
        "d1",
        "execute",
        DB,
        "--command",
        sql,
        "--json",
        "-y",
    ]
    cmd.append("--remote" if remote else "--local")
    proc = run(cmd)
    text = proc.stdout.strip()
    start = text.find("[")
    if start < 0:
        raise RuntimeError(text[:500])
    return json.loads(text[start:])


def d1_rows(remote: bool, sql: str) -> list[dict]:
    payload = d1_json(remote, sql)
    if not payload:
        return []
    return list(payload[0].get("results") or [])


def r2_delete(remote: bool, key: str) -> None:
    cmd = ["npx", "wrangler", "r2", "object", "delete", f"{BUCKET}/{key}"]
    cmd.append("--remote" if remote else "--local")
    # delete 不存在时 wrangler 可能非 0；允许
    proc = run(cmd, check=False)
    if proc.returncode != 0:
        err = (proc.stderr or proc.stdout or "").strip()
        if "not found" in err.lower() or "does not exist" in err.lower():
            return
        # 有的版本仍打印成功；无明确 not found 则抛
        if "Deleted" in (proc.stdout or "") or "deleted" in err.lower():
            return
        raise RuntimeError(err or f"r2 delete failed: {key}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--remote", action="store_true")
    ap.add_argument("--local", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    if args.remote == args.local:
        print("请指定 --remote 或 --local", file=sys.stderr)
        return 1
    remote = args.remote

    bad = d1_rows(
        remote,
        """
        SELECT j.ref_key, j.r2_key AS jp_r2, e.r2_key AS en_r2,
               (SELECT COUNT(*) FROM jp_vocab_word w WHERE w.ref_key = j.ref_key) AS words,
               (SELECT COUNT(*) FROM jp_lesson l WHERE l.ref_key = j.ref_key) AS lessons
        FROM jp_vocab_ref j
        JOIN en_vocab_ref e ON e.ref_key = j.ref_key
        WHERE j.r2_key LIKE 'vocab-ref/%'
          AND (
            e.r2_key LIKE 'en-vocab-ref/%'
            OR e.r2_key = j.r2_key
          )
        ORDER BY j.ref_key;
        """.strip(),
    )
    print(f"[unlink-jp-overwritten] bad_refs={len(bad)} dry_run={args.dry_run}")
    if not bad:
        print("nothing to unlink")
        return 0

    for row in bad:
        print(
            f"  {row['ref_key']}: words={row['words']} lessons={row['lessons']} "
            f"jp_r2={row['jp_r2']}"
        )

    if args.dry_run:
        return 0

    keys = [str(r["ref_key"]) for r in bad]
    # 分批 IN，避免过长
    for i in range(0, len(keys), 20):
        chunk = keys[i : i + 20]
        in_list = ",".join("'" + k.replace("'", "''") + "'" for k in chunk)
        d1_json(
            remote,
            f"UPDATE jp_vocab_word SET ref_key = NULL, updated_at = datetime('now') WHERE ref_key IN ({in_list});",
        )
        d1_json(
            remote,
            f"UPDATE jp_lesson SET ref_key = NULL, updated_at = datetime('now') WHERE ref_key IN ({in_list});",
        )
        d1_json(
            remote,
            f"DELETE FROM jp_vocab_ref WHERE ref_key IN ({in_list});",
        )

    for row in bad:
        r2_key = str(row["jp_r2"] or "").strip()
        if r2_key.startswith("vocab-ref/"):
            print(f"  delete R2 {r2_key}", flush=True)
            try:
                r2_delete(remote, r2_key)
            except Exception as exc:  # noqa: BLE001
                print(f"    warn delete {r2_key}: {exc}", file=sys.stderr)

    left_words = d1_rows(
        remote,
        """
        SELECT COUNT(*) AS c FROM jp_vocab_word w
        WHERE w.ref_key IN (
          SELECT j.ref_key FROM jp_vocab_ref j
          JOIN en_vocab_ref e ON e.ref_key = j.ref_key
        );
        """.strip(),
    )
    print(f"[unlink-jp-overwritten] remaining cross-named word refs: {left_words[0]['c'] if left_words else '?'}")
    print("[unlink-jp-overwritten] done — 日语抽问这些词不再可点进教案")
    return 0


if __name__ == "__main__":
    sys.exit(main())
