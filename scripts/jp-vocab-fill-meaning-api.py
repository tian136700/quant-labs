#!/usr/bin/env python3
"""日语单词释义：Jisho（免费）→ 谷歌翻译 → POST /api/jp-vocab/fill-meaning。

硬限流（防狂打）：
  - 每轮最多 1 条
  - 两轮最小间隔 ≥60 秒（文件门禁）
  - 禁止并行；禁止 tokken/Anthropic

用法：
  python3 scripts/jp-vocab-fill-meaning-api.py --clear-all          # 清空线上单词释义
  python3 scripts/jp-vocab-fill-meaning-api.py --clear-all --dry-run
  python3 scripts/jp-vocab-fill-meaning-api.py                     # 补 1 条后退出
  python3 scripts/jp-vocab-fill-meaning-api.py --loop              # 循环：1 条 / ≥60s
"""

from __future__ import annotations

import argparse
import json
import os
import re
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

DEFAULT_API_URL = "https://finance.info-quests.com/api/jp-vocab/fill-meaning"
JISHO_URL = "https://jisho.org/api/v1/search/words?keyword="
TRANSLATE_URL = (
    "https://translate.googleapis.com/translate_a/single"
    "?client=gtx&sl=en&tl=zh-CN&dt=t&q="
)
HTTP_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)
SOURCE_LABEL = "Jisho"
DEFAULT_MIN_INTERVAL_SEC = 60
RATE_GATE_PATH = (
    Path.home() / ".config" / "info-quests" / "jp-vocab-fill-meaning.last_jisho_call"
)

MANUAL_MEANINGS: dict[str, str] = {
    "はじめまして": "初次见面",
    "失礼ですが": "打扰一下；不好意思",
    "だれ": "谁",
    "えーと": "那个…（思考时用）",
    "たいへんですね": "真不容易；好辛苦",
    "なんばん": "几号",
    "なんぷん": "几分",
    "いかがですか": "怎么样？",
    "三つ": "三个",
    "結構": "不用了；可以了",
    "～人": "表示人数",
    "イギリス": "英国",
    "ドイツ": "德国",
    "ブラジル": "巴西",
    "どようび": "星期六",
    "かようび": "星期二",
    "すいようび": "星期三",
    "やすみ": "休息；假期",
    "けさ": "今天早上",
    "あさって": "后天",
    "無理だ": "不行；做不到",
    "無理": "不行；做不到",
    "お金": "钱",
    "大家": "房东",
    "他/ほか": "其他",
    "鍵屋": "锁匠；配钥匙的店",
    "綺麗だ": "漂亮；干净",
    "一部": "一部分",
    "好きだ": "喜欢",
    "好き": "喜欢",
}

_PARENS_NOTE = re.compile(r"^(.+?)[（(][^）)]+[）)]$")
_DA_ADJ_SUFFIX = re.compile(r"^(.+)だ$")
_SURU_VERB_SUFFIX = re.compile(r"^(.+)する$")
_HAS_KANJI = re.compile(r"[\u4E00-\u9FFF]")


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
        data[key.strip()] = value.strip()
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
    cfg = {**load_env_file("jp-vocab-fill-reading.env"), **load_env_file("jp-vocab-fill.env")}
    return (cfg.get("JP_VOCAB_FILL_MEANING_URL") or DEFAULT_API_URL).strip()


def resolve_min_interval_sec() -> int:
    raw = (
        os.getenv("JP_VOCAB_FILL_MEANING_MIN_INTERVAL_SEC")
        or load_env_file("jp-vocab-fill.env").get("JP_VOCAB_FILL_MEANING_MIN_INTERVAL_SEC")
        or str(DEFAULT_MIN_INTERVAL_SEC)
    )
    try:
        return max(1, int(raw))
    except ValueError:
        return DEFAULT_MIN_INTERVAL_SEC


def acquire_rate_gate(*, allow_burst: bool) -> bool:
    """两轮最小间隔。False = 本轮不许再打。"""
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
                f"[jp-vocab-fill-meaning] rate-gate: 距上次仅 "
                f"{elapsed:.0f}s < {min_sec}s，skip（约 {wait}s 后再试）",
                flush=True,
            )
            return False
    return True


def mark_rate_gate() -> None:
    RATE_GATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    RATE_GATE_PATH.write_text(f"{time.time():.3f}\n", encoding="utf-8")


def analyze_word(word: str) -> tuple[str, str, bool]:
    w = word.strip()
    lookup = w
    m = _PARENS_NOTE.match(w)
    if m:
        lookup = m.group(1).strip()
    suffix = ""
    is_suru = False
    m = _DA_ADJ_SUFFIX.match(lookup)
    if m:
        lookup = m.group(1).strip()
        suffix = "だ"
    m = _SURU_VERB_SUFFIX.match(lookup)
    if m and _HAS_KANJI.search(m.group(1)):
        lookup = m.group(1).strip()
        suffix = "する"
        is_suru = True
    return lookup, suffix, is_suru


def pick_sense(senses: list[dict], *, prefer_verb: bool) -> dict | None:
    """取 Jisho 第一条匹配义（API 已按常用度排序）。"""
    if not senses:
        return None
    if prefer_verb:
        for sense in senses:
            pos = " ".join(sense.get("parts_of_speech") or [])
            defs = sense.get("english_definitions") or []
            joined = " ".join(defs).lower()
            if "verb" in pos.lower() or joined.startswith("to "):
                return sense
    return senses[0]


def collect_english_defs(
    senses: list[dict], *, prefer_verb: bool, max_senses: int = 3
) -> list[str]:
    """按 Jisho 顺序取最多 max_senses 个英义（常用在前）。"""
    ordered: list[dict] = []
    if prefer_verb:
        primary = pick_sense(senses, prefer_verb=True)
        if primary:
            ordered.append(primary)
    for sense in senses:
        if sense in ordered:
            continue
        ordered.append(sense)
        if len(ordered) >= max_senses:
            break
    defs: list[str] = []
    for sense in ordered[:max_senses]:
        en_list = sense.get("english_definitions") or []
        if en_list:
            defs.append(str(en_list[0]).strip())
    return [d for d in defs if d]


def lookup_jisho(
    word: str,
    *,
    prefer_verb: bool,
    cache: dict[str, tuple[list[str] | None, bool]],
    delay_sec: float,
) -> tuple[list[str] | None, bool]:
    key = f"{word}|{int(prefer_verb)}"
    if key in cache:
        return cache[key]

    url = JISHO_URL + urllib.parse.quote(word)
    req = urllib.request.Request(url, headers={"User-Agent": HTTP_USER_AGENT})
    had_error = False
    english_defs: list[str] | None = None
    try:
        ctx = ssl.create_default_context()
        with urllib.request.urlopen(req, timeout=20, context=ctx) as resp:
            payload = json.load(resp)
        for item in payload.get("data") or []:
            for jp in item.get("japanese") or []:
                surface = str(jp.get("word") or "").strip()
                reading = str(jp.get("reading") or "").strip()
                if surface == word or (not surface and reading == word):
                    english_defs = collect_english_defs(
                        item.get("senses") or [], prefer_verb=prefer_verb
                    )
                    break
            if english_defs:
                break
        if not english_defs and payload.get("data"):
            english_defs = collect_english_defs(
                payload["data"][0].get("senses") or [], prefer_verb=prefer_verb
            )
        if english_defs is not None and not english_defs:
            english_defs = None
    except Exception:
        had_error = True
        english_defs = None

    cache[key] = (english_defs, had_error)
    if delay_sec > 0:
        time.sleep(delay_sec)
    return english_defs, had_error


def translate_en(text: str, cache: dict[str, str]) -> str | None:
    text = text.strip()
    if not text:
        return None
    if text in cache:
        return cache[text]
    url = TRANSLATE_URL + urllib.parse.quote(text)
    req = urllib.request.Request(url, headers={"User-Agent": HTTP_USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            payload = json.load(resp)
        zh = "".join(part[0] for part in payload[0] if part and part[0]).strip()
    except Exception:
        return None
    cache[text] = zh
    return zh


def normalize_meaning(zh: str) -> str:
    parts: list[str] = []
    seen: set[str] = set()
    for chunk in re.split(r"[;；、,，/／]+", zh):
        item = chunk.strip().rstrip("。.")
        item = re.sub(r"^(to\s+)", "", item, flags=re.I).strip()
        if not item or item in seen:
            continue
        seen.add(item)
        parts.append(item)
        if len(parts) >= 3:
            break
    return "；".join(parts)


def infer_meaning(
    word: str,
    *,
    jisho_cache: dict[str, tuple[list[str] | None, bool]],
    translate_cache: dict[str, str],
    jisho_delay_sec: float,
) -> tuple[str | None, bool]:
    if word in MANUAL_MEANINGS:
        return MANUAL_MEANINGS[word], False

    lookup, suffix, is_suru = analyze_word(word)
    if lookup in MANUAL_MEANINGS:
        return MANUAL_MEANINGS[lookup], False

    en_defs, had_error = lookup_jisho(
        lookup,
        prefer_verb=is_suru or lookup.endswith("る"),
        cache=jisho_cache,
        delay_sec=jisho_delay_sec,
    )
    if not en_defs:
        return None, had_error

    zh_parts: list[str] = []
    for en in en_defs:
        zh = translate_en(en, translate_cache)
        if zh:
            zh_parts.append(zh)
    if not zh_parts:
        return None, had_error
    return normalize_meaning("；".join(zh_parts)), had_error


def call_api(
    *,
    api_url: str,
    token: str,
    body: dict,
) -> dict:
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
    cleared = int(payload.get("cleared") or 0)
    print(
        f"[jp-vocab-fill-meaning] clear_all "
        f"{'would clear' if dry_run else 'cleared'}={cleared}",
        flush=True,
    )
    return payload


def run_one_fill(
    *,
    api_url: str,
    token: str,
    dry_run: bool,
    jisho_delay_ms: int,
    allow_burst: bool,
) -> dict:
    if not acquire_rate_gate(allow_burst=allow_burst):
        return {"ok": True, "skipped_run": True, "reason": "rate_gate"}

    scan = call_api(
        api_url=api_url,
        token=token,
        body={"mode": "list_missing", "limit": 1},
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

    row = missing[0]
    word_id = int(row["id"])
    word = str(row["word"])
    print(
        f"[jp-vocab-fill-meaning] 待补 1/{total_missing}: id={word_id} {word!r}",
        flush=True,
    )

    jisho_cache: dict[str, tuple[list[str] | None, bool]] = {}
    translate_cache: dict[str, str] = {}
    jisho_delay_sec = max(0, jisho_delay_ms) / 1000.0
    meaning, had_error = infer_meaning(
        word,
        jisho_cache=jisho_cache,
        translate_cache=translate_cache,
        jisho_delay_sec=jisho_delay_sec,
    )
    if not meaning:
        print(
            f"  skip id={word_id} word={word!r} "
            f"reason={'jisho_error' if had_error else 'no_meaning'}",
            flush=True,
        )
        # 仍打点，避免对同一词狂打
        mark_rate_gate()
        return {
            "ok": True,
            "mode": "jisho",
            "updated": 0,
            "skipped": [{"id": word_id, "word": word}],
            "dry_run": dry_run,
        }

    print(f"  {word_id} {word!r} -> {meaning!r}", flush=True)

    if dry_run:
        mark_rate_gate()
        return {
            "ok": True,
            "mode": "jisho",
            "updated": 1,
            "applied": [{"id": word_id, "word": word, "meaning": meaning}],
            "dry_run": True,
        }

    payload = call_api(
        api_url=api_url,
        token=token,
        body={
            "mode": "apply",
            "source": SOURCE_LABEL,
            "updates": [{"word_id": word_id, "meaning": meaning, "source": SOURCE_LABEL}],
        },
    )
    mark_rate_gate()
    if not payload.get("ok"):
        raise SystemExit(f"API error: {payload.get('error', payload)}")
    print(
        f"[jp-vocab-fill-meaning] apply updated={payload.get('updated')} "
        f"source={SOURCE_LABEL}",
        flush=True,
    )
    return payload


def main() -> int:
    parser = argparse.ArgumentParser(
        description="日语释义：Jisho 限流补全（免费；≥60s/条）"
    )
    parser.add_argument("--dry-run", action="store_true", help="只预览，不写库")
    parser.add_argument("--api-url", default=None)
    parser.add_argument("--jisho-delay-ms", type=int, default=350)
    parser.add_argument(
        "--clear-all",
        action="store_true",
        help="清空线上全部单词释义（grammar 不动）",
    )
    parser.add_argument(
        "--loop",
        action="store_true",
        help="循环补全：每轮 1 条，间隔 ≥60s，直到无缺失",
    )
    parser.add_argument(
        "--max-rounds",
        type=int,
        default=0,
        help="--loop 时最多轮数（0=不限，直到补完）",
    )
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
                jisho_delay_ms=args.jisho_delay_ms,
                allow_burst=args.allow_burst,
            )
            missing_left = result.get("total_missing")
            if result.get("skipped_run") and result.get("reason") == "rate_gate":
                print(f"[jp-vocab-fill-meaning] 等待 {min_sec}s…", flush=True)
                time.sleep(min_sec)
                continue
            # 再扫一次看是否还有缺
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
        jisho_delay_ms=args.jisho_delay_ms,
        allow_burst=args.allow_burst,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
