#!/usr/bin/env python3
"""日语语法：用法 → 1:1 例句（tokken 付费串行；单词不动）。

防烧钱硬规则：
  - 每轮只写回 1 条；付费间隔 ≥1s（sleep 等待，不 skip）
  - 进程互斥锁：禁止并行打 tokken
  - 失败毒丸 6h
  - 禁止 --allow-burst 写进任何定时（本脚本也不装 launchd）

用法：
  python3 scripts/jp-vocab-fill-grammar-usage-examples-api.py --status
  python3 scripts/jp-vocab-fill-grammar-usage-examples-api.py --clear-examples
  python3 scripts/jp-vocab-fill-grammar-usage-examples-api.py --loop
  python3 scripts/jp-vocab-fill-grammar-usage-examples-api.py --phase usage --loop
  python3 scripts/jp-vocab-fill-grammar-usage-examples-api.py --phase examples --loop
"""

from __future__ import annotations

import argparse
import fcntl
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts" / "lib"))

from paid_anthropic_client import (  # noqa: E402
    anthropic_model,
    build_online_source_label,
    call_anthropic,
)

DEFAULT_USAGE_URL = "https://finance.info-quests.com/api/jp-vocab/fill-usage"
DEFAULT_EXAMPLES_URL = (
    "https://finance.info-quests.com/api/jp-vocab/fill-example-sentences"
)
HTTP_USER_AGENT = "jp-vocab-fill-grammar-usage-examples/1.0"
DEFAULT_MIN_INTERVAL_SEC = 1
DEFAULT_POISON_SEC = 6 * 3600
FILL_PER_ROUND = 1
LIST_CANDIDATE_LIMIT = 20

CFG_DIR = Path.home() / ".config" / "info-quests"
RATE_GATE_PATH = CFG_DIR / "jp-vocab-fill-grammar.last_paid_call"
POISON_PATH = CFG_DIR / "jp-vocab-fill-grammar.poison.json"
RUN_LOCK_PATH = CFG_DIR / "jp-vocab-fill-grammar.run.lock"

HAN_RE = re.compile(r"[\u4E00-\u9FFF]")
NUMBERED_LINE_RE = re.compile(r"^\s*(\d+)\s*[.、．)\]]\s*(.+)$")
FENCE_RE = re.compile(r"^```(?:\w+)?\s*|\s*```$", re.MULTILINE)
LEADING_INDEX_RE = re.compile(r"^\s*\d+[.、．)\]]\s*")

USAGE_SYSTEM = (
    "你为日语 N5～N2 学习者写语法「用法」说明。"
    "只输出编号行：1. …\\n2. …；至少 2 条；常用度降序。"
    "中文说明；可在引号内保留日语形态。不要例句、不要 markdown、不要 JLPT 标签。"
)

EXAMPLES_SYSTEM = (
    "你为日语语法写例句：第 N 句严格对应第 N 条用法。"
    "只用简单词，不要再塞更难的语法（避免多焦点）。"
    "每条：日语一行（汉字后半角括号假名）+ 下一行「译文：」中文。"
    "不要行首编号、不要 markdown、不要解释。"
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
        key, _, value = line.partition("=")
        data[key.strip()] = value.strip().strip('"').strip("'")
    return data


def load_token() -> str:
    token = (load_env_file("jp-review-sync.env").get("JP_REVIEW_UPLOAD_TOKEN") or "").strip()
    if not token:
        raise SystemExit(
            "缺少 JP_REVIEW_UPLOAD_TOKEN（~/.config/info-quests/jp-review-sync.env）"
        )
    return token


def resolve_urls() -> tuple[str, str]:
    cfg = {
        **load_env_file("jp-vocab-fill.env"),
        **load_env_file("jp-vocab-fill-reading.env"),
    }
    usage = (cfg.get("JP_VOCAB_FILL_USAGE_URL") or DEFAULT_USAGE_URL).strip()
    examples = (
        cfg.get("JP_VOCAB_FILL_EXAMPLE_SENTENCES_URL") or DEFAULT_EXAMPLES_URL
    ).strip()
    return usage, examples


def resolve_min_interval_sec() -> int:
    raw = (
        os.getenv("JP_VOCAB_FILL_GRAMMAR_MIN_INTERVAL_SEC")
        or load_env_file("jp-vocab-fill.env").get(
            "JP_VOCAB_FILL_GRAMMAR_MIN_INTERVAL_SEC"
        )
        or str(DEFAULT_MIN_INTERVAL_SEC)
    )
    try:
        return max(1, int(raw))
    except ValueError:
        return DEFAULT_MIN_INTERVAL_SEC


def resolve_poison_sec() -> int:
    raw = (
        os.getenv("JP_VOCAB_FILL_GRAMMAR_POISON_SEC")
        or load_env_file("jp-vocab-fill.env").get("JP_VOCAB_FILL_GRAMMAR_POISON_SEC")
        or str(DEFAULT_POISON_SEC)
    )
    try:
        return max(300, int(raw))
    except ValueError:
        return DEFAULT_POISON_SEC


@contextmanager
def acquire_run_lock() -> Iterator[None]:
    RUN_LOCK_PATH.parent.mkdir(parents=True, exist_ok=True)
    fh = open(RUN_LOCK_PATH, "a+", encoding="utf-8")
    try:
        try:
            fcntl.flock(fh.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print("[jp-grammar-fill] 前一任务仍在跑，等待锁…", flush=True)
            fcntl.flock(fh.fileno(), fcntl.LOCK_EX)
            print("[jp-grammar-fill] 已拿到运行锁", flush=True)
        fh.seek(0)
        fh.truncate()
        fh.write(f"{os.getpid()}\n")
        fh.flush()
        yield
    finally:
        try:
            fcntl.flock(fh.fileno(), fcntl.LOCK_UN)
        except OSError:
            pass
        fh.close()


def acquire_paid_rate_gate(*, allow_burst: bool) -> None:
    if allow_burst:
        return
    min_sec = resolve_min_interval_sec()
    RATE_GATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    while True:
        now = time.time()
        last = 0.0
        if RATE_GATE_PATH.is_file():
            try:
                last = float(RATE_GATE_PATH.read_text(encoding="utf-8").strip() or "0")
            except (OSError, ValueError):
                last = 0.0
        elapsed = now - last
        if elapsed >= min_sec:
            return
        wait = min_sec - elapsed
        print(
            f"[jp-grammar-fill] rate-gate: 距上次付费仅 {elapsed:.1f}s < {min_sec}s，"
            f"等待 {wait:.1f}s…",
            flush=True,
        )
        time.sleep(wait)


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
        f"[jp-grammar-fill] poison id={word_id} reason={reason!r} "
        f"({resolve_poison_sec()}s)",
        flush=True,
    )


def call_api(*, api_url: str, token: str, body: dict, retries: int = 6) -> dict:
    data = json.dumps(body, ensure_ascii=False).encode("utf-8")
    last_err: Exception | None = None
    for attempt in range(1, max(1, retries) + 1):
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
            transient = exc.code in {429, 500, 502, 503, 504} or "1102" in detail
            last_err = SystemExit(f"HTTP {exc.code}: {detail}")
            if not transient or attempt >= retries:
                raise last_err from exc
            wait = min(60, 2**attempt)
            print(
                f"[jp-grammar-fill] Worker HTTP {exc.code} "
                f"(attempt {attempt}/{retries})，{wait}s 后重试…",
                flush=True,
            )
            time.sleep(wait)
        except urllib.error.URLError as exc:
            last_err = SystemExit(f"URL error: {exc}")
            if attempt >= retries:
                raise last_err from exc
            wait = min(60, 2**attempt)
            print(
                f"[jp-grammar-fill] 网络错误 (attempt {attempt}/{retries})，"
                f"{wait}s 后重试… {exc}",
                flush=True,
            )
            time.sleep(wait)
    raise last_err or SystemExit("call_api failed")


def normalize_usage(raw: str) -> str | None:
    text = FENCE_RE.sub("", str(raw or "")).strip()
    points: list[str] = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        m = NUMBERED_LINE_RE.match(line)
        if not m:
            continue
        body = m.group(2).strip()
        if not body or not HAN_RE.search(body):
            continue
        points.append(body)
        if len(points) >= 5:
            break
    if len(points) < 2:
        return None
    return "\n".join(f"{i + 1}. {p}" for i, p in enumerate(points))


def pick_row(missing: list, poison: dict) -> tuple[dict | None, int]:
    skipped = 0
    for cand in missing:
        wid = str(int(cand["id"]))
        if wid in poison:
            skipped += 1
            print(
                f"[jp-grammar-fill] skip poisoned id={wid} "
                f"reason={poison[wid].get('reason')!r}",
                flush=True,
            )
            continue
        return cand, skipped
    return None, skipped


def run_clear_examples(*, api_url: str, token: str, dry_run: bool) -> dict:
    payload = call_api(
        api_url=api_url,
        token=token,
        body={"mode": "clear_grammar_examples", "dry_run": dry_run},
    )
    if not payload.get("ok"):
        raise SystemExit(f"API error: {payload.get('error', payload)}")
    if payload.get("mode") != "clear_grammar_examples":
        raise SystemExit(
            "线上尚未部署 clear_grammar_examples。请等部署完成后再清。"
        )
    cleared = int(payload.get("cleared") or 0)
    print(
        f"[jp-grammar-fill] clear_grammar_examples "
        f"{'would clear' if dry_run else 'cleared'}={cleared}",
        flush=True,
    )
    return payload


def run_status(*, usage_url: str, examples_url: str, token: str) -> None:
    usage = call_api(
        api_url=usage_url,
        token=token,
        body={"mode": "list_missing", "limit": 1},
    )
    examples = call_api(
        api_url=examples_url,
        token=token,
        body={"mode": "list_missing", "limit": 1, "kind": "grammar"},
    )
    print(
        f"[jp-grammar-fill] status "
        f"missing_usage={usage.get('total_missing')} "
        f"missing_examples(grammar)={examples.get('total_missing')}",
        flush=True,
    )


def run_one_usage(
    *,
    api_url: str,
    token: str,
    dry_run: bool,
    allow_burst: bool,
) -> dict:
    acquire_paid_rate_gate(allow_burst=allow_burst)
    scan = call_api(
        api_url=api_url,
        token=token,
        body={"mode": "list_missing", "limit": LIST_CANDIDATE_LIMIT},
    )
    if not scan.get("ok"):
        raise SystemExit(f"API error: {scan.get('error', scan)}")
    missing = scan.get("missing") or []
    total_missing = int(scan.get("total_missing") or 0)
    if not missing:
        print(
            f"[jp-grammar-fill] usage 无缺失（total_missing={total_missing}）",
            flush=True,
        )
        return {**scan, "total_missing": 0, "phase": "usage"}

    row, skipped_poison = pick_row(missing, load_poison())
    if row is None:
        print(
            f"[jp-grammar-fill] usage 本批均毒丸（跳过 {skipped_poison}）",
            flush=True,
        )
        return {
            "ok": True,
            "skipped_run": True,
            "reason": "all_poisoned",
            "total_missing": total_missing,
            "phase": "usage",
        }

    word_id = int(row["id"])
    word = str(row["word"])
    prompt = str(row.get("prompt") or "").strip() or (
        f"词条：{word}\n类型：语法\n\n请写至少 2 条编号用法（常用在前）。"
    )
    print(
        f"[jp-grammar-fill] usage {FILL_PER_ROUND}/{total_missing}: "
        f"id={word_id} {word!r} model={anthropic_model()}",
        flush=True,
    )
    if dry_run:
        return {
            "ok": True,
            "updated": 0,
            "dry_run": True,
            "total_missing": total_missing,
            "phase": "usage",
        }

    try:
        raw = call_anthropic(
            prompt, system=USAGE_SYSTEM, max_tokens=512, temperature=0.2, timeout=180
        )
    except Exception as exc:
        mark_paid_call()
        poison_word(word_id, f"anthropic_error:{exc}")
        return {"ok": True, "updated": 0, "error": str(exc), "phase": "usage"}

    mark_paid_call()
    usage = normalize_usage(raw)
    if not usage:
        poison_word(word_id, "invalid:usage")
        print(f"  用法校验失败 raw={raw[:120]!r}", flush=True)
        return {"ok": True, "updated": 0, "phase": "usage"}

    source = build_online_source_label()
    print(f"  {word_id} {word!r} -> usage ok source={source}", flush=True)
    payload = call_api(
        api_url=api_url,
        token=token,
        body={
            "mode": "apply",
            "source": source,
            "updates": [{"word_id": word_id, "usage": usage, "source": source}],
        },
    )
    if not payload.get("ok"):
        poison_word(word_id, "apply_failed")
        raise SystemExit(f"API error: {payload.get('error', payload)}")
    skipped = payload.get("skipped") or []
    if skipped and not payload.get("updated"):
        poison_word(word_id, f"apply_skipped:{skipped[0].get('reason')}")
    remaining = max(0, total_missing - (1 if payload.get("updated") else 0))
    print(
        f"[jp-grammar-fill] usage apply updated={payload.get('updated')} "
        f"remaining≈{remaining}",
        flush=True,
    )
    return {**payload, "total_missing": remaining, "phase": "usage"}


def run_one_examples(
    *,
    api_url: str,
    token: str,
    dry_run: bool,
    allow_burst: bool,
) -> dict:
    acquire_paid_rate_gate(allow_burst=allow_burst)
    scan = call_api(
        api_url=api_url,
        token=token,
        body={
            "mode": "list_missing",
            "limit": LIST_CANDIDATE_LIMIT,
            "kind": "grammar",
        },
    )
    if not scan.get("ok"):
        raise SystemExit(f"API error: {scan.get('error', scan)}")
    missing = scan.get("missing") or []
    total_missing = int(scan.get("total_missing") or 0)
    if not missing:
        print(
            f"[jp-grammar-fill] examples 无缺失（total_missing={total_missing}）",
            flush=True,
        )
        return {**scan, "total_missing": 0, "phase": "examples"}

    row, skipped_poison = pick_row(missing, load_poison())
    if row is None:
        print(
            f"[jp-grammar-fill] examples 本批均毒丸（跳过 {skipped_poison}）",
            flush=True,
        )
        return {
            "ok": True,
            "skipped_run": True,
            "reason": "all_poisoned",
            "total_missing": total_missing,
            "phase": "examples",
        }

    word_id = int(row["id"])
    word = str(row["word"])
    prompt = str(row.get("prompt") or "").strip()
    if not prompt:
        usage = str(row.get("usage") or "").strip()
        prompt = (
            f"词条：{word}\n类型：语法\n用法：\n{usage}\n\n"
            "请按用法 1:1 写例句（简单词；日语+译文：）。"
        )
    print(
        f"[jp-grammar-fill] examples {FILL_PER_ROUND}/{total_missing}: "
        f"id={word_id} {word!r} model={anthropic_model()}",
        flush=True,
    )
    if dry_run:
        return {
            "ok": True,
            "updated": 0,
            "dry_run": True,
            "total_missing": total_missing,
            "phase": "examples",
        }

    try:
        raw = call_anthropic(
            prompt,
            system=EXAMPLES_SYSTEM,
            max_tokens=1600,
            temperature=0.2,
            timeout=180,
        )
    except Exception as exc:
        mark_paid_call()
        poison_word(word_id, f"anthropic_error:{exc}")
        return {"ok": True, "updated": 0, "error": str(exc), "phase": "examples"}

    mark_paid_call()
    text = FENCE_RE.sub("", str(raw or "")).strip()
    # 轻量本地门槛：至少两行「译文」；严校验留给 Worker
    if text.count("译文") < 2 and text.count("譯文") < 2:
        poison_word(word_id, "invalid:examples_short")
        print(f"  例句过短 raw={raw[:120]!r}", flush=True)
        return {"ok": True, "updated": 0, "phase": "examples"}

    source = build_online_source_label()
    print(
        f"  {word_id} {word!r} -> examples_len={len(text)} source={source}",
        flush=True,
    )

    def do_apply(example_text: str) -> dict:
        return call_api(
            api_url=api_url,
            token=token,
            body={
                "mode": "apply",
                "source": source,
                "updates": [
                    {
                        "word_id": word_id,
                        "example_sentences": example_text,
                        "source": source,
                    }
                ],
            },
        )

    payload = do_apply(text)
    if not payload.get("ok"):
        poison_word(word_id, "apply_failed")
        raise SystemExit(f"API error: {payload.get('error', payload)}")
    skipped = payload.get("skipped") or []
    if skipped and not payload.get("updated"):
        reason = str(skipped[0].get("reason") or "apply_skipped")
        # 假名/语法核失败：再付费重试 1 次（追加 CRITICAL），仍失败再毒丸
        if "invalid_format" in reason:
            print(f"  apply 拒收 {reason}，追加 CRITICAL 再试 1 次…", flush=True)
            acquire_paid_rate_gate(allow_burst=allow_burst)
            core = re.sub(r"^[～~〜]+|[～~〜]+$", "", word)
            retry_prompt = (
                prompt
                + "\n\nCRITICAL:\n"
                + f"- 句中必须自然用到语法「{core}」（不要只写中文标题）。\n"
                + "- 每个汉字后立刻半角括号假名；不要漏标。\n"
                + "- 条数必须与用法条数一致；只用简单词。\n"
            )
            try:
                raw2 = call_anthropic(
                    retry_prompt,
                    system=EXAMPLES_SYSTEM,
                    max_tokens=1600,
                    temperature=0.15,
                    timeout=180,
                )
            except Exception as exc:
                mark_paid_call()
                poison_word(word_id, f"anthropic_retry_error:{exc}")
                return {"ok": True, "updated": 0, "phase": "examples"}
            mark_paid_call()
            text2 = FENCE_RE.sub("", str(raw2 or "")).strip()
            payload = do_apply(text2)
            skipped = payload.get("skipped") or []
            if skipped and not payload.get("updated"):
                poison_word(word_id, f"apply_skipped:{skipped[0].get('reason')}")
            else:
                print("  重试写回成功", flush=True)
        else:
            poison_word(word_id, f"apply_skipped:{reason}")
    remaining = max(0, total_missing - (1 if payload.get("updated") else 0))
    print(
        f"[jp-grammar-fill] examples apply updated={payload.get('updated')} "
        f"remaining≈{remaining}",
        flush=True,
    )
    return {**payload, "total_missing": remaining, "phase": "examples"}


def loop_phase(
    *,
    phase: str,
    usage_url: str,
    examples_url: str,
    token: str,
    dry_run: bool,
    allow_burst: bool,
    max_rounds: int,
) -> None:
    min_sec = resolve_min_interval_sec()
    rounds = 0
    print(
        f"[jp-grammar-fill] loop phase={phase} min_interval={min_sec}s",
        flush=True,
    )
    while True:
        rounds += 1
        if max_rounds > 0 and rounds > max_rounds:
            print(
                f"[jp-grammar-fill] 达到 max_rounds={max_rounds}，停止",
                flush=True,
            )
            break
        try:
            if phase == "usage":
                result = run_one_usage(
                    api_url=usage_url,
                    token=token,
                    dry_run=dry_run,
                    allow_burst=allow_burst,
                )
            else:
                result = run_one_examples(
                    api_url=examples_url,
                    token=token,
                    dry_run=dry_run,
                    allow_burst=allow_burst,
                )
        except SystemExit as exc:
            wait = max(30, min_sec * 10)
            print(
                f"[jp-grammar-fill] 本轮失败（{exc}），{wait}s 后继续…",
                flush=True,
            )
            time.sleep(wait)
            continue
        except Exception as exc:
            wait = max(30, min_sec * 10)
            print(
                f"[jp-grammar-fill] 本轮异常 {type(exc).__name__}: {exc}，"
                f"{wait}s 后继续…",
                flush=True,
            )
            time.sleep(wait)
            continue

        if result.get("skipped_run") and result.get("reason") == "all_poisoned":
            time.sleep(min_sec)
            continue
        # 注意：total_missing=0 在 Python 里是 falsy，禁止 `or -1`（会变成永远不退出）
        left_raw = result.get("total_missing")
        left = int(left_raw) if left_raw is not None else -1
        if left == 0:
            print(f"[jp-grammar-fill] phase={phase} 全部补完", flush=True)
            break
        print(
            f"[jp-grammar-fill] phase={phase} 仍缺约 {left}，"
            f"下一轮由 rate-gate 控速（≥{min_sec}s）…",
            flush=True,
        )


def main() -> int:
    parser = argparse.ArgumentParser(
        description="日语语法用法+例句：tokken 付费串行（≥1s/条；单词不动）"
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--clear-examples", action="store_true")
    parser.add_argument("--status", action="store_true")
    parser.add_argument("--loop", action="store_true")
    parser.add_argument(
        "--phase",
        choices=["all", "usage", "examples"],
        default="all",
        help="all=先补完用法再补例句；也可只跑某一阶段",
    )
    parser.add_argument("--max-rounds", type=int, default=0)
    parser.add_argument(
        "--allow-burst",
        action="store_true",
        help="跳过 1s 门禁（仅调试；禁止写进定时）",
    )
    args = parser.parse_args()

    token = load_token()
    usage_url, examples_url = resolve_urls()

    with acquire_run_lock():
        if args.status:
            run_status(usage_url=usage_url, examples_url=examples_url, token=token)
            return 0

        if args.clear_examples:
            run_clear_examples(
                api_url=usage_url, token=token, dry_run=args.dry_run
            )
            if not args.loop:
                return 0

        if args.loop:
            if args.phase in ("all", "usage"):
                loop_phase(
                    phase="usage",
                    usage_url=usage_url,
                    examples_url=examples_url,
                    token=token,
                    dry_run=args.dry_run,
                    allow_burst=args.allow_burst,
                    max_rounds=args.max_rounds,
                )
            if args.phase in ("all", "examples"):
                loop_phase(
                    phase="examples",
                    usage_url=usage_url,
                    examples_url=examples_url,
                    token=token,
                    dry_run=args.dry_run,
                    allow_burst=args.allow_burst,
                    max_rounds=args.max_rounds,
                )
            return 0

        # 单轮：按 phase 补 1 条
        if args.phase == "examples":
            run_one_examples(
                api_url=examples_url,
                token=token,
                dry_run=args.dry_run,
                allow_burst=args.allow_burst,
            )
        else:
            run_one_usage(
                api_url=usage_url,
                token=token,
                dry_run=args.dry_run,
                allow_burst=args.allow_burst,
            )
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
