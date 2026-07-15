#!/usr/bin/env python3
"""为线上已有日语例句补中文译义，并统一成：

日语句
译文：……

写回 D1（默认 remote）。缺 OPENAI 时用 MyMemory 机翻作参考译。
"""

from __future__ import annotations

import argparse
import json
import os
import re
import ssl
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GLOSS_LABEL = "译文："
KANA_RE = re.compile(r"[\u3040-\u309F\u30A0-\u30FF]")
HAN_RE = re.compile(r"[\u4E00-\u9FFF]")
LEAD_RE = re.compile(r"^\s*\d+[.,、．)\]]\s*")
GLOSS_PREFIX_RE = re.compile(r"^(译文|翻譯|翻译|译|譯)\s*[:：]\s*")
FURIGANA_RE = re.compile(r"\([ぁ-んァ-ンー]+\)")


def build_ssl_context() -> ssl.SSLContext | None:
    try:
        import certifi  # type: ignore

        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        return None


_SSL = build_ssl_context()


def is_japanese_line(text: str) -> bool:
    t = GLOSS_PREFIX_RE.sub("", text).strip()
    if GLOSS_PREFIX_RE.match(text.strip()):
        return False
    kana = len(KANA_RE.findall(t))
    if kana == 0:
        return False
    han = len(HAN_RE.findall(t))
    if han >= 2 and kana > 0 and han >= kana * 3:
        return False
    return True


def is_gloss_line(text: str) -> bool:
    if not text.strip():
        return False
    if GLOSS_PREFIX_RE.match(text.strip()):
        return True
    if is_japanese_line(text):
        return False
    body = GLOSS_PREFIX_RE.sub("", text).strip()
    kana = len(KANA_RE.findall(body))
    han = len(HAN_RE.findall(body))
    return han > 0 and kana == 0


def parse_items(raw: str) -> list[tuple[str, list[str]]]:
    lines = [LEAD_RE.sub("", x).strip() for x in raw.splitlines() if x.strip()]
    items: list[tuple[str, list[str]]] = []
    for line in lines:
        if items and is_gloss_line(line):
            items[-1][1].append(line)
            continue
        items.append((line, []))
    return items


def format_gloss(text: str) -> str:
    body = GLOSS_PREFIX_RE.sub("", text).strip()
    return f"{GLOSS_LABEL}{body}" if body else ""


def serialize_items(items: list[tuple[str, list[str]]]) -> str:
    blocks: list[str] = []
    for jp, glosses in items:
        jp = jp.strip()
        if not jp:
            continue
        gloss_lines = [format_gloss(g) for g in glosses if format_gloss(g)]
        if gloss_lines:
            blocks.append(jp + "\n" + "\n".join(gloss_lines))
        else:
            blocks.append(jp)
    return "\n".join(blocks)


def translate_mymemory(text: str) -> str:
    # Strip furigana markers for cleaner MT
    q = FURIGANA_RE.sub("", text).strip()
    url = "https://api.mymemory.translated.net/get?" + urllib.parse.urlencode(
        {"q": q, "langpair": "ja|zh-CN"}
    )
    req = urllib.request.Request(url, headers={"User-Agent": "jp-vocab-fill-gloss/1.0"})
    with urllib.request.urlopen(req, timeout=30, context=_SSL) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    translated = str(payload.get("responseData", {}).get("translatedText") or "").strip()
    if not translated or translated.lower() == q.lower():
        raise RuntimeError(f"empty translation for {q!r}")
    # Avoid returning English error blobs
    if "MYMEMORY WARNING" in translated.upper():
        raise RuntimeError(translated)
    return translated


def translate_google(text: str) -> str:
    q = FURIGANA_RE.sub("", text).strip()
    url = "https://translate.googleapis.com/translate_a/single?" + urllib.parse.urlencode(
        {
            "client": "gtx",
            "sl": "ja",
            "tl": "zh-CN",
            "dt": "t",
            "q": q,
        }
    )
    req = urllib.request.Request(url, headers={"User-Agent": "jp-vocab-fill-gloss/1.0"})
    with urllib.request.urlopen(req, timeout=20, context=_SSL) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    parts = []
    for chunk in payload[0] or []:
        if chunk and chunk[0]:
            parts.append(str(chunk[0]))
    translated = "".join(parts).strip()
    if not translated:
        raise RuntimeError(f"empty google translation for {q!r}")
    return translated


def translate_with_fallback(text: str, *, engine: str, api_key: str, model: str) -> str:
    errors: list[str] = []
    order: list[str]
    if engine == "openai":
        order = ["openai", "google", "mymemory"]
    elif engine == "mymemory":
        order = ["mymemory", "google"]
    elif engine == "google":
        order = ["google", "mymemory"]
    else:
        order = ["google", "mymemory"]

    for name in order:
        try:
            if name == "openai":
                if not api_key:
                    continue
                return translate_openai(text, api_key=api_key, model=model)
            if name == "google":
                return translate_google(text)
            if name == "mymemory":
                return translate_mymemory(text)
        except Exception as err:  # noqa: BLE001
            errors.append(f"{name}:{err}")
    raise RuntimeError("; ".join(errors) or "no engine")


def translate_openai(text: str, *, api_key: str, model: str) -> str:
    body = json.dumps(
        {
            "model": model,
            "messages": [
                {
                    "role": "system",
                    "content": "你是日语教师。把日语短句译成简洁中文，只输出译文正文，不要序号、不要「译文」标签、不要解释。",
                },
                {"role": "user", "content": text},
            ],
            "max_tokens": 120,
            "temperature": 0.2,
        },
        ensure_ascii=False,
    ).encode("utf-8")
    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60, context=_SSL) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    return str(payload["choices"][0]["message"]["content"]).strip()


def d1_query_all(remote: bool) -> list[dict]:
    cmd = [
        "npx",
        "wrangler",
        "d1",
        "execute",
        "strategy-compare-db",
        "--json",
        "--command",
        "SELECT id, word, example_sentences FROM jp_vocab_word WHERE example_sentences IS NOT NULL AND TRIM(example_sentences) != '' ORDER BY id",
        "--remote" if remote else "--local",
    ]
    proc = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    if proc.returncode != 0:
        raise SystemExit(proc.stderr or proc.stdout or "wrangler failed")
    payload = json.loads(proc.stdout)
    return payload[0]["results"]


def sql_escape(value: str) -> str:
    return value.replace("'", "''")


def main() -> int:
    parser = argparse.ArgumentParser(description="补全日语例句中文译义")
    parser.add_argument("--local", action="store_true", help="写本地 D1，默认 remote")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, default=0, help="最多处理多少词条，0=全部")
    parser.add_argument("--delay-ms", type=int, default=120)
    parser.add_argument("--engine", choices=("auto", "google", "mymemory", "openai"), default="auto")
    parser.add_argument(
        "--model",
        default=os.environ.get("JP_VOCAB_FILL_EXAMPLE_AI_MODEL", "gpt-4o-mini"),
    )
    parser.add_argument(
        "--only-normalize",
        action="store_true",
        help="只给已有译义加「译文：」，不机翻",
    )
    args = parser.parse_args()
    remote = not args.local

    openai_key = os.environ.get("OPENAI_API_KEY", "").strip()
    engine = args.engine
    if engine == "auto":
        engine = "openai" if openai_key else "google"
    if engine == "openai" and not openai_key:
        print("缺少 OPENAI_API_KEY", file=sys.stderr)
        return 1

    print(f"[fill-gloss] fetching rows… engine={engine} remote={remote}", flush=True)
    rows = d1_query_all(remote=remote)
    print(f"[fill-gloss] loaded={len(rows)}", flush=True)
    updates: list[tuple[int, str, str]] = []  # id, word, next
    skipped: list[str] = []
    translate_count = 0
    delay_sec = max(0, args.delay_ms) / 1000.0
    cache: dict[str, str] = {}

    for row in rows:
        word_id = int(row["id"])
        word = str(row["word"])
        raw = str(row["example_sentences"] or "")
        items = parse_items(raw)
        if not items:
            continue

        changed = False
        next_items: list[tuple[str, list[str]]] = []
        for jp, glosses in items:
            if glosses:
                labeled = [format_gloss(g) for g in glosses if format_gloss(g)]
                if labeled != glosses:
                    changed = True
                next_items.append((jp, labeled))
                continue
            if args.only_normalize:
                next_items.append((jp, glosses))
                continue
            try:
                if jp in cache:
                    zh = cache[jp]
                else:
                    zh = translate_with_fallback(
                        jp, engine=engine, api_key=openai_key, model=args.model
                    )
                    cache[jp] = zh
                    translate_count += 1
                    if delay_sec:
                        time.sleep(delay_sec)
                zh = GLOSS_PREFIX_RE.sub("", zh).strip()
                if not zh:
                    raise RuntimeError("blank zh")
                next_items.append((jp, [format_gloss(zh)]))
                changed = True
            except Exception as err:  # noqa: BLE001
                skipped.append(f"{word_id}:{word}:{err}")
                print(f"  skip {word_id} {word!r}: {err}", flush=True)
                next_items.append((jp, glosses))

        if not changed:
            continue
        serialized = serialize_items(next_items)
        if serialized.strip() == raw.strip():
            continue
        updates.append((word_id, word, serialized))
        print(
            f"  [{len(updates)}] {word_id} {word}: {serialized.replace(chr(10), ' / ')}",
            flush=True,
        )
        if args.limit > 0 and len(updates) >= args.limit:
            break

    print(
        f"[fill-gloss] candidates={len(updates)} translated_lines≈{translate_count} "
        f"skipped={len(skipped)} engine={engine} remote={remote}",
        flush=True,
    )
    if skipped[:10]:
        print("[fill-gloss] skip samples:", flush=True)
        for s in skipped[:10]:
            print(f"  {s}", flush=True)

    if args.dry_run or not updates:
        return 0 if not skipped else 1

    sql_path = Path("/tmp/jp-vocab-fill-gloss.sql")
    lines = []
    for word_id, _word, serialized in updates:
        lines.append(
            "UPDATE jp_vocab_word SET example_sentences = '"
            + sql_escape(serialized)
            + "', updated_at = datetime('now') WHERE id = "
            + str(word_id)
            + ";"
        )
    sql_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"[fill-gloss] wrote {sql_path} ({len(updates)} updates)", flush=True)

    # D1 remote 不支持 BEGIN/COMMIT；按批提交
    import re as _re

    stmts = _re.findall(
        r"UPDATE jp_vocab_word SET example_sentences = '.*?', updated_at = datetime\('now'\) WHERE id = \d+;",
        sql_path.read_text(encoding="utf-8"),
        flags=_re.S,
    )
    batch_size = 20
    applied = 0
    for i in range(0, len(stmts), batch_size):
        batch = stmts[i : i + batch_size]
        chunk_path = Path(f"/tmp/jp-gloss-apply-{i}.sql")
        chunk_path.write_text("\n".join(batch) + "\n", encoding="utf-8")
        cmd = [
            "npx",
            "wrangler",
            "d1",
            "execute",
            "strategy-compare-db",
            "--file",
            str(chunk_path),
            "-y",
            "--remote" if remote else "--local",
        ]
        print(
            f"[fill-gloss] apply batch {i // batch_size + 1}/{(len(stmts) + batch_size - 1) // batch_size} "
            f"({len(batch)})",
            flush=True,
        )
        proc = subprocess.run(cmd, cwd=ROOT)
        if proc.returncode != 0:
            return proc.returncode
        applied += len(batch)
        time.sleep(0.4)

    print(
        f"[fill-gloss] done, updated={applied} skipped={len(skipped)}",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
