#!/usr/bin/env python3
"""日语语法：仅补「接序」（用法+例句已有；不含变形课）。

定时（launchd 每 60s）：最多补 1 条；忙则 --skip-if-busy。
与 fill-usage 的 list_missing_connection / apply(connection-only) 对接。

用法：
  python3 scripts/jp-vocab-fill-grammar-connection-api.py --status
  python3 scripts/jp-vocab-fill-grammar-connection-api.py --skip-if-busy
  python3 scripts/jp-vocab-fill-grammar-connection-api.py --word-id 456
"""

from __future__ import annotations

import argparse
import fcntl
import json
import os
import re
import sys
import time
from contextlib import contextmanager
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts" / "lib"))

from paid_anthropic_client import (  # noqa: E402
    anthropic_model,
    build_online_source_label,
    call_anthropic,
)
from vocab_fill_circuit_breaker import (  # noqa: E402
    after_attempt,
    assert_not_killed,
)
from worker_api_guard import skip_if_worker_unavailable  # noqa: E402
from worker_fill_http import post_worker_fill_api  # noqa: E402

DEFAULT_API_URL = "https://finance.info-quests.com/api/jp-vocab/fill-usage"
HTTP_USER_AGENT = "jp-vocab-fill-grammar-connection/1.0"
DEFAULT_MIN_INTERVAL_SEC = 1
DEFAULT_POISON_SEC = 6 * 3600
LIST_CANDIDATE_LIMIT = 20
CONNECTION_MARKER = "【接序】"
FENCE_RE = re.compile(r"^```(?:\w+)?\s*|\s*```$", re.MULTILINE)

CFG_DIR = Path.home() / ".config" / "info-quests"
RATE_GATE_PATH = CFG_DIR / "jp-vocab-fill-grammar-connection.last_paid_call"
POISON_PATH = CFG_DIR / "jp-vocab-fill-grammar-connection.poison.json"
RUN_LOCK_PATH = CFG_DIR / "jp-vocab-fill-grammar-connection.run.lock"

CONNECTION_ONLY_SYSTEM = (
    "你只写日语语法的「接序」（接续形态）。"
    "第一行必须是「【接序】」，下面 2～6 行："
    "动词哪一形、一类/二类形容词、名词等如何接本语法；日语形态用「」短引；不要假名括注。"
    "不要写用法长文、不要写例句、不要 markdown。"
)


def load_env_file(name: str) -> dict[str, str]:
    cfg_path = CFG_DIR / name
    data: dict[str, str] = {}
    if not cfg_path.is_file():
        return data
    for line in cfg_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        data[k.strip()] = v.strip().strip('"').strip("'")
    return data


def load_token() -> str:
    token = (
        os.getenv("JP_REVIEW_UPLOAD_TOKEN")
        or load_env_file("jp-review-sync.env").get("JP_REVIEW_UPLOAD_TOKEN")
        or ""
    ).strip()
    if not token:
        raise SystemExit(
            "缺少 JP_REVIEW_UPLOAD_TOKEN（~/.config/info-quests/jp-review-sync.env）"
        )
    return token


def resolve_api_url() -> str:
    cfg = load_env_file("jp-vocab-fill.env")
    return (
        cfg.get("JP_VOCAB_FILL_USAGE_URL")
        or os.getenv("JP_VOCAB_FILL_USAGE_URL")
        or DEFAULT_API_URL
    ).strip()


def resolve_min_interval_sec() -> int:
    raw = (
        os.getenv("JP_VOCAB_FILL_GRAMMAR_CONNECTION_MIN_INTERVAL_SEC")
        or load_env_file("jp-vocab-fill.env").get(
            "JP_VOCAB_FILL_GRAMMAR_CONNECTION_MIN_INTERVAL_SEC"
        )
        or str(DEFAULT_MIN_INTERVAL_SEC)
    )
    try:
        return max(1, int(raw))
    except ValueError:
        return DEFAULT_MIN_INTERVAL_SEC


def resolve_poison_sec() -> int:
    raw = (
        os.getenv("JP_VOCAB_FILL_GRAMMAR_CONNECTION_POISON_SEC")
        or load_env_file("jp-vocab-fill.env").get(
            "JP_VOCAB_FILL_GRAMMAR_CONNECTION_POISON_SEC"
        )
        or str(DEFAULT_POISON_SEC)
    )
    try:
        return max(60, int(raw))
    except ValueError:
        return DEFAULT_POISON_SEC


def call_api(*, api_url: str, token: str, body: dict, retries: int = 6) -> dict:
    return post_worker_fill_api(
        api_url,
        token,
        body,
        user_agent=HTTP_USER_AGENT,
        timeout=120,
        retries=retries,
    )


def load_poison() -> dict[str, dict]:
    if not POISON_PATH.is_file():
        return {}
    try:
        data = json.loads(POISON_PATH.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except json.JSONDecodeError:
        return {}


def save_poison(data: dict) -> None:
    CFG_DIR.mkdir(parents=True, exist_ok=True)
    POISON_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def poison_word(word_id: int, reason: str) -> None:
    data = load_poison()
    data[str(int(word_id))] = {
        "reason": reason,
        "at": int(time.time()),
        "ttl_sec": resolve_poison_sec(),
    }
    save_poison(data)


def is_poisoned(word_id: int) -> bool:
    entry = load_poison().get(str(int(word_id)))
    if not entry:
        return False
    at = int(entry.get("at") or 0)
    ttl = int(entry.get("ttl_sec") or resolve_poison_sec())
    if at + ttl < int(time.time()):
        return False
    return True


def acquire_paid_rate_gate(*, allow_burst: bool) -> None:
    if allow_burst:
        return
    min_sec = resolve_min_interval_sec()
    now = time.time()
    if RATE_GATE_PATH.is_file():
        try:
            last = float(RATE_GATE_PATH.read_text(encoding="utf-8").strip())
        except ValueError:
            last = 0.0
        wait = min_sec - (now - last)
        if wait > 0:
            time.sleep(wait)
    CFG_DIR.mkdir(parents=True, exist_ok=True)
    RATE_GATE_PATH.write_text(str(time.time()), encoding="utf-8")


def mark_paid_call() -> None:
    CFG_DIR.mkdir(parents=True, exist_ok=True)
    RATE_GATE_PATH.write_text(str(time.time()), encoding="utf-8")


@contextmanager
def run_lock(*, skip_if_busy: bool):
    CFG_DIR.mkdir(parents=True, exist_ok=True)
    fh = open(RUN_LOCK_PATH, "a+", encoding="utf-8")
    try:
        if skip_if_busy:
            try:
                fcntl.flock(fh.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                print("[jp-grammar-conn] 忙，跳过", flush=True)
                raise SystemExit(0)
        else:
            fcntl.flock(fh.fileno(), fcntl.LOCK_EX)
        yield
    finally:
        try:
            fcntl.flock(fh.fileno(), fcntl.LOCK_UN)
        except OSError:
            pass
        fh.close()


def split_connection(raw: str) -> str | None:
    text = FENCE_RE.sub("", str(raw or "")).replace("\r\n", "\n").strip()
    if not text:
        return None
    idx = text.find(CONNECTION_MARKER)
    if idx >= 0:
        after = text[idx + len(CONNECTION_MARKER) :].strip()
    else:
        after = text
    lines = [
        ln.strip()
        for ln in after.splitlines()
        if ln.strip() and ln.strip() != CONNECTION_MARKER
    ]
    conn = "\n".join(lines).strip()
    return conn or None


def pick_row(missing: list, poison: dict) -> dict | None:
    for row in missing:
        wid = str(int(row["id"]))
        if wid in poison and is_poisoned(int(row["id"])):
            print(
                f"[jp-grammar-conn] skip poisoned id={wid} "
                f"reason={poison[wid].get('reason')!r}",
                flush=True,
            )
            continue
        return row
    return None


def run_status(*, api_url: str, token: str) -> None:
    scan = call_api(
        api_url=api_url,
        token=token,
        body={"mode": "list_missing_connection", "limit": 1},
    )
    if scan.get("mode") != "list_missing_connection":
        print(
            "[jp-grammar-conn] 线上尚未部署 list_missing_connection；请先 publish",
            flush=True,
        )
        raise SystemExit(1)
    print(
        f"[jp-grammar-conn] status missing_connection={scan.get('total_missing')}",
        flush=True,
    )


def run_one(
    *,
    api_url: str,
    token: str,
    dry_run: bool,
    allow_burst: bool,
    target_word_id: int | None = None,
) -> dict:
    assert_not_killed("jp-grammar-connection")
    acquire_paid_rate_gate(allow_burst=allow_burst)

    body: dict = {"mode": "list_missing_connection", "limit": LIST_CANDIDATE_LIMIT}
    if target_word_id and target_word_id > 0:
        body["word_id"] = int(target_word_id)
        body["limit"] = 1

    scan = call_api(api_url=api_url, token=token, body=body)
    if not scan.get("ok"):
        raise SystemExit(f"API error: {scan.get('error', scan)}")
    if scan.get("mode") != "list_missing_connection":
        raise SystemExit(
            "线上尚未部署 list_missing_connection。请先 publish 再跑接序定时。"
        )

    missing = scan.get("missing") or []
    total_missing = int(scan.get("total_missing") or 0)
    if target_word_id and target_word_id > 0:
        missing = [r for r in missing if int(r.get("id") or 0) == int(target_word_id)]
    if not missing:
        print(
            f"[jp-grammar-conn] 无待补接序 total_missing={total_missing}",
            flush=True,
        )
        return {**scan, "total_missing": total_missing, "updated": 0}

    row = pick_row(missing, load_poison())
    if row is None:
        return {
            "ok": True,
            "skipped_run": True,
            "reason": "all_poisoned",
            "total_missing": total_missing,
        }

    word_id = int(row["id"])
    word = str(row["word"])
    prompt = str(row.get("prompt") or "").strip()
    print(
        f"[jp-grammar-conn] 1/{total_missing}: id={word_id} {word!r} "
        f"model={anthropic_model()}",
        flush=True,
    )
    if dry_run:
        return {"ok": True, "updated": 0, "dry_run": True, "total_missing": total_missing}

    try:
        raw = call_anthropic(
            prompt,
            system=CONNECTION_ONLY_SYSTEM,
            max_tokens=1024,
            temperature=0.2,
            timeout=120,
        )
    except Exception as exc:  # noqa: BLE001
        mark_paid_call()
        poison_word(word_id, f"anthropic_error:{exc}")
        after_attempt(
            scope="jp-grammar-connection",
            word_id=word_id,
            word=word,
            fixed=False,
            detail=f"anthropic_error:{exc}",
        )
        return {"ok": True, "updated": 0, "error": str(exc), "total_missing": total_missing}

    mark_paid_call()
    connection = split_connection(raw)
    if not connection:
        retry_prompt = (
            prompt
            + f"\n\nCRITICAL:\n- 第一行必须是「{CONNECTION_MARKER}」。\n"
            + "- 只写接序；不要用法、不要例句。\n"
        )
        acquire_paid_rate_gate(allow_burst=allow_burst)
        try:
            raw2 = call_anthropic(
                retry_prompt,
                system=CONNECTION_ONLY_SYSTEM,
                max_tokens=1024,
                temperature=0.15,
                timeout=120,
            )
        except Exception as exc:  # noqa: BLE001
            mark_paid_call()
            poison_word(word_id, f"anthropic_retry_error:{exc}")
            after_attempt(
                scope="jp-grammar-connection",
                word_id=word_id,
                word=word,
                fixed=False,
                detail=f"anthropic_retry_error:{exc}",
            )
            return {
                "ok": True,
                "updated": 0,
                "error": str(exc),
                "total_missing": total_missing,
            }
        mark_paid_call()
        connection = split_connection(raw2)

    if not connection:
        poison_word(word_id, "invalid:connection_parse")
        after_attempt(
            scope="jp-grammar-connection",
            word_id=word_id,
            word=word,
            fixed=False,
            detail="invalid:connection_parse",
        )
        return {"ok": True, "updated": 0, "total_missing": total_missing}

    source = build_online_source_label()
    apply_payload = call_api(
        api_url=api_url,
        token=token,
        body={
            "mode": "apply",
            "updates": [
                {
                    "word_id": word_id,
                    "connection": connection,
                    "source": source,
                }
            ],
        },
    )
    updated = int(apply_payload.get("updated") or 0)
    skipped = apply_payload.get("skipped") or []
    fixed = updated > 0 and not skipped
    after_attempt(
        scope="jp-grammar-connection",
        word_id=word_id,
        word=word,
        fixed=fixed,
        detail="updated" if fixed else f"apply_skipped:{skipped[0].get('reason') if skipped else 'no_update'}",
    )
    if fixed:
        data = load_poison()
        data.pop(str(word_id), None)
        save_poison(data)
        print(
            f"  写回成功 connection_len={len(connection)} source={source}",
            flush=True,
        )
    else:
        reason = skipped[0].get("reason") if skipped else "no_update"
        poison_word(word_id, f"apply_skipped:{reason}")
        print(f"  写回失败 reason={reason}", flush=True)

    return {**apply_payload, "total_missing": total_missing}


def main() -> int:
    parser = argparse.ArgumentParser(description="日语语法：仅补接序（每分钟 1 条）")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--status", action="store_true")
    parser.add_argument("--skip-if-busy", action="store_true")
    parser.add_argument("--allow-burst", action="store_true")
    parser.add_argument("--word-id", type=int, default=0)
    args = parser.parse_args()

    api_url = resolve_api_url()
    token = load_token()
    skip_if_worker_unavailable(api_url, label="jp-grammar-connection")

    with run_lock(skip_if_busy=args.skip_if_busy):
        if args.status:
            run_status(api_url=api_url, token=token)
            return 0
        run_one(
            api_url=api_url,
            token=token,
            dry_run=args.dry_run,
            allow_burst=args.allow_burst,
            target_word_id=args.word_id if args.word_id > 0 else None,
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
