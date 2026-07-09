#!/usr/bin/env python3
"""通过线上 API 补全 jp_vocab_word 缺失读音（Mac nightly / 手动均可）。

Jisho 在 Cloudflare Worker 上常被拒，因此默认在 Mac 本地查 Jisho，再通过 API 写库。
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

DEFAULT_API_URL = "https://finance.info-quests.com/api/jp-vocab/fill-reading"
JISHO_URL = "https://jisho.org/api/v1/search/words?keyword="
HTTP_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

MANUAL_READINGS: dict[str, str] = {
    "一つ": "ひとつ",
    "二つ": "ふたつ",
    "始まる": "はじまる",
    "怒る": "おこる",
    "守る": "まもる",
    "悪い": "わるい",
    "無理だ": "むりだ",
    "座る": "すわる",
    "薬局": "やっきょく",
    "暑い": "あつい",
    "見る": "みる",
    "お金": "おかね",
    "事": "こと",
    "大家": "おおや",
    "他/ほか": "ほか",
    "最近": "さいきん",
    "働く": "はたらく",
    "昼ごはん": "ひるごはん",
    "手": "て",
    "鍵屋": "かぎや",
    "綺麗だ": "きれいだ",
    "寝る": "ねる",
    "水道": "すいどう",
    "約束": "やくそく",
    "一部": "いちぶ",
    "悲しい": "かなしい",
    "閉める": "しめる",
    "食事する": "しょくじする",
    "見せる": "みせる",
    "生活": "せいかつ",
    "好き": "すき",
    "好きだ": "すきだ",
}

_KANA_OR_MARK = re.compile(r"^[\u3040-\u309F\u30A0-\u30FFー～〜/\s]+$")
_HAS_KANJI = re.compile(r"[\u4E00-\u9FFF]")
_PARENS_NOTE = re.compile(r"^(.+?)[（(][^）)]+[）)]$")
_DA_ADJ_SUFFIX = re.compile(r"^(.+)だ$")
_SURU_VERB_SUFFIX = re.compile(r"^(.+)する$")
_SKIP_PHRASE = re.compile(r"(します|ください|てください|お願い)")
_MAX_AUTO_READING_CHARS = 9


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


def load_config() -> dict[str, str]:
    return load_env_file("jp-vocab-fill-reading.env")


def resolve_token(review_cfg: dict[str, str]) -> str:
    """与 jp-review-sync.py 共用 ~/.config/info-quests/jp-review-sync.env 里的 Token。"""
    return (
        os.environ.get("JP_REVIEW_UPLOAD_TOKEN")
        or review_cfg.get("JP_REVIEW_UPLOAD_TOKEN", "")
    ).strip()


def build_ssl_context() -> ssl.SSLContext | None:
    cafile = os.environ.get("SSL_CERT_FILE", "").strip()
    capath = os.environ.get("SSL_CERT_DIR", "").strip()
    if cafile or capath:
        return ssl.create_default_context(cafile=cafile or None, capath=capath or None)

    try:
        import certifi  # type: ignore

        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        return None


_SSL_CONTEXT = build_ssl_context()


def call_api(
    *,
    api_url: str,
    token: str,
    dry_run: bool,
    use_jisho: bool,
    jisho_delay_ms: int,
    updates: list[dict] | None,
) -> dict:
    payload: dict = {
        "dry_run": dry_run,
        "use_jisho": use_jisho,
        "jisho_delay_ms": jisho_delay_ms,
    }
    if updates:
        payload["updates"] = updates

    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        api_url,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": HTTP_USER_AGENT,
            "Accept": "application/json",
        },
    )

    try:
        with urllib.request.urlopen(request, timeout=300, context=_SSL_CONTEXT) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        detail = err.read().decode("utf-8", errors="replace")
        raise SystemExit(f"API HTTP {err.code}: {detail}") from err


def analyze_word(word: str) -> tuple[str, str, str | None]:
    w = word.strip()
    if not w:
        return w, "", "empty"
    if len(w) > _MAX_AUTO_READING_CHARS or _SKIP_PHRASE.search(w):
        return w, "", "long_phrase"

    lookup = w
    m = _PARENS_NOTE.match(w)
    if m:
        lookup = m.group(1).strip()

    suffix = ""
    da_match = _DA_ADJ_SUFFIX.match(lookup)
    if da_match:
        lookup = da_match.group(1).strip()
        suffix = "だ"

    return lookup, suffix, None


def attach_reading_suffix(reading: str, suffix: str) -> str:
    if not suffix:
        return reading
    if reading.endswith(suffix):
        return reading
    return reading + suffix


def lookup_jisho(
    word: str,
    cache: dict[str, str | None],
    delay_sec: float,
) -> tuple[str | None, bool]:
    if word in cache:
        return cache[word], False

    query = urllib.parse.quote(word.strip())
    req = urllib.request.Request(
        JISHO_URL + query,
        headers={"User-Agent": HTTP_USER_AGENT},
    )
    reading: str | None = None
    had_error = False
    try:
        with urllib.request.urlopen(req, timeout=20, context=_SSL_CONTEXT) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        for item in payload.get("data") or []:
            for jp in item.get("japanese") or []:
                surface = str(jp.get("word") or "").strip()
                kana = str(jp.get("reading") or "").strip()
                if surface == word and kana:
                    reading = kana
                    break
                if not surface and kana == word:
                    reading = kana
                    break
            if reading:
                break
        if not reading:
            for item in payload.get("data") or []:
                for jp in item.get("japanese") or []:
                    surface = str(jp.get("word") or "").strip()
                    kana = str(jp.get("reading") or "").strip()
                    if surface == word:
                        reading = kana or surface
                        break
                    if kana and kana == word:
                        reading = kana
                        break
                if reading:
                    break
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError) as err:
        print(f"  jisho lookup failed for {word!r}: {err}", flush=True)
        had_error = True
        cache[word] = None
        return None, had_error

    cache[word] = reading
    if delay_sec > 0:
        time.sleep(delay_sec)
    return reading, had_error


def infer_reading(
    word: str,
    *,
    use_jisho: bool,
    jisho_cache: dict[str, str | None],
    jisho_delay_sec: float,
) -> tuple[str | None, str | None, bool]:
    lookup, suffix, skip_reason = analyze_word(word)
    if skip_reason:
        return None, skip_reason, False

    suru_suffix = ""
    suru_match = _SURU_VERB_SUFFIX.match(lookup)
    if suru_match and _HAS_KANJI.search(suru_match.group(1)):
        lookup = suru_match.group(1).strip()
        suru_suffix = "する"

    if word in MANUAL_READINGS:
        return MANUAL_READINGS[word], None, False
    if lookup in MANUAL_READINGS:
        return attach_reading_suffix(MANUAL_READINGS[lookup], suffix), None, False

    if _KANA_OR_MARK.fullmatch(lookup):
        return attach_reading_suffix(lookup, suffix), None, False

    reading: str | None
    jisho_error = False
    if _HAS_KANJI.search(lookup):
        if use_jisho:
            reading, jisho_error = lookup_jisho(lookup, jisho_cache, jisho_delay_sec)
        else:
            reading = None
    else:
        reading = lookup

    if not reading:
        return None, None, jisho_error
    return attach_reading_suffix(reading, suffix) + suru_suffix, None, jisho_error


def print_result(payload: dict) -> None:
    if not payload.get("ok"):
        raise SystemExit(f"API error: {payload.get('error', payload)}")

    mode = payload.get("mode", "auto")
    print(f"[jp-vocab-fill-reading-api] mode={mode}", flush=True)

    for item in payload.get("applied") or []:
        print(
            f"  {item.get('id')} {item.get('word')!r} -> {item.get('reading')!r}",
            flush=True,
        )

    skipped_long = payload.get("skipped_long") or []
    if skipped_long:
        parts = [f"{x.get('id')}:{x.get('word')!r}" for x in skipped_long]
        print(f"  长句/短语跳过: {', '.join(parts)}", flush=True)

    skipped = payload.get("skipped") or []
    if skipped:
        parts = [f"{x.get('id')}:{x.get('word')!r}" for x in skipped]
        print(f"  无法推断/未更新: {', '.join(parts)}", flush=True)

    jisho_errors = int(payload.get("jisho_errors") or 0)
    if jisho_errors:
        print(f"  jisho 网络失败: {jisho_errors} 次", flush=True)

    updated = int(payload.get("updated") or 0)
    dry_run = bool(payload.get("dry_run"))
    print(
        f"[jp-vocab-fill-reading-api] done, "
        f"{'would update' if dry_run else 'updated'}: {updated}",
        flush=True,
    )


def run_local_jisho_fill(
    *,
    api_url: str,
    token: str,
    dry_run: bool,
    use_jisho: bool,
    jisho_delay_ms: int,
    manual_updates: list[dict] | None,
) -> dict:
    if manual_updates:
        return call_api(
            api_url=api_url,
            token=token,
            dry_run=dry_run,
            use_jisho=False,
            jisho_delay_ms=jisho_delay_ms,
            updates=manual_updates,
        )

    scan = call_api(
        api_url=api_url,
        token=token,
        dry_run=True,
        use_jisho=False,
        jisho_delay_ms=0,
        updates=None,
    )
    if not scan.get("ok"):
        raise SystemExit(f"API error: {scan.get('error', scan)}")

    skipped_long = scan.get("skipped_long") or []
    pending = scan.get("skipped") or []
    if not pending and not skipped_long:
        print("[jp-vocab-fill-reading-api] mode=local-jisho", flush=True)
        print("  无缺失读音的词条", flush=True)
        return {
            "ok": True,
            "mode": "local-jisho",
            "updated": 0,
            "applied": [],
            "skipped": [],
            "skipped_long": skipped_long,
            "jisho_errors": 0,
            "dry_run": dry_run,
        }

    jisho_cache: dict[str, str | None] = {}
    jisho_delay_sec = max(0, jisho_delay_ms) / 1000.0
    updates: list[dict] = []
    still_skipped: list[dict] = []
    jisho_errors = 0

    print("[jp-vocab-fill-reading-api] mode=local-jisho", flush=True)
    for item in pending:
        word_id = int(item["id"])
        word = str(item["word"])
        reading, _skip_reason, jisho_error = infer_reading(
            word,
            use_jisho=use_jisho,
            jisho_cache=jisho_cache,
            jisho_delay_sec=jisho_delay_sec if use_jisho else 0.0,
        )
        if jisho_error:
            jisho_errors += 1
        if not reading:
            still_skipped.append({"id": word_id, "word": word})
            continue
        print(f"  {word_id} {word!r} -> {reading!r}", flush=True)
        updates.append({"word_id": word_id, "reading": reading})

    if dry_run or not updates:
        return {
            "ok": True,
            "mode": "local-jisho",
            "updated": len(updates),
            "applied": [
                {"id": u["word_id"], "word": next(
                    (str(x["word"]) for x in pending if int(x["id"]) == u["word_id"]),
                    "",
                ), "reading": u["reading"]}
                for u in updates
            ],
            "skipped": still_skipped,
            "skipped_long": skipped_long,
            "jisho_errors": jisho_errors,
            "dry_run": True,
        }

    return call_api(
        api_url=api_url,
        token=token,
        dry_run=False,
        use_jisho=False,
        jisho_delay_ms=0,
        updates=updates,
    )


def main() -> int:
    review_cfg = load_env_file("jp-review-sync.env")
    cfg = load_config()
    parser = argparse.ArgumentParser(description="Fill jp_vocab reading via Cloudflare API.")
    parser.add_argument(
        "--api-url",
        default=cfg.get("JP_VOCAB_FILL_READING_URL", DEFAULT_API_URL),
    )
    parser.add_argument(
        "--token",
        default=resolve_token(review_cfg),
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--no-jisho",
        action="store_true",
        help="不查 Jisho，仅用规则/人工表推断",
    )
    parser.add_argument(
        "--server-jisho",
        action="store_true",
        help="在 Cloudflare Worker 上查 Jisho（通常不可用，仅调试）",
    )
    parser.add_argument(
        "--jisho-delay-ms",
        type=int,
        default=int(cfg.get("JP_VOCAB_FILL_READING_JISHO_DELAY_MS", "350") or 350),
    )
    parser.add_argument(
        "--allow-skipped",
        action="store_true",
        help="仍有无法推断的词条时也返回 0（适合 nightly 定时任务）",
    )
    parser.add_argument(
        "--update",
        action="append",
        metavar="WORD_ID:READING",
        help="手动指定读音，可重复；指定后仅提交这些更新",
    )
    args = parser.parse_args()

    if not args.token:
        print(
            "请设置 Bearer Token（与日语教案上传共用）：\n"
            "  1) ~/.config/info-quests/jp-review-sync.env 中 JP_REVIEW_UPLOAD_TOKEN=...\n"
            "  2) 或环境变量 JP_REVIEW_UPLOAD_TOKEN",
            file=sys.stderr,
        )
        return 1

    manual_updates: list[dict] | None = None
    if args.update:
        manual_updates = []
        for raw in args.update:
            if ":" not in raw:
                print(f"无效 --update 格式（应为 id:reading）: {raw!r}", file=sys.stderr)
                return 1
            word_id_raw, reading = raw.split(":", 1)
            try:
                word_id = int(word_id_raw.strip())
            except ValueError:
                print(f"无效 word_id: {word_id_raw!r}", file=sys.stderr)
                return 1
            if word_id <= 0 or not reading.strip():
                print(f"无效 --update: {raw!r}", file=sys.stderr)
                return 1
            manual_updates.append({"word_id": word_id, "reading": reading.strip()})

    if args.server_jisho and not manual_updates:
        payload = call_api(
            api_url=args.api_url,
            token=args.token,
            dry_run=args.dry_run,
            use_jisho=not args.no_jisho,
            jisho_delay_ms=max(0, args.jisho_delay_ms),
            updates=None,
        )
    else:
        payload = run_local_jisho_fill(
            api_url=args.api_url,
            token=args.token,
            dry_run=args.dry_run,
            use_jisho=not args.no_jisho,
            jisho_delay_ms=max(0, args.jisho_delay_ms),
            manual_updates=manual_updates,
        )

    print_result(payload)

    jisho_errors = int(payload.get("jisho_errors") or 0)
    skipped = payload.get("skipped") or []
    if jisho_errors and not args.allow_skipped:
        return 1
    if skipped and not args.allow_skipped:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
