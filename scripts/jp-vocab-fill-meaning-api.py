#!/usr/bin/env python3
"""日语单词释义：tokken Anthropic（与英语线上补全同一套）→ POST fill-meaning。

缺释义时：若同时缺词性 / 例句，同一次 Cloud 请求一并要回（常用用法例句即可）。

限流 / 互斥：
  - 每轮最多 1 条
  - 两轮付费调用最小间隔 ≥1 秒（文件门禁；未到点则 sleep 等待，不 skip）
  - 进程互斥锁：前一任务仍在跑则阻塞等待，禁止并行打 tokken
  - 失败词毒丸 6h，避免队首同一词连环烧钱
  - 释义写回成功则不因例句校验失败毒丸（例句可留给独立定时）

用法：
  python3 scripts/jp-vocab-fill-meaning-api.py --clear-all
  python3 scripts/jp-vocab-fill-meaning-api.py              # 补 1 条
  python3 scripts/jp-vocab-fill-meaning-api.py --loop       # 循环：1 条 / ≥1s
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

DEFAULT_API_URL = "https://finance.info-quests.com/api/jp-vocab/fill-meaning"
HTTP_USER_AGENT = "jp-vocab-fill-meaning-online/1.0"
DEFAULT_MIN_INTERVAL_SEC = 1
DEFAULT_POISON_SEC = 6 * 3600
# 每轮只写回 1 条；list 多拉几条是为了跳过毒丸队首，避免永远卡同一词
FILL_PER_ROUND = 1
LIST_CANDIDATE_LIMIT = 20

RATE_GATE_PATH = (
    Path.home() / ".config" / "info-quests" / "jp-vocab-fill-meaning.last_paid_call"
)
POISON_PATH = (
    Path.home() / ".config" / "info-quests" / "jp-vocab-fill-meaning.poison.json"
)
RUN_LOCK_PATH = (
    Path.home() / ".config" / "info-quests" / "jp-vocab-fill-meaning.run.lock"
)

HAN_RE = re.compile(r"[\u4E00-\u9FFF]")
MARKDOWN_RE = re.compile(r"[`*_#\[\]|>]")
LEADING_INDEX_RE = re.compile(r"^\s*\d+[.、．)\]]\s*")
FENCE_RE = re.compile(r"^```(?:\w+)?\s*|\s*```$", re.MULTILINE)

SYSTEM = (
    "你为日语 N5/N4 初学者补全单词字段（释义，必要时词性与常用用法例句）。"
    "严格按用户要求的【释义】【词性】【例句】区块输出；缺哪项就省略哪块。"
    "若只要释义：也可只输出一行释义正文。"
    "释义：最常用 1～3 个中文义项，用「；」连接，常用在前；多读音用 / 分大义项。"
    "词性：中文（名词/动词/い形容词…），多词性用 /。"
    "例句：只要比较常用的用法；日语行须汉字后半角括号假名；下一行「译文：」中文。"
    "不要 markdown、不要解释过程。"
)

SECTION_RE = re.compile(
    r"^【\s*(释义|词性|例句|意思)\s*】\s*$|^#{1,3}\s*(释义|词性|例句)\s*$",
    re.I,
)
POS_TOKEN_RE = re.compile(
    r"^(名词|动词|い形容词|な形容词|形容词|副词|助词|接続词|接续词|"
    r"感叹词|数词|连体词|代词|接尾词|接头词|连语|固有名詞|专有名词)$"
)
POS_ALIASES = {
    "名詞": "名词",
    "動詞": "动词",
    "形容詞": "形容词",
    "い形": "い形容词",
    "ナ形": "な形容词",
    "な形": "な形容词",
    "副詞": "副词",
    "助詞": "助词",
    "接続詞": "接続词",
    "感嘆詞": "感叹词",
    "数詞": "数词",
    "連体詞": "连体词",
    "代名詞": "代词",
}


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
        or load_env_file("jp-vocab-fill-meaning.env").get(
            "JP_VOCAB_FILL_MEANING_MIN_INTERVAL_SEC"
        )
        or str(DEFAULT_MIN_INTERVAL_SEC)
    )
    try:
        return max(1, int(raw))
    except ValueError:
        return DEFAULT_MIN_INTERVAL_SEC


def resolve_poison_sec() -> int:
    raw = (
        os.getenv("JP_VOCAB_FILL_MEANING_POISON_SEC")
        or load_env_file("jp-vocab-fill.env").get("JP_VOCAB_FILL_MEANING_POISON_SEC")
        or load_env_file("jp-vocab-fill-meaning.env").get(
            "JP_VOCAB_FILL_MEANING_POISON_SEC"
        )
        or str(DEFAULT_POISON_SEC)
    )
    try:
        return max(300, int(raw))
    except ValueError:
        return DEFAULT_POISON_SEC


@contextmanager
def acquire_run_lock() -> Iterator[None]:
    """进程互斥：前一任务仍在跑则阻塞等待，拿不到锁不并行打 tokken。"""
    RUN_LOCK_PATH.parent.mkdir(parents=True, exist_ok=True)
    fh = open(RUN_LOCK_PATH, "a+", encoding="utf-8")
    try:
        try:
            fcntl.flock(fh.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print(
                "[jp-vocab-fill-meaning] 前一任务仍在跑，等待锁…",
                flush=True,
            )
            fcntl.flock(fh.fileno(), fcntl.LOCK_EX)
            print("[jp-vocab-fill-meaning] 已拿到运行锁", flush=True)
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
    """未到最小间隔则 sleep 等到点，不 skip。"""
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
            f"[jp-vocab-fill-meaning] rate-gate: 距上次付费调用仅 "
            f"{elapsed:.1f}s < {min_sec}s，等待 {wait:.1f}s…",
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


def map_pos_token(raw: str) -> str | None:
    t = raw.strip().replace("。", "").replace("．", "")
    if not t:
        return None
    if t in POS_ALIASES:
        return POS_ALIASES[t]
    if POS_TOKEN_RE.match(t):
        if t == "接续词":
            return "接続词"
        if t == "形容词":
            return "い形容词"
        return t
    return None


def normalize_pos(raw: str) -> str | None:
    cleaned = re.sub(r"^(词性|pos)\s*[:：]\s*", "", str(raw or ""), flags=re.I).strip()
    parts: list[str] = []
    seen: set[str] = set()
    for chunk in re.split(r"[\/／|,，;；]+", cleaned):
        mapped = map_pos_token(chunk)
        if not mapped or mapped in seen:
            continue
        seen.add(mapped)
        parts.append(mapped)
        if len(parts) >= 3:
            break
    return "/".join(parts) if parts else None


def _section_key(label: str) -> str | None:
    t = label.strip().lower()
    if t in ("释义", "意思", "meaning"):
        return "meaning"
    if t in ("词性", "pos"):
        return "pos"
    if t in ("例句", "例子", "examples", "example"):
        return "examples"
    return None


def parse_combo_output(
    content: str,
    *,
    need_meaning: bool,
    need_pos: bool,
    need_examples: bool,
) -> tuple[str | None, str | None, str | None]:
    """解析【释义】/【词性】/【例句】区块；仅释义时兼容单行输出。"""
    text = FENCE_RE.sub("", str(content or "")).strip()
    if not text:
        return None, None, None

    lines = text.splitlines()
    has_section = any(SECTION_RE.match(ln.strip()) for ln in lines)

    meaning: str | None = None
    pos: str | None = None
    examples: str | None = None

    if not has_section:
        # 旧格式：整段当释义；若同时缺词性且第二行像词性则拆开
        non_empty = [LEADING_INDEX_RE.sub("", ln.strip()) for ln in lines if ln.strip()]
        if need_meaning and non_empty:
            meaning, _ = validate_meaning(non_empty[0])
        if need_pos:
            for ln in non_empty[1:] if need_meaning else non_empty:
                maybe = normalize_pos(ln)
                if maybe:
                    pos = maybe
                    break
        if need_examples and len(non_empty) >= 3:
            # 从首条像日语例句的行起收尾
            start = None
            for i, ln in enumerate(non_empty):
                if "译文" in ln or "(" in ln or "（" in ln:
                    start = i if "译文" not in ln else max(0, i - 1)
                    break
            if start is not None:
                examples = "\n".join(non_empty[start:]).strip() or None
        return meaning, pos, examples

    buckets: dict[str, list[str]] = {"meaning": [], "pos": [], "examples": []}
    current: str | None = None
    for raw_line in lines:
        line = raw_line.strip()
        m = SECTION_RE.match(line)
        if m:
            label = m.group(1) or m.group(2) or ""
            current = _section_key(label)
            continue
        if not line or current is None:
            continue
        buckets[current].append(LEADING_INDEX_RE.sub("", line))

    if need_meaning and buckets["meaning"]:
        meaning, _ = validate_meaning("\n".join(buckets["meaning"]))
    if need_pos and buckets["pos"]:
        pos = normalize_pos(" ".join(buckets["pos"]))
    if need_examples and buckets["examples"]:
        examples = "\n".join(buckets["examples"]).strip() or None

    return meaning, pos, examples


def call_api(
    *,
    api_url: str,
    token: str,
    body: dict,
    retries: int = 6,
) -> dict:
    """POST Worker；遇 1102/5xx 退避重试，避免整轮 loop 被一次抖动打死。"""
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
            wait = min(60, 2 ** attempt)
            print(
                f"[jp-vocab-fill-meaning] Worker HTTP {exc.code} "
                f"(attempt {attempt}/{retries})，{wait}s 后重试… "
                f"detail={detail[:120]!r}",
                flush=True,
            )
            time.sleep(wait)
        except urllib.error.URLError as exc:
            last_err = SystemExit(f"URL error: {exc}")
            if attempt >= retries:
                raise last_err from exc
            wait = min(60, 2 ** attempt)
            print(
                f"[jp-vocab-fill-meaning] 网络错误 (attempt {attempt}/{retries})，"
                f"{wait}s 后重试… {exc}",
                flush=True,
            )
            time.sleep(wait)
    raise last_err or SystemExit("call_api failed")


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


def generate_fields(
    prompt: str,
    *,
    need_examples: bool,
) -> str:
    return call_anthropic(
        prompt,
        system=SYSTEM,
        max_tokens=1600 if need_examples else 256,
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
            f"[jp-vocab-fill-meaning] 无缺失释义（total_missing={total_missing}）",
            flush=True,
        )
        return scan

    poison = load_poison()
    row = None
    skipped_poison = 0
    for cand in missing:
        wid = str(int(cand["id"]))
        if wid in poison:
            skipped_poison += 1
            print(
                f"[jp-vocab-fill-meaning] skip poisoned id={wid} "
                f"reason={poison[wid].get('reason')!r}",
                flush=True,
            )
            continue
        row = cand
        break

    if row is None:
        # 本批全是毒丸：若还有更多缺失，说明只是 limit 内全毒；睡一会再试
        # 切勿对同一毒丸词再打付费
        print(
            f"[jp-vocab-fill-meaning] 本批 {len(missing)} 条均在毒丸冷却"
            f"（跳过 {skipped_poison}），本轮不打付费",
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
    need_pos = bool(row.get("need_pos"))
    need_examples = bool(row.get("need_examples"))
    prompt = str(row.get("prompt") or "").strip()
    if not prompt:
        jobs = ["【释义】一行常用中文义项，用「；」连接"]
        if need_pos:
            jobs.append("【词性】一行中文词性，多词性用 /")
        if need_examples:
            jobs.append("【例句】常用用法；日语+译文：交替，汉字后半角括号假名")
        prompt = (
            f"词条：{word}\n类型：单词\n\n"
            "请补全：\n" + "\n".join(jobs)
        )

    extra = []
    if need_pos:
        extra.append("pos")
    if need_examples:
        extra.append("examples")
    extra_s = f"+{'+'.join(extra)}" if extra else ""

    print(
        f"[jp-vocab-fill-meaning] 待补 {FILL_PER_ROUND}/{total_missing}: "
        f"id={word_id} {word!r} meaning{extra_s} model={anthropic_model()}"
        + (f" (已跳过毒丸 {skipped_poison})" if skipped_poison else ""),
        flush=True,
    )

    if dry_run:
        print("  dry-run: 不调用付费 API", flush=True)
        return {
            "ok": True,
            "mode": "online",
            "updated": 0,
            "dry_run": True,
            "would_call": {
                "word_id": word_id,
                "word": word,
                "need_pos": need_pos,
                "need_examples": need_examples,
            },
        }

    try:
        raw = generate_fields(prompt, need_examples=need_examples)
    except Exception as exc:
        mark_paid_call()
        poison_word(word_id, f"anthropic_error:{exc}")
        print(f"  Anthropic 失败: {exc}", flush=True)
        return {"ok": True, "updated": 0, "error": str(exc)}

    mark_paid_call()
    meaning, pos, examples = parse_combo_output(
        raw,
        need_meaning=True,
        need_pos=need_pos,
        need_examples=need_examples,
    )
    if not meaning:
        poison_word(word_id, "invalid:empty_meaning")
        print(f"  校验失败 reason=empty_meaning raw={raw[:120]!r}", flush=True)
        return {
            "ok": True,
            "updated": 0,
            "skipped": [{"id": word_id, "reason": "empty_meaning"}],
        }

    if need_pos and not pos:
        print("  警告: 需要词性但未解析到，仍写释义", flush=True)
    if need_examples and not examples:
        print("  警告: 需要例句但未解析到，仍写释义（例句留给独立定时）", flush=True)

    source = build_online_source_label()
    update: dict = {"word_id": word_id, "meaning": meaning, "source": source}
    if pos:
        update["pos"] = pos
    if examples:
        update["example_sentences"] = examples

    print(
        f"  {word_id} {word!r} -> meaning={meaning!r}"
        + (f" pos={pos!r}" if pos else "")
        + (f" examples_len={len(examples)}" if examples else "")
        + f" source={source}",
        flush=True,
    )

    payload = call_api(
        api_url=api_url,
        token=token,
        body={
            "mode": "apply",
            "source": source,
            "updates": [update],
        },
    )
    if not payload.get("ok"):
        poison_word(word_id, "apply_failed")
        raise SystemExit(f"API error: {payload.get('error', payload)}")

    skipped = payload.get("skipped") or []
    applied = payload.get("applied") or []
    meaning_ok = bool(payload.get("updated")) and any(
        (a.get("meaning") for a in applied)
    )
    # 释义已写入：例句/词性校验失败不毒丸（避免白烧钱）
    if not meaning_ok and skipped and not payload.get("updated"):
        poison_word(word_id, f"apply_skipped:{skipped[0].get('reason')}")
    elif skipped:
        for s in skipped:
            print(
                f"  apply 部分跳过: {s.get('reason')}",
                flush=True,
            )

    remaining = max(0, total_missing - (1 if payload.get("updated") else 0))
    print(
        f"[jp-vocab-fill-meaning] apply updated={payload.get('updated')} "
        f"source={source} remaining≈{remaining}",
        flush=True,
    )
    payload = dict(payload)
    payload["total_missing"] = remaining
    return payload


def main() -> int:
    parser = argparse.ArgumentParser(
        description="日语释义：tokken Anthropic 限流补全（与英语线上同套；≥1s/条，串行等待）"
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--api-url", default=None)
    parser.add_argument("--clear-all", action="store_true")
    parser.add_argument("--loop", action="store_true")
    parser.add_argument("--max-rounds", type=int, default=0)
    parser.add_argument(
        "--allow-burst",
        action="store_true",
        help="跳过 1s 门禁（仅调试；禁止写进定时）",
    )
    args = parser.parse_args()

    token = load_token()
    api_url = (args.api_url or load_api_url()).strip()

    with acquire_run_lock():
        if args.clear_all:
            run_clear_all(api_url=api_url, token=token, dry_run=args.dry_run)
            if not args.loop:
                return 0

        if args.loop:
            rounds = 0
            min_sec = resolve_min_interval_sec()
            print(
                f"[jp-vocab-fill-meaning] loop 启动 min_interval={min_sec}s",
                flush=True,
            )
            while True:
                rounds += 1
                if args.max_rounds > 0 and rounds > args.max_rounds:
                    print(
                        f"[jp-vocab-fill-meaning] 达到 max_rounds={args.max_rounds}，停止",
                        flush=True,
                    )
                    break
                try:
                    result = run_one_fill(
                        api_url=api_url,
                        token=token,
                        dry_run=args.dry_run,
                        allow_burst=args.allow_burst,
                    )
                except SystemExit as exc:
                    wait = max(30, min_sec * 10)
                    print(
                        f"[jp-vocab-fill-meaning] 本轮失败（{exc}），"
                        f"{wait}s 后继续 loop…",
                        flush=True,
                    )
                    time.sleep(wait)
                    continue
                except Exception as exc:
                    wait = max(30, min_sec * 10)
                    print(
                        f"[jp-vocab-fill-meaning] 本轮异常 {type(exc).__name__}: {exc}，"
                        f"{wait}s 后继续 loop…",
                        flush=True,
                    )
                    time.sleep(wait)
                    continue
                if result.get("skipped_run") and result.get("reason") == "all_poisoned":
                    print(
                        f"[jp-vocab-fill-meaning] 毒丸冷却中，等待 {min_sec}s…",
                        flush=True,
                    )
                    time.sleep(min_sec)
                    continue
                # 禁止每轮再打一次 list_missing probe（曾把 Worker 打到 1102）
                # 无缺失时 run_one_fill 直接返回 total_missing=0
                # 注意：0 是 falsy，禁止 `or -1`（会永远不退出空转）
                left_raw = result.get("total_missing")
                left = int(left_raw) if left_raw is not None else -1
                if left == 0 and not (result.get("missing") or []):
                    print("[jp-vocab-fill-meaning] 全部补完", flush=True)
                    break
                if left > 0:
                    print(
                        f"[jp-vocab-fill-meaning] 仍缺约 {left}，下一轮由 rate-gate 控速"
                        f"（≥{min_sec}s）…",
                        flush=True,
                    )
                else:
                    # apply 成功：下轮 run_one_fill 再 list；此处不额外打 Worker
                    print(
                        f"[jp-vocab-fill-meaning] 本轮写回 updated={result.get('updated')}，"
                        f"下一轮继续（≥{min_sec}s）…",
                        flush=True,
                    )
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
