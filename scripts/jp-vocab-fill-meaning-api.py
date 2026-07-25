#!/usr/bin/env python3
"""日语单词释义：tokken Anthropic（与英语线上补全同一套）→ POST fill-meaning。

硬限流（防烧钱）：
  - 每轮最多 1 条
  - 两轮付费调用最小间隔 ≥60 秒（文件门禁）
  - 失败词毒丸 6h，避免队首同一词连环烧钱
  - 禁止并行；禁止一分钟狂打

用法：
  python3 scripts/jp-vocab-fill-meaning-api.py --clear-all
  python3 scripts/jp-vocab-fill-meaning-api.py              # 补 1 条
  python3 scripts/jp-vocab-fill-meaning-api.py --loop       # 循环：1 条 / ≥60s
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts" / "lib"))

from paid_anthropic_client import (  # noqa: E402
    anthropic_model,
    build_online_source_label,
    call_anthropic,
)

DEFAULT_API_URL = "https://finance.info-quests.com/api/jp-vocab/fill-meaning"
HTTP_USER_AGENT = "jp-vocab-fill-meaning-online/1.0"
DEFAULT_MIN_INTERVAL_SEC = 60
DEFAULT_POISON_SEC = 6 * 3600
HARD_LIMIT = 1

RATE_GATE_PATH = (
    Path.home() / ".config" / "info-quests" / "jp-vocab-fill-meaning.last_paid_call"
)
POISON_PATH = (
    Path.home() / ".config" / "info-quests" / "jp-vocab-fill-meaning.poison.json"
)

HAN_RE = re.compile(r"[\u4E00-\u9FFF]")
MARKDOWN_RE = re.compile(r"[`*_#\[\]|>]")
LEADING_INDEX_RE = re.compile(r"^\s*\d+[.、．)\]]\s*")
FENCE_RE = re.compile(r"^```(?:\w+)?\s*|\s*```$", re.MULTILINE)

SYSTEM = (
    "你为日语 N5/N4 初学者写单词中文释义。"
    "只输出一行释义正文，不要 markdown、不要编号、不要解释过程。"
    "只写最常用 1～3 个义项，按常用程度排序：第 1 个最常用，其后用中文分号「；」连接。"
    "例：送る → 送人；送东西。不要冷僻义挤前面。"
    "一词多读音时用半角斜杠 / 分大义项（与读音字段段数一致）。"
)


def load_env_file(name: str) -> dict[str, str]:
    cfg_path = Path.home() / ".config" / "info-quests" / name
    data: dict[str, str] = {}
    if not cfg_path.is_file():
        return data
    for line in cfg_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        data[key.strip()] = value.strip().strip('"').strip("'")
    return data


def load_token() -> str:
    review_cfg = load_env_file("jp-review-sync.env")
    token = (review_cfg.get("JP_REVIEW_UPLOAD_TOKEN") or "").strip()
    if not token:
        raise SystemExit(
            "缺少 JP_REVIEW_UPLOAD_TOKEN（~/.config/info-quests/jp-review-sync.env）"
        )
    return token


def load_api_url() -> str:
    cfg = {
        **load_env_file("jp-vocab-fill-reading.env"),
        **load_env_file("jp-vocab-fill.env"),
    }
    return (cfg.get("JP_VOCAB_FILL_MEANING_URL") or DEFAULT_API_URL).strip()


def resolve_min_interval_sec() -> int:
    raw = (
        os.getenv("JP_VOCAB_FILL_MEANING_MIN_INTERVAL_SEC")
        or load_env_file("jp-vocab-fill.env").get("JP_VOCAB_FILL_MEANING_MIN_INTERVAL_SEC")
        or str(DEFAULT_MIN_INTERVAL_SEC)
    )
    try:
        return max(30, int(raw))
    except ValueError:
        return DEFAULT_MIN_INTERVAL_SEC


def resolve_poison_sec() -> int:
    raw = (
        os.getenv("JP_VOCAB_FILL_MEANING_POISON_SEC")
        or load_env_file("jp-vocab-fill.env").get("JP_VOCAB_FILL_MEANING_POISON_SEC")
        or str(DEFAULT_POISON_SEC)
    )
    try:
        return max(300, int(raw))
    except ValueError:
        return DEFAULT_POISON_SEC


def acquire_paid_rate_gate(*, allow_burst: bool) -> bool:
    if allow_burst:
        return True
    min_sec = resolve_min_interval_sec()
    now = time.time()
    RATE_GATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    if RATE_GATE_PATH.is_file():
        try:
            last = float(RATE_GATE_PATH.read_text(encoding="utf-8").strip() or "0")
        except (OSError, ValueError):
            last = 0.0
        elapsed = now - last
        if elapsed < min_sec:
            wait = int(min_sec - elapsed)
            print(
                f"[jp-vocab-fill-meaning] rate-gate: 距上次付费调用仅 "
                f"{elapsed:.0f}s < {min_sec}s，skip（约 {wait}s 后再试）",
                flush=True,
            )
            return False
    return True


def mark_paid_call() -> None:
    RATE_GATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    RATE_GATE_PATH.write_text(f"{time.time():.3f}\n", encoding="utf-8")


def load_poison() -> dict[str, dict]:
    if not POISON_PATH.is_file():
        return {}
    try:
        raw = json.loads(POISON_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    if not isinstance(raw, dict):
        return {}
    now = time.time()
    out: dict[str, dict] = {}
    for key, val in raw.items():
        if not isinstance(val, dict):
            continue
        try:
            until = float(val.get("until") or 0)
        except (TypeError, ValueError):
            continue
        if until > now:
            out[str(key)] = val
    return out


def save_poison(data: dict[str, dict]) -> None:
    POISON_PATH.parent.mkdir(parents=True, exist_ok=True)
    POISON_PATH.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def poison_word(word_id: int, reason: str) -> None:
    data = load_poison()
    data[str(word_id)] = {
        "until": time.time() + resolve_poison_sec(),
        "reason": reason[:200],
    }
    save_poison(data)
    print(
        f"[jp-vocab-fill-meaning] poison id={word_id} reason={reason!r} "
        f"({resolve_poison_sec()}s)",
        flush=True,
    )


def normalize_meaning(raw: str) -> str:
    text = FENCE_RE.sub("", str(raw or "")).strip()
    # 取首行非空
    first = next((ln.strip() for ln in text.splitlines() if ln.strip()), "")
    text = first or text
    text = re.sub(r"^(释义|意思|中文)\s*[:：]\s*", "", text).strip()
    parts: list[str] = []
    seen: set[str] = set()
    # 保留 / 大义项：先按 / 拆，段内再规范化
    major_raw = re.split(r"[/／]", text)
    major_out: list[str] = []
    for major in major_raw:
        sub: list[str] = []
        for chunk in re.split(r"[;；、,，|｜]+", major):
            item = LEADING_INDEX_RE.sub("", chunk.strip()).rstrip("。.．")
            if not item or item in seen:
                continue
            seen.add(item)
            sub.append(item)
            if len(sub) >= 3:
                break
        if sub:
            major_out.append("；".join(sub))
        if len(major_out) >= 3:
            break
    return "/".join(major_out) if major_out else ""


def validate_meaning(raw: str) -> tuple[str | None, str | None]:
    text = normalize_meaning(raw)
    if not text:
        return None, "empty"
    if len(text) > 96:
        return None, "too_long"
    if MARKDOWN_RE.search(text):
        return None, "has_markdown"
    if not HAN_RE.search(text):
        return None, "no_chinese"
    return text, None


def call_api(*, api_url: str, token: str, body: dict) -> dict:
    data = json.dumps(body, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        api_url,
        data=data,
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json; charset=utf-8",
            "User-Agent": HTTP_USER_AGENT,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise SystemExit(f"HTTP {exc.code}: {detail}") from exc


def run_clear_all(*, api_url: str, token: str, dry_run: bool) -> dict:
    payload = call_api(
        api_url=api_url,
        token=token,
        body={"mode": "clear_all", "dry_run": dry_run},
    )
    if not payload.get("ok"):
        raise SystemExit(f"API error: {payload.get('error', payload)}")
    if payload.get("mode") != "clear_all":
        raise SystemExit(
            "线上尚未部署 clear_all（仍返回 list_missing）。请等部署完成后再清。"
        )
    cleared = int(payload.get("cleared") or 0)
    print(
        f"[jp-vocab-fill-meaning] clear_all "
        f"{'would clear' if dry_run else 'cleared'}={cleared}",
        flush=True,
    )
    return payload


def generate_meaning(prompt: str) -> str:
    return call_anthropic(
        prompt,
        system=SYSTEM,
        max_tokens=256,
        temperature=0.2,
        timeout=180,
    )


def run_one_fill(
    *,
    api_url: str,
    token: str,
    dry_run: bool,
    allow_burst: bool,
) -> dict:
    if not acquire_paid_rate_gate(allow_burst=allow_burst):
        return {"ok": True, "skipped_run": True, "reason": "rate_gate"}

    scan = call_api(
        api_url=api_url,
        token=token,
        body={"mode": "list_missing", "limit": HARD_LIMIT},
    )
    if not scan.get("ok"):
        raise SystemExit(f"API error: {scan.get('error', scan)}")

    missing = scan.get("missing") or []
    total_missing = int(scan.get("total_missing") or 0)
    if not missing:
        print(
            f"[jp-vocab-fill-meaning] 无缺失释义（total_missing={total_missing}）",
            flush=True,
        )
        return scan

    poison = load_poison()
    row = None
    for cand in missing:
        wid = str(int(cand["id"]))
        if wid in poison:
            print(
                f"[jp-vocab-fill-meaning] skip poisoned id={wid} "
                f"reason={poison[wid].get('reason')!r}",
                flush=True,
            )
            continue
        row = cand
        break

    if row is None:
        print(
            "[jp-vocab-fill-meaning] 本批均在毒丸冷却，本轮 skip（不打付费）",
            flush=True,
        )
        return {"ok": True, "skipped_run": True, "reason": "all_poisoned"}

    word_id = int(row["id"])
    word = str(row["word"])
    prompt = str(row.get("prompt") or "").strip()
    if not prompt:
        prompt = (
            f"词条：{word}\n类型：单词\n\n"
            "请写中文释义：最常用 1～3 个义项，用「；」连接，常用在前。"
        )

    print(
        f"[jp-vocab-fill-meaning] 待补 1/{total_missing}: id={word_id} {word!r} "
        f"model={anthropic_model()}",
        flush=True,
    )

    if dry_run:
        print("  dry-run: 不调用付费 API", flush=True)
        return {
            "ok": True,
            "mode": "online",
            "updated": 0,
            "dry_run": True,
            "would_call": {"word_id": word_id, "word": word},
        }

    try:
        raw = generate_meaning(prompt)
    except Exception as exc:
        mark_paid_call()
        poison_word(word_id, f"anthropic_error:{exc}")
        print(f"  Anthropic 失败: {exc}", flush=True)
        return {"ok": True, "updated": 0, "error": str(exc)}

    mark_paid_call()
    meaning, reason = validate_meaning(raw)
    if not meaning:
        poison_word(word_id, f"invalid:{reason}")
        print(f"  校验失败 reason={reason} raw={raw[:80]!r}", flush=True)
        return {"ok": True, "updated": 0, "skipped": [{"id": word_id, "reason": reason}]}

    source = build_online_source_label()
    print(f"  {word_id} {word!r} -> {meaning!r} source={source}", flush=True)

    payload = call_api(
        api_url=api_url,
        token=token,
        body={
            "mode": "apply",
            "source": source,
            "updates": [
                {"word_id": word_id, "meaning": meaning, "source": source}
            ],
        },
    )
    if not payload.get("ok"):
        poison_word(word_id, "apply_failed")
        raise SystemExit(f"API error: {payload.get('error', payload)}")

    skipped = payload.get("skipped") or []
    if skipped and not payload.get("updated"):
        poison_word(word_id, f"apply_skipped:{skipped[0].get('reason')}")

    print(
        f"[jp-vocab-fill-meaning] apply updated={payload.get('updated')} "
        f"source={source}",
        flush=True,
    )
    return payload


def main() -> int:
    parser = argparse.ArgumentParser(
        description="日语释义：tokken Anthropic 限流补全（与英语线上同套；≥60s/条）"
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--api-url", default=None)
    parser.add_argument("--clear-all", action="store_true")
    parser.add_argument("--loop", action="store_true")
    parser.add_argument("--max-rounds", type=int, default=0)
    parser.add_argument(
        "--allow-burst",
        action="store_true",
        help="跳过 60s 门禁（仅调试；禁止写进定时）",
    )
    args = parser.parse_args()

    token = load_token()
    api_url = (args.api_url or load_api_url()).strip()

    if args.clear_all:
        run_clear_all(api_url=api_url, token=token, dry_run=args.dry_run)
        if not args.loop:
            return 0

    if args.loop:
        rounds = 0
        min_sec = resolve_min_interval_sec()
        while True:
            rounds += 1
            if args.max_rounds > 0 and rounds > args.max_rounds:
                print(
                    f"[jp-vocab-fill-meaning] 达到 max_rounds={args.max_rounds}，停止",
                    flush=True,
                )
                break
            result = run_one_fill(
                api_url=api_url,
                token=token,
                dry_run=args.dry_run,
                allow_burst=args.allow_burst,
            )
            if result.get("skipped_run") and result.get("reason") == "rate_gate":
                print(f"[jp-vocab-fill-meaning] 等待 {min_sec}s…", flush=True)
                time.sleep(min_sec)
                continue
            if result.get("skipped_run") and result.get("reason") == "all_poisoned":
                print(f"[jp-vocab-fill-meaning] 毒丸冷却中，等待 {min_sec}s…", flush=True)
                time.sleep(min_sec)
                continue
            probe = call_api(
                api_url=api_url,
                token=token,
                body={"mode": "list_missing", "limit": 1},
            )
            left = int(probe.get("total_missing") or 0)
            if left <= 0 or not (probe.get("missing") or []):
                print("[jp-vocab-fill-meaning] 全部补完", flush=True)
                break
            print(
                f"[jp-vocab-fill-meaning] 仍缺 {left}，sleep {min_sec}s…",
                flush=True,
            )
            time.sleep(min_sec)
        return 0

    run_one_fill(
        api_url=api_url,
        token=token,
        dry_run=args.dry_run,
        allow_burst=args.allow_burst,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
