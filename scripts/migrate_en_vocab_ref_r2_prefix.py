#!/usr/bin/env python3
"""把英语教案 R2 从误用的 vocab-ref/ 迁到 en-vocab-ref/，并改 en_vocab_ref.r2_key。

背景：日/英曾共用 vocab-ref/lesson-{id}.png，英语后传盖掉日语教案。
代码已改为 EN_VOCAB_REF_R2_PREFIX=en-vocab-ref/；本脚本迁移存量对象。

用法：
  python3 scripts/migrate_en_vocab_ref_r2_prefix.py --remote --dry-run
  python3 scripts/migrate_en_vocab_ref_r2_prefix.py --remote
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB = "strategy-compare-db"
BUCKET = "jp-review"
OLD_PREFIX = "vocab-ref/"
NEW_PREFIX = "en-vocab-ref/"


def run(cmd: list[str], *, check: bool = True) -> subprocess.CompletedProcess[str]:
    proc = subprocess.run(
        cmd,
        cwd=ROOT,
        text=True,
        capture_output=True,
    )
    if check and proc.returncode != 0:
        raise RuntimeError(
            (proc.stderr or proc.stdout or "command failed").strip()
            + f"\ncmd: {' '.join(cmd)}"
        )
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
        raise RuntimeError(f"no JSON from wrangler: {text[:500]}")
    return json.loads(text[start:])


def d1_rows(remote: bool, sql: str) -> list[dict]:
    payload = d1_json(remote, sql)
    if not payload:
        return []
    return list(payload[0].get("results") or [])


def r2_get(remote: bool, key: str, dest: Path) -> None:
    cmd = [
        "npx",
        "wrangler",
        "r2",
        "object",
        "get",
        f"{BUCKET}/{key}",
        "--file",
        str(dest),
    ]
    cmd.append("--remote" if remote else "--local")
    run(cmd)


def r2_put(remote: bool, key: str, src: Path, content_type: str) -> None:
    cmd = [
        "npx",
        "wrangler",
        "r2",
        "object",
        "put",
        f"{BUCKET}/{key}",
        "--file",
        str(src),
        "--content-type",
        content_type,
    ]
    cmd.append("--remote" if remote else "--local")
    run(cmd)


def content_type_for(media_type: str, r2_key: str) -> str:
    key = (r2_key or "").lower()
    if key.endswith(".pdf") or media_type == "pdf":
        return "application/pdf"
    return "image/png"


def new_key_from_old(old_key: str) -> str | None:
    if not old_key.startswith(OLD_PREFIX):
        return None
    return NEW_PREFIX + old_key[len(OLD_PREFIX) :]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--remote", action="store_true")
    parser.add_argument("--local", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, default=0, help="只处理前 N 条（调试）")
    args = parser.parse_args()
    if args.remote == args.local:
        print("请指定 --remote 或 --local 之一", file=sys.stderr)
        return 1

    remote = args.remote
    label = "remote" if remote else "local"
    rows = d1_rows(
        remote,
        f"""
        SELECT ref_key, r2_key, media_type, title
        FROM en_vocab_ref
        WHERE r2_key LIKE '{OLD_PREFIX}%'
        ORDER BY ref_key;
        """.strip(),
    )
    if args.limit and args.limit > 0:
        rows = rows[: args.limit]

    print(f"[migrate-en-ref-prefix] target={label} rows={len(rows)} dry_run={args.dry_run}")
    if not rows:
        print("nothing to migrate")
        return 0

    ok = 0
    skipped = 0
    failed: list[str] = []

    with tempfile.TemporaryDirectory(prefix="en-ref-mig-") as tmp:
        tmp_path = Path(tmp)
        for row in rows:
            ref_key = str(row["ref_key"])
            old_key = str(row["r2_key"])
            media_type = str(row.get("media_type") or "image")
            new_key = new_key_from_old(old_key)
            if not new_key:
                print(f"  skip {ref_key}: unexpected key {old_key}")
                skipped += 1
                continue

            print(f"  {ref_key}: {old_key} → {new_key}", flush=True)
            if args.dry_run:
                ok += 1
                continue

            dest = tmp_path / Path(old_key).name
            try:
                r2_get(remote, old_key, dest)
                if not dest.is_file() or dest.stat().st_size <= 0:
                    raise RuntimeError("downloaded empty file")
                r2_put(
                    remote,
                    new_key,
                    dest,
                    content_type_for(media_type, old_key),
                )
                # 转义单引号
                rk = ref_key.replace("'", "''")
                nk = new_key.replace("'", "''")
                d1_json(
                    remote,
                    f"""
                    UPDATE en_vocab_ref
                    SET r2_key = '{nk}',
                        updated_at = updated_at
                    WHERE ref_key = '{rk}';
                    """.strip(),
                )
                ok += 1
            except Exception as exc:  # noqa: BLE001
                failed.append(f"{ref_key}: {exc}")
                print(f"    FAIL {ref_key}: {exc}", file=sys.stderr, flush=True)

    print(f"[migrate-en-ref-prefix] done ok={ok} skipped={skipped} failed={len(failed)}")
    if failed:
        for line in failed:
            print(f"  - {line}", file=sys.stderr)
        return 1

    # 报告仍撞键、需重挂日语教案的课
    if remote and not args.dry_run:
        bad = d1_rows(
            remote,
            """
            SELECT j.ref_key,
                   (SELECT COUNT(*) FROM jp_vocab_word w WHERE w.ref_key = j.ref_key) AS jp_words,
                   (SELECT substr(content,1,80) FROM jp_lesson WHERE ref_key = j.ref_key LIMIT 1) AS jp_content
            FROM jp_vocab_ref j
            JOIN en_vocab_ref e ON e.ref_key = j.ref_key
            WHERE j.r2_key LIKE 'vocab-ref/%'
              AND e.r2_key LIKE 'en-vocab-ref/%'
            ORDER BY CAST(REPLACE(j.ref_key,'lesson-','') AS INTEGER);
            """.strip(),
        )
        print(
            f"[migrate-en-ref-prefix] JP lessons still need original image re-upload: {len(bad)}"
        )
        for row in bad:
            print(
                f"  {row['ref_key']} words={row['jp_words']} content={row.get('jp_content')}"
            )

    remaining = d1_rows(
        remote,
        f"SELECT COUNT(*) AS c FROM en_vocab_ref WHERE r2_key LIKE '{OLD_PREFIX}%';",
    )
    left = remaining[0]["c"] if remaining else "?"
    print(f"[migrate-en-ref-prefix] en still on old prefix: {left}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
