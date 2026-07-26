#!/usr/bin/env python3
"""日语语法：用法+例句同一次付费调用（1 词 1 次；1:1 配对）。

防烧钱硬规则：
  - 每轮只写回 1 条语法；用法与例句同一次 Anthropic 调用
  - 禁止拆成「先 usage 再 examples」两次打钱
  - 付费间隔 ≥1s；进程互斥锁；失败毒丸 6h
  - 禁止 --allow-burst 写进定时；本脚本不装 launchd
  - 批量前必须先 --max-rounds 2～3 冒烟

用法：
  python3 scripts/jp-vocab-fill-grammar-usage-examples-api.py --status
  python3 scripts/jp-vocab-fill-grammar-usage-examples-api.py --max-rounds 2
  python3 scripts/jp-vocab-fill-grammar-usage-examples-api.py --loop --max-rounds 3
  python3 scripts/jp-vocab-fill-grammar-usage-examples-api.py --loop   # 确认冒烟后再全量
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

DEFAULT_API_URL = "https://finance.info-quests.com/api/jp-vocab/fill-usage"
HTTP_USER_AGENT = "jp-vocab-fill-grammar-usage-examples/2.0"
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

PAIR_SYSTEM = (
    "你为日语 N5～N2 学习者一次写完语法「用法+例句」。"
    "每一条编号用法下面必须立刻跟 1 条日语例句和 1 行「译文：」。"
    "至少 2 组；常用度降序；例句只用简单词、不叠更难语法。"
    "汉字后半角括号假名。不要 markdown、不要 JLPT 标签、不要把用法和例句拆成两次回答。"
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
        return max(60, int(raw))
    except ValueError:
        return DEFAULT_POISON_SEC


@contextmanager
def acquire_run_lock() -> Iterator[None]:
    RUN_LOCK_PATH.parent.mkdir(parents=True, exist_ok=True)
    with RUN_LOCK_PATH.open("a+", encoding="utf-8") as fh:
        try:
            fcntl.flock(fh.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print("[jp-grammar-fill] 前一任务仍在跑，等待锁…", flush=True)
            fcntl.flock(fh.fileno(), fcntl.LOCK_EX)
        fh.seek(0)
        fh.truncate()
        fh.write(str(os.getpid()))
        fh.flush()
        try:
            yield
        finally:
            fcntl.flock(fh.fileno(), fcntl.LOCK_UN)


def acquire_paid_rate_gate(*, allow_burst: bool) -> None:
    if allow_burst:
        return
    min_sec = resolve_min_interval_sec()
    RATE_GATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    now = time.time()
    last = 0.0
    if RATE_GATE_PATH.is_file():
        try:
            last = float(RATE_GATE_PATH.read_text(encoding="utf-8").strip() or 0)
        except ValueError:
            last = 0.0
    wait = min_sec - (now - last)
    if wait > 0:
        print(
            f"[jp-grammar-fill] rate-gate: 距上次付费仅 {now - last:.1f}s "
            f"< {min_sec}s，等待 {wait:.1f}s…",
            flush=True,
        )
        time.sleep(wait)


def mark_paid_call() -> None:
    RATE_GATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    RATE_GATE_PATH.write_text(str(time.time()), encoding="utf-8")


def load_poison() -> dict[str, dict]:
    if not POISON_PATH.is_file():
        return {}
    try:
        raw = json.loads(POISON_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}
    now = time.time()
    out: dict[str, dict] = {}
    for k, v in (raw or {}).items():
        try:
            until = float(v.get("until") or 0)
        except (TypeError, ValueError):
            continue
        if until > now:
            out[str(k)] = v
    return out


def save_poison(data: dict[str, dict]) -> None:
    POISON_PATH.parent.mkdir(parents=True, exist_ok=True)
    POISON_PATH.write_text(
        json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def poison_word(word_id: int, reason: str) -> None:
    data = load_poison()
    data[str(word_id)] = {
        "until": time.time() + resolve_poison_sec(),
        "reason": reason,
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
    for attempt in range(retries):
        req = urllib.request.Request(
            api_url,
            data=data,
            method="POST",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {token}",
                "User-Agent": HTTP_USER_AGENT,
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            last_err = exc
            payload = exc.read().decode("utf-8", errors="replace")
            if exc.code in (429, 500, 502, 503, 504) and attempt + 1 < retries:
                time.sleep(min(30, 2**attempt))
                continue
            raise SystemExit(f"HTTP {exc.code}: {payload[:500]}") from exc
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            if attempt + 1 < retries:
                time.sleep(min(30, 2**attempt))
                continue
            raise
    raise SystemExit(f"API failed: {last_err}")


def parse_pair_output(raw: str) -> tuple[str, str] | None:
    """拆「编号用法 + 日语 + 译文」块 → (usage, example_sentences)。"""
    lines = [
        ln.strip()
        for ln in FENCE_RE.sub("", str(raw or "")).splitlines()
        if ln.strip() and not ln.strip().startswith("```")
    ]
    if not lines:
        return None
    blocks: list[dict] = []
    cur: dict | None = None
    for line in lines:
        m = NUMBERED_LINE_RE.match(line)
        if m:
            if cur:
                blocks.append(cur)
            cur = {"n": int(m.group(1)), "usage": m.group(2).strip(), "body": []}
            continue
        if cur is None:
            return None
        cur["body"].append(line)
    if cur:
        blocks.append(cur)
    if len(blocks) < 2:
        return None
    for i, b in enumerate(blocks):
        if b["n"] != i + 1:
            return None
        if not b["usage"] or not HAN_RE.search(b["usage"]):
            return None
        if len(b["body"]) < 2:
            return None
        if not any(x.startswith("译文") or x.startswith("譯文") for x in b["body"]):
            return None
    usage = "\n".join(f"{i + 1}. {b['usage']}" for i, b in enumerate(blocks))
    examples = "\n".join("\n".join(b["body"]) for b in blocks)
    return usage, examples


def pick_row(missing: list, poison: dict) -> tuple[dict | None, int]:
    skipped = 0
    for row in missing:
        wid = str(int(row["id"]))
        if wid in poison:
            skipped += 1
            print(
                f"[jp-grammar-fill] skip poisoned id={wid} "
                f"reason={poison[wid].get('reason')!r}",
                flush=True,
            )
            continue
        return row, skipped
    return None, skipped


def run_clear_examples(*, api_url: str, token: str, dry_run: bool) -> dict:
    payload = call_api(
        api_url=api_url,
        token=token,
        body={"mode": "clear_grammar_examples", "dry_run": dry_run},
    )
    if payload.get("mode") != "clear_grammar_examples":
        raise SystemExit(
            "线上尚未部署 clear_grammar_examples。请等部署完成后再清。"
        )
    print(
        f"[jp-grammar-fill] clear_grammar_examples "
        f"cleared={payload.get('cleared')} dry_run={dry_run}",
        flush=True,
    )
    return payload


def run_status(*, api_url: str, token: str) -> None:
    scan = call_api(
        api_url=api_url,
        token=token,
        body={"mode": "list_missing", "limit": 1},
    )
    print(
        f"[jp-grammar-fill] status missing_pair={scan.get('total_missing')} "
        f"(usage 或缺例句，一词一次成对补)",
        flush=True,
    )


def run_one_pair(
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
            f"[jp-grammar-fill] pair 无缺失（total_missing={total_missing}）",
            flush=True,
        )
        return {**scan, "total_missing": 0}

    row, skipped_poison = pick_row(missing, load_poison())
    if row is None:
        print(
            f"[jp-grammar-fill] pair 本批均毒丸（跳过 {skipped_poison}）",
            flush=True,
        )
        return {
            "ok": True,
            "skipped_run": True,
            "reason": "all_poisoned",
            "total_missing": total_missing,
        }

    word_id = int(row["id"])
    word = str(row["word"])
    prompt = str(row.get("prompt") or "").strip()
    if not prompt:
        prompt = (
            f"词条：{word}\n类型：语法\n\n"
            "请一次写完：每条编号用法下紧跟 1 条例句（日语+译文：）。至少 2 组。"
        )
    print(
        f"[jp-grammar-fill] pair {FILL_PER_ROUND}/{total_missing}: "
        f"id={word_id} {word!r} model={anthropic_model()} "
        f"need_usage={row.get('need_usage')} need_examples={row.get('need_examples')}",
        flush=True,
    )
    if dry_run:
        return {
            "ok": True,
            "updated": 0,
            "dry_run": True,
            "total_missing": total_missing,
        }

    try:
        raw = call_anthropic(
            prompt,
            system=PAIR_SYSTEM,
            max_tokens=2000,
            temperature=0.2,
            timeout=180,
        )
    except Exception as exc:  # noqa: BLE001
        mark_paid_call()
        poison_word(word_id, f"anthropic_error:{exc}")
        return {"ok": True, "updated": 0, "error": str(exc)}

    mark_paid_call()
    parsed = parse_pair_output(raw)
    if not parsed:
        poison_word(word_id, "invalid:pair_parse")
        print(f"  成对解析失败 raw={str(raw)[:160]!r}", flush=True)
        return {"ok": True, "updated": 0}

    usage, examples = parsed
    source = build_online_source_label()
    print(
        f"  {word_id} {word!r} -> usage_ok examples_len={len(examples)} "
        f"source={source}",
        flush=True,
    )

    def do_apply(u: str, ex: str) -> dict:
        return call_api(
            api_url=api_url,
            token=token,
            body={
                "mode": "apply",
                "source": source,
                "updates": [
                    {
                        "word_id": word_id,
                        "usage": u,
                        "example_sentences": ex,
                        "source": source,
                    }
                ],
            },
        )

    payload = do_apply(usage, examples)
    if not payload.get("ok"):
        poison_word(word_id, "apply_failed")
        raise SystemExit(f"API error: {payload.get('error', payload)}")
    skipped = payload.get("skipped") or []
    if skipped and not payload.get("updated"):
        reason = str(skipped[0].get("reason") or "apply_skipped")
        if "invalid_format" in reason:
            print(f"  apply 拒收 {reason}，追加 CRITICAL 再试 1 次…", flush=True)
            acquire_paid_rate_gate(allow_burst=allow_burst)
            core = re.sub(r"^[～~〜]+|[～~〜]+$", "", word)
            retry_prompt = (
                prompt
                + "\n\nCRITICAL:\n"
                + f"- 例句必须自然用到「{core}」（中文教学标题除外）。\n"
                + "- 每个汉字后半角括号假名；每组=用法+日语+译文。\n"
                + "- 至少 2 组，一一对应。\n"
            )
            try:
                raw2 = call_anthropic(
                    retry_prompt,
                    system=PAIR_SYSTEM,
                    max_tokens=2000,
                    temperature=0.15,
                    timeout=180,
                )
            except Exception as exc:  # noqa: BLE001
                mark_paid_call()
                poison_word(word_id, f"anthropic_retry_error:{exc}")
                return {"ok": True, "updated": 0}
            mark_paid_call()
            parsed2 = parse_pair_output(raw2)
            if not parsed2:
                poison_word(word_id, "invalid:pair_parse_retry")
                return {"ok": True, "updated": 0}
            payload = do_apply(*parsed2)
            skipped = payload.get("skipped") or []
            if skipped and not payload.get("updated"):
                poison_word(word_id, f"apply_skipped:{skipped[0].get('reason')}")
            else:
                print("  重试写回成功", flush=True)
        else:
            poison_word(word_id, f"apply_skipped:{reason}")

    remaining = max(0, total_missing - (1 if payload.get("updated") else 0))
    print(
        f"[jp-grammar-fill] pair apply updated={payload.get('updated')} "
        f"remaining≈{remaining}",
        flush=True,
    )
    return {**payload, "total_missing": remaining}


def loop_pair(
    *,
    api_url: str,
    token: str,
    dry_run: bool,
    allow_burst: bool,
    max_rounds: int,
) -> None:
    min_sec = resolve_min_interval_sec()
    rounds = 0
    print(
        f"[jp-grammar-fill] loop pair(用法+例句同次) min_interval={min_sec}s "
        f"max_rounds={max_rounds or '∞'}",
        flush=True,
    )
    while True:
        rounds += 1
        if max_rounds > 0 and rounds > max_rounds:
            print(
                f"[jp-grammar-fill] 达到 max_rounds={max_rounds}，停止"
                f"（请确认无误后再 --loop 全量）",
                flush=True,
            )
            break
        try:
            result = run_one_pair(
                api_url=api_url,
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
        except Exception as exc:  # noqa: BLE001
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
        left_raw = result.get("total_missing")
        left = int(left_raw) if left_raw is not None else -1
        if left == 0:
            print("[jp-grammar-fill] pair 全部补完", flush=True)
            break
        print(
            f"[jp-grammar-fill] pair 仍缺约 {left}，"
            f"下一轮由 rate-gate 控速（≥{min_sec}s）…",
            flush=True,
        )


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "日语语法用法+例句：一词一次付费成对写回（禁止拆成两次模型调用）"
        )
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--clear-examples", action="store_true")
    parser.add_argument("--status", action="store_true")
    parser.add_argument(
        "--loop",
        action="store_true",
        help="循环；务必先 --max-rounds 2～3 冒烟",
    )
    parser.add_argument(
        "--max-rounds",
        type=int,
        default=0,
        help="最多补几条（冒烟用 2～3；0=不限制，仅 --loop 时）",
    )
    parser.add_argument(
        "--allow-burst",
        action="store_true",
        help="跳过 1s 门禁（仅调试；禁止写进定时）",
    )
    parser.add_argument(
        "--phase",
        choices=["pair"],
        default="pair",
        help="仅保留 pair（用法+例句同次）；旧 usage/examples 分阶段已废弃",
    )
    args = parser.parse_args()

    token = load_token()
    api_url = resolve_api_url()

    with acquire_run_lock():
        if args.status:
            run_status(api_url=api_url, token=token)
            return 0

        if args.clear_examples:
            run_clear_examples(api_url=api_url, token=token, dry_run=args.dry_run)
            if not args.loop and args.max_rounds <= 0:
                return 0

        if args.loop or args.max_rounds > 0:
            max_rounds = args.max_rounds
            if args.loop and max_rounds <= 0:
                print(
                    "[jp-grammar-fill] 警告：全量 --loop 无 max_rounds。"
                    "若尚未冒烟，请 Ctrl+C，改用 --max-rounds 2",
                    flush=True,
                )
            loop_pair(
                api_url=api_url,
                token=token,
                dry_run=args.dry_run,
                allow_burst=args.allow_burst,
                max_rounds=max_rounds if max_rounds > 0 else (1 if not args.loop else 0),
            )
            return 0

        # 默认只补 1 条（强制冒烟习惯）
        run_one_pair(
            api_url=api_url,
            token=token,
            dry_run=args.dry_run,
            allow_burst=args.allow_burst,
        )
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
