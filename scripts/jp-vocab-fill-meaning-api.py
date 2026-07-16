#!/usr/bin/env python3
"""通过线上 API 补全 jp_vocab_word 缺失释义（Mac 本地查 Jisho + 翻译，再通过 API 写库）。"""

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

MANUAL_MEANINGS: dict[str, str] = {
    "はじめまして": "初次见面",
    "失礼ですが": "打扰一下／不好意思",
    "だれ": "谁",
    "えーと": "那个…（思考时用）",
    "たいへんですね": "真不容易／好辛苦",
    "なんばん": "几号",
    "なんぷん": "几分",
    "いかがですか": "怎么样？",
    "三つ": "三个",
    "結構": "不用了／可以了",
    "～人": "表示人数",
    "イギリス": "英国",
    "ドイツ": "德国",
    "ブラジル": "巴西",
    "どようび": "星期六",
    "かようび": "星期二",
    "すいようび": "星期三",
    "やすみ": "休息／假期",
    "けさ": "今天早上",
    "あさって": "后天",
    "無理だ": "不行／做不到",
    "無理": "不行／做不到",
    "お金": "钱",
    "大家": "房东",
    "他/ほか": "其他",
    "鍵屋": "锁匠／配钥匙的店",
    "綺麗だ": "漂亮／干净",
    "一部": "一部分",
    "好きだ": "喜欢",
    "好き": "喜欢",
    # 语法点标题（库内 kind=grammar；仅空白才写入）
    "て形变形": "动词て形的变化规则",
    "～ばかり": "刚刚……；只是……",
    "～に来る": "来做……",
    "ない形变形": "动词ない形（否定形）的变化规则",
    "～なければならない": "必须……／不得不……",
    "～たら": "如果……；……之后",
    "～てくる": "……起来；……过来",
    "形容词变否定": "い／な形容词的否定变化",
    "形容词修饰动词变形规则": "形容词修饰动词时的形态变化",
    "形容词变过去式": "い／な形容词的过去式变化",
    "自动词与他动词的区分": "自动词与他动词的区别",
    "何（なん／なに）的用法": "「なん」与「なに」的用法区别",
    "动词变ます形规则": "动词ます形（礼貌形）的变化规则",
    "动词变否定": "动词否定形的变化规则",
    "动词+こと/动词名词化": "动词后接「こと」表示名词化",
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
        raise SystemExit("缺少 JP_REVIEW_UPLOAD_TOKEN（~/.config/info-quests/jp-review-sync.env）")
    return token


def load_api_url() -> str:
    cfg = load_env_file("jp-vocab-fill-reading.env")
    return (cfg.get("JP_VOCAB_FILL_MEANING_URL") or DEFAULT_API_URL).strip()


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


def lookup_jisho(
    word: str,
    *,
    prefer_verb: bool,
    cache: dict[str, tuple[str | None, bool]],
    delay_sec: float,
) -> tuple[str | None, bool]:
    key = f"{word}|{int(prefer_verb)}"
    if key in cache:
        return cache[key]

    url = JISHO_URL + urllib.parse.quote(word)
    req = urllib.request.Request(url, headers={"User-Agent": HTTP_USER_AGENT})
    had_error = False
    english: str | None = None
    try:
        ctx = ssl.create_default_context()
        with urllib.request.urlopen(req, timeout=20, context=ctx) as resp:
            payload = json.load(resp)
        for item in payload.get("data") or []:
            for jp in item.get("japanese") or []:
                surface = str(jp.get("word") or "").strip()
                reading = str(jp.get("reading") or "").strip()
                if surface == word or (not surface and reading == word):
                    sense = pick_sense(item.get("senses") or [], prefer_verb=prefer_verb)
                    if sense:
                        defs = sense.get("english_definitions") or []
                        english = "; ".join(defs[:3])
                    break
            if english:
                break
        if not english and payload.get("data"):
            sense = pick_sense(payload["data"][0].get("senses") or [], prefer_verb=prefer_verb)
            if sense:
                defs = sense.get("english_definitions") or []
                english = "; ".join(defs[:3])
    except Exception:
        had_error = True
        english = None

    cache[key] = (english, had_error)
    if delay_sec > 0:
        time.sleep(delay_sec)
    return english, had_error


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
        if not item or item in seen:
            continue
        seen.add(item)
        parts.append(item)
    return "；".join(parts[:3])


def infer_meaning(
    word: str,
    *,
    jisho_cache: dict[str, tuple[str | None, bool]],
    translate_cache: dict[str, str],
    jisho_delay_sec: float,
) -> tuple[str | None, bool]:
    if word in MANUAL_MEANINGS:
        return MANUAL_MEANINGS[word], False

    lookup, suffix, is_suru = analyze_word(word)
    if lookup in MANUAL_MEANINGS:
        meaning = MANUAL_MEANINGS[lookup]
        if suffix == "だ" and not meaning.endswith("だ"):
            return meaning, False
        return meaning, False

    english, had_error = lookup_jisho(
        lookup,
        prefer_verb=is_suru or lookup.endswith("る"),
        cache=jisho_cache,
        delay_sec=jisho_delay_sec,
    )
    if not english:
        return None, had_error

    zh = translate_en(english, translate_cache)
    if not zh:
        return None, had_error
    return normalize_meaning(zh), had_error


def call_api(
    *,
    api_url: str,
    token: str,
    dry_run: bool,
    updates: list[dict] | None,
) -> dict:
    body: dict = {"dry_run": dry_run}
    if updates is not None:
        body["updates"] = updates
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


def print_result(payload: dict) -> None:
    if not payload.get("ok"):
        raise SystemExit(f"API error: {payload.get('error', payload)}")

    mode = payload.get("mode", "scan")
    print(f"[jp-vocab-fill-meaning-api] mode={mode}", flush=True)

    for item in payload.get("applied") or []:
        print(
            f"  {item.get('id')} {item.get('word')!r} -> {item.get('meaning')!r}",
            flush=True,
        )

    skipped = payload.get("skipped") or []
    if skipped:
        parts = [f"{x.get('id')}:{x.get('word')!r}" for x in skipped]
        print(f"  未更新: {', '.join(parts)}", flush=True)

    updated = int(payload.get("updated") or 0)
    dry_run = bool(payload.get("dry_run"))
    print(
        f"[jp-vocab-fill-meaning-api] done, "
        f"{'would update' if dry_run else 'updated'}: {updated}",
        flush=True,
    )


def run_fill(
    *,
    api_url: str,
    token: str,
    dry_run: bool,
    jisho_delay_ms: int,
    manual_updates: list[dict] | None,
) -> dict:
    if manual_updates:
        payload = call_api(
            api_url=api_url,
            token=token,
            dry_run=dry_run,
            updates=manual_updates,
        )
        print_result(payload)
        return payload

    scan = call_api(api_url=api_url, token=token, dry_run=True, updates=None)
    if not scan.get("ok"):
        raise SystemExit(f"API error: {scan.get('error', scan)}")

    missing = scan.get("missing") or []
    if not missing:
        print("[jp-vocab-fill-meaning-api] 无缺失释义的单词", flush=True)
        return scan

    print(f"[jp-vocab-fill-meaning-api] 待补全 {len(missing)} 条", flush=True)

    jisho_cache: dict[str, tuple[str | None, bool]] = {}
    translate_cache: dict[str, str] = {}
    jisho_delay_sec = max(0, jisho_delay_ms) / 1000.0
    updates: list[dict] = []
    skipped: list[dict] = []
    jisho_errors = 0

    for row in missing:
        word_id = int(row["id"])
        word = str(row["word"])
        meaning, had_error = infer_meaning(
            word,
            jisho_cache=jisho_cache,
            translate_cache=translate_cache,
            jisho_delay_sec=jisho_delay_sec,
        )
        if had_error:
            jisho_errors += 1
        if not meaning:
            skipped.append({"id": word_id, "word": word})
            continue
        print(f"  {word_id} {word!r} -> {meaning!r}", flush=True)
        updates.append({"word_id": word_id, "meaning": meaning})

    if dry_run:
        return {
            "ok": True,
            "mode": "local-jisho",
            "updated": len(updates),
            "applied": [
                {
                    "id": u["word_id"],
                    "word": next(str(x["word"]) for x in missing if int(x["id"]) == u["word_id"]),
                    "meaning": u["meaning"],
                }
                for u in updates
            ],
            "skipped": skipped,
            "jisho_errors": jisho_errors,
            "dry_run": True,
        }

    if not updates:
        print("[jp-vocab-fill-meaning-api] 无可写入释义", flush=True)
        return {
            "ok": True,
            "mode": "local-jisho",
            "updated": 0,
            "applied": [],
            "skipped": skipped,
            "jisho_errors": jisho_errors,
            "dry_run": False,
        }

    payload = call_api(api_url=api_url, token=token, dry_run=False, updates=updates)
    payload["mode"] = "local-jisho"
    payload["jisho_errors"] = jisho_errors
    print_result(payload)
    return payload


def parse_manual_updates(raw: str) -> list[dict]:
    updates: list[dict] = []
    for chunk in raw.split(","):
        chunk = chunk.strip()
        if not chunk or ":" not in chunk:
            continue
        word_id, meaning = chunk.split(":", 1)
        updates.append({"word_id": int(word_id), "meaning": meaning.strip()})
    return updates


def main() -> int:
    parser = argparse.ArgumentParser(description="补全日语单词缺失释义")
    parser.add_argument("--dry-run", action="store_true", help="只预览，不写库")
    parser.add_argument("--api-url", default=load_api_url())
    parser.add_argument("--jisho-delay-ms", type=int, default=350)
    parser.add_argument(
        "--update",
        action="append",
        default=[],
        help="手动指定 word_id:释义，可重复",
    )
    args = parser.parse_args()

    token = load_token()
    manual_updates = None
    if args.update:
        manual_updates = []
        for item in args.update:
            manual_updates.extend(parse_manual_updates(item))

    run_fill(
        api_url=args.api_url,
        token=token,
        dry_run=args.dry_run,
        jisho_delay_ms=args.jisho_delay_ms,
        manual_updates=manual_updates,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
