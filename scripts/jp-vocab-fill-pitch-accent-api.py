#!/usr/bin/env python3
"""OJAD 音调补全：list_missing → 本地抓 OJAD → apply 写回线上。

每轮默认处理 3 条（--batch）；适合每分钟 launchd。
仅单词（kind=word）；语法跳过。
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts" / "lib"))

from ojad_pitch_accent import fetch_pitch_accent_for_word, pitch_accent_to_json  # noqa: E402
from vocab_fill_circuit_breaker import assert_not_killed  # noqa: E402
from worker_api_guard import skip_if_worker_unavailable  # noqa: E402
from worker_fill_http import post_worker_fill_api  # noqa: E402

DEFAULT_API_URL = "https://finance.info-quests.com/api/jp-vocab/fill-pitch-accent"
HTTP_USER_AGENT = "jp-vocab-fill-pitch-accent/1.0"
OJAD_GAP_SEC = 5.0
FILL_TASK_ID = "jp-vocab-fill-pitch-accent"


def load_env_file(name: str) -> dict[str, str]:
    cfg_path = Path.home() / ".config" / "info-quests" / name
    data: dict[str, str] = {}
    if not cfg_path.is_file():
        return data
    for line in cfg_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        data[key.strip()] = value.strip().strip('"').strip("'")
    return data


def resolve_token(review_cfg: dict[str, str]) -> str:
    return (
        os.environ.get("JP_REVIEW_UPLOAD_TOKEN")
        or review_cfg.get("JP_REVIEW_UPLOAD_TOKEN", "")
    ).strip()


def call_api(
    *,
    api_url: str,
    token: str,
    payload: dict,
) -> dict:
    return post_worker_fill_api(
        api_url,
        token,
        payload,
        user_agent=HTTP_USER_AGENT,
        timeout=120,
    )


def run_batch(
    *,
    api_url: str,
    token: str,
    dry_run: bool,
    batch: int,
    ojad_gap: float,
) -> dict:
    scan = call_api(
        api_url=api_url,
        token=token,
        payload={"mode": "list_missing", "limit": max(batch, 50)},
    )
    if not scan.get("ok"):
        raise SystemExit(f"list_missing error: {scan.get('error', scan)}")

    missing = scan.get("missing") or []
    total_raw = scan.get("total_missing")
    total = int(total_raw) if total_raw is not None else len(missing)

    if not missing:
        print("  无缺音调单词", flush=True)
        return {
            "ok": True,
            "updated": 0,
            "applied": [],
            "skipped": [],
            "total_missing": 0,
            "dry_run": dry_run,
        }

    print(f"  待补音调 {total} 条；本轮最多 {batch} 条", flush=True)

    import requests

    session = requests.Session()
    session.headers.update({"User-Agent": HTTP_USER_AGENT})

    updates: list[dict] = []
    skipped: list[dict] = []
    not_found_ids: list[int] = []

    for i, item in enumerate(missing[:batch]):
        if i:
            print(f"  (OJAD sleep {ojad_gap}s …)", flush=True)
            time.sleep(ojad_gap)
        word_id = int(item["id"])
        word = str(item["word"])
        reading = item.get("reading")
        reading_s = str(reading).strip() if reading else None
        print(f"  OJAD fetch: id={word_id} {word!r}", flush=True)
        try:
            accent = fetch_pitch_accent_for_word(word, reading=reading_s, session=session)
        except Exception as e:
            print(f"    ERROR: {e}", flush=True)
            skipped.append({"id": word_id, "word": word, "reason": str(e)})
            continue
        if not accent:
            print("    (no OJAD match → mark OJAD_NONE, UI 只显示普通读音)", flush=True)
            not_found_ids.append(word_id)
            skipped.append({"id": word_id, "word": word, "reason": "no_match"})
            continue
        print(f"    -> {accent['kana']} pattern={accent['pattern']}", flush=True)
        updates.append(
            {
                "word_id": word_id,
                "pitch_accent": accent,
                "source": "OJAD",
            }
        )

    if dry_run:
        return {
            "ok": True,
            "updated": len(updates),
            "marked_not_found": len(not_found_ids),
            "applied": [{"id": u["word_id"], "pitch_accent": u["pitch_accent"]} for u in updates],
            "skipped": skipped,
            "total_missing": total,
            "dry_run": True,
        }

    marked_not_found = 0
    if not_found_ids:
        mark = call_api(
            api_url=api_url,
            token=token,
            payload={"mode": "mark_not_found", "word_ids": not_found_ids},
        )
        if not mark.get("ok"):
            raise SystemExit(f"mark_not_found error: {mark.get('error', mark)}")
        marked_not_found = int(mark.get("marked") or 0)
        print(f"  mark_not_found={marked_not_found}", flush=True)

    if not updates:
        return {
            "ok": True,
            "updated": 0,
            "marked_not_found": marked_not_found,
            "applied": [],
            "skipped": skipped,
            "total_missing": max(0, total - marked_not_found),
            "dry_run": False,
        }

    apply = call_api(
        api_url=api_url,
        token=token,
        payload={"mode": "apply", "updates": updates},
    )
    if not apply.get("ok"):
        raise SystemExit(f"apply error: {apply.get('error', apply)}")

    applied = apply.get("applied") or []
    print(f"  apply updated={len(applied)} skipped={len(apply.get('skipped') or [])}", flush=True)
    return {
        **apply,
        "marked_not_found": marked_not_found,
        "skipped": skipped + list(apply.get("skipped") or []),
        "total_missing": max(0, total - len(applied) - marked_not_found),
        "dry_run": False,
    }


def main() -> int:
    review_cfg = load_env_file("jp-review-sync.env")
    cfg = load_env_file("jp-vocab-fill-pitch-accent.env")
    parser = argparse.ArgumentParser(description="Fill jp_vocab pitch accent via OJAD + API.")
    parser.add_argument(
        "--api-url",
        default=cfg.get("JP_VOCAB_FILL_PITCH_ACCENT_URL", DEFAULT_API_URL),
    )
    parser.add_argument("--token", default=resolve_token(review_cfg))
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--batch",
        type=int,
        default=int(cfg.get("JP_VOCAB_FILL_PITCH_ACCENT_BATCH", "3") or 3),
        help="每轮最多处理条数（默认 3）",
    )
    parser.add_argument(
        "--ojad-gap",
        type=float,
        default=float(cfg.get("JP_VOCAB_FILL_PITCH_ACCENT_OJAD_GAP", str(OJAD_GAP_SEC)) or OJAD_GAP_SEC),
    )
    parser.add_argument(
        "--test-words",
        nargs="*",
        help="仅本地试 OJAD 抓取，不打 API",
    )
    args = parser.parse_args()

    if args.test_words:
        import requests

        session = requests.Session()
        for i, w in enumerate(args.test_words):
            if i:
                time.sleep(args.ojad_gap)
            accent = fetch_pitch_accent_for_word(w, session=session)
            print(f"{w!r} -> {json.dumps(accent, ensure_ascii=False)}")
        return 0

    if not args.token:
        print(
            "请设置 JP_REVIEW_UPLOAD_TOKEN（~/.config/info-quests/jp-review-sync.env）",
            file=sys.stderr,
        )
        return 1

    assert_not_killed(FILL_TASK_ID)

    if skip_if_worker_unavailable(args.api_url, label=FILL_TASK_ID):
        return 0

    batch = max(1, min(20, args.batch))
    print(f"[{FILL_TASK_ID}] start batch={batch} dry_run={args.dry_run}", flush=True)
    result = run_batch(
        api_url=args.api_url,
        token=args.token,
        dry_run=args.dry_run,
        batch=batch,
        ojad_gap=max(1.0, args.ojad_gap),
    )
    print(json.dumps(
        {
            k: result[k]
            for k in ("ok", "updated", "marked_not_found", "total_missing", "dry_run")
            if k in result
        },
        ensure_ascii=False,
    ))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
