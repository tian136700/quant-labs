#!/usr/bin/env python3
"""通过 OpenAI 为缺失例句的 jp_vocab_word 生成 N5/N4 口语例句（Mac 手动 / 定时均可）。

流程：先可选跑内置词表 → 扫描仍缺例句的词条 → OpenAI 生成（汉字旁括号假名 + 中文译义）→ API 写库。
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
import urllib.request
from pathlib import Path

DEFAULT_API_URL = "https://finance.info-quests.com/api/jp-vocab/fill-example-sentences"
DEFAULT_MODEL = "gpt-4o-mini"

KANA_RE = re.compile(r"[\u3040-\u309F\u30A0-\u30FF]")
HAN_RE = re.compile(r"[\u4E00-\u9FFF]")
KANJI_FURIGANA_RE = re.compile(r"[\u4E00-\u9FFF]\([ぁ-んァ-ンー]+\)")
LEADING_INDEX_RE = re.compile(r"^\s*\d+[.、．)\]]\s*")


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


def resolve_token() -> str:
    return (
        os.environ.get("JP_REVIEW_UPLOAD_TOKEN", "").strip()
        or load_env_file("jp-review-sync.env").get("JP_REVIEW_UPLOAD_TOKEN", "")
    ).strip()


def resolve_openai_key() -> str:
    return os.environ.get("OPENAI_API_KEY", "").strip()


def resolve_api_url() -> str:
    return (
        os.environ.get("JP_VOCAB_FILL_EXAMPLE_SENTENCES_URL", "").strip()
        or DEFAULT_API_URL
    )


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


_SSL = build_ssl_context()


def call_api(
    *,
    api_url: str,
    token: str,
    payload: dict,
    timeout: int = 180,
) -> dict:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        api_url,
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
            "User-Agent": "jp-vocab-fill-example-sentences-ai/1.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=_SSL) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        detail = err.read().decode("utf-8", errors="replace")
        raise SystemExit(f"API HTTP {err.code}: {detail}") from err


def is_japanese_line(text: str) -> bool:
    kana = len(KANA_RE.findall(text))
    if kana == 0:
        return False
    han = len(HAN_RE.findall(text))
    if han >= 2 and kana > 0 and han >= kana * 3:
        return False
    return True


def is_gloss_line(text: str) -> bool:
    if not text.strip() or is_japanese_line(text):
        return False
    han = len(HAN_RE.findall(text))
    kana = len(KANA_RE.findall(text))
    return han > 0 and kana == 0


def parse_example_pairs(lines: list[str]) -> list[tuple[str, str]]:
    pairs: list[tuple[str, str]] = []
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if not line:
            i += 1
            continue
        if not is_japanese_line(line):
            i += 1
            continue
        gloss = ""
        if i + 1 < len(lines) and is_gloss_line(lines[i + 1]):
            gloss = lines[i + 1].strip()
            i += 2
        else:
            i += 1
        pairs.append((line, gloss))
    return pairs


def build_prompt(row: dict) -> str:
    kind = str(row.get("kind") or "word")
    kind_label = "语法" if kind == "grammar" else "单词"
    word = str(row.get("word") or "").strip()
    reading = str(row.get("reading") or "").strip()
    meaning = str(row.get("meaning") or "").strip()
    meta = [f"词条：{word}"]
    if reading:
        meta.append(f"读音：{reading}")
    if meaning:
        meta.append(f"释义：{meaning}")
    meta.append(f"类型：{kind_label}")
    return (
        "\n".join(meta)
        + f"""

请为上述日语{kind_label}写例句，供 N5/N4 初学者复习朗读。

条数规则（必须遵守）：
- 先判断该词条有几种常用用法（义项）。
- 每种用法造 1 句；若只有 1 种用法，则造 2 句（同用法换场景）。
- 两种用法 → 2 句；三种 → 3 句；以此类推（条数 = max(2, 用法数)）。
- 多用法时一句对应一种用法，不要两句都挤同一义项。

格式要求：
1. JLPT N5～N4，日常口语，句子短（每句约 8～18 字）。
2. 每条必须使用该词条（语法条须自然出现该语法点）。
3. 汉字后立刻半角括号假名，例如：電車(でんしゃ)に間(ま)に合(あ)いました。不要整句只写假名。
4. 每条日语下一行写中文译义，必须以「译文：」开头。
5. 只输出「日语 / 译文：…」交替行；不要行首编号、不要 markdown、不要解释。"""
    )


def validate_ai_output(text: str, row: dict) -> tuple[str | None, str | None]:
    raw = text.strip()
    if not raw:
        return None, "empty"

    lines = [
        LEADING_INDEX_RE.sub("", line).strip()
        for line in raw.splitlines()
        if line.strip()
    ]
    if len(lines) < 4:
        return None, "need_four_lines"

    pairs = parse_example_pairs(lines)
    if len(pairs) < 2:
        return None, "need_two_japanese_lines"

    normalized: list[str] = []
    for jp, gloss in pairs:
        if not is_japanese_line(jp):
            return None, "invalid_japanese_line"
        if HAN_RE.search(jp) and not KANJI_FURIGANA_RE.search(jp):
            return None, "missing_kanji_furigana"
        if not gloss or not is_gloss_line(gloss):
            return None, "missing_chinese_gloss"
        gloss_body = re.sub(r"^(译文|翻譯|翻译|译|譯)\s*[:：]\s*", "", gloss).strip()
        normalized.append(jp)
        normalized.append(f"译文：{gloss_body}" if gloss_body else gloss)

    target = str(row.get("word") or "").strip()
    combined = "".join(jp for jp, _ in pairs)
    combined_plain = re.sub(r"\([ぁ-んァ-ンー]+\)", "", combined)
    kind = str(row.get("kind") or "word")
    if kind == "grammar":
        core = re.sub(r"^[～~〜]+|[～~〜]+$", "", target)
        if core and core not in combined_plain and target not in combined_plain:
            return None, "grammar_not_used"
    else:
        alts = [s.strip() for s in target.split("/") if s.strip()]
        plain = alts[0] if alts else target
        hit = (
            plain in combined_plain
            or target in combined_plain
            or plain in combined
            or any(alt in combined_plain or alt in combined for alt in alts)
        )
        if not hit:
            return None, "word_not_used"

    return "\n".join(normalized), None


def call_openai(*, api_key: str, model: str, prompt: str) -> str:
    body = json.dumps(
        {
            "model": model,
            "messages": [
                {
                    "role": "system",
                    "content": "你是日语教师，只输出例句文本，严格遵守用户格式要求。",
                },
                {"role": "user", "content": prompt},
            ],
            "max_tokens": 400,
            "temperature": 0.35,
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


def generate_for_row(
    row: dict,
    *,
    api_key: str,
    model: str,
    retries: int,
) -> tuple[str | None, str | None]:
    prompt = build_prompt(row)
    last_reason = "unknown"
    for attempt in range(max(1, retries)):
        try:
            content = call_openai(api_key=api_key, model=model, prompt=prompt)
            validated, reason = validate_ai_output(content, row)
            if validated:
                return validated, None
            last_reason = reason or "invalid"
            prompt = (
                prompt
                + "\n\n上次输出不合格（"
                + last_reason
                + "）。请按条数规则输出「日语/译文」交替行，汉字旁必须有(假名)，并确保用到该词条。"
            )
        except (urllib.error.URLError, TimeoutError, KeyError, json.JSONDecodeError) as err:
            last_reason = str(err)
            if attempt + 1 >= retries:
                return None, last_reason
            time.sleep(1.5)
    return None, last_reason


def main() -> int:
    parser = argparse.ArgumentParser(description="AI 补全日语单词/语法例句")
    parser.add_argument("--dry-run", action="store_true", help="只生成预览，不写库")
    parser.add_argument("--scan", action="store_true", help="仅扫描缺失例句")
    parser.add_argument(
        "--catalog-first",
        action="store_true",
        help="先跑内置 N5 词表补全，再 AI 补剩余",
    )
    parser.add_argument("--limit", type=int, default=20, help="本次最多 AI 生成条数")
    parser.add_argument("--delay-ms", type=int, default=800, help="OpenAI 请求间隔")
    parser.add_argument("--retries", type=int, default=2, help="单条失败重试次数")
    parser.add_argument("--model", default=os.environ.get("JP_VOCAB_FILL_EXAMPLE_AI_MODEL", DEFAULT_MODEL))
    parser.add_argument("--api-url", default=resolve_api_url())
    args = parser.parse_args()

    token = resolve_token()
    if not token:
        print("缺少 JP_REVIEW_UPLOAD_TOKEN", file=sys.stderr)
        return 1

    api_url = args.api_url

    if args.catalog_first and not args.scan:
        print("[fill-example-ai] catalog pass…", flush=True)
        catalog = call_api(
            api_url=api_url,
            token=token,
            payload={"from_catalog": True, "dry_run": args.dry_run},
        )
        if not catalog.get("ok"):
            print(catalog, file=sys.stderr)
            return 1
        print(
            f"  catalog updated={catalog.get('updated', 0)}",
            flush=True,
        )

    scan = call_api(api_url=api_url, token=token, payload={"dry_run": True})
    if not scan.get("ok"):
        print(scan, file=sys.stderr)
        return 1

    missing = scan.get("missing") or []
    print(f"[fill-example-ai] missing={len(missing)} catalog_size={scan.get('catalog_size')}", flush=True)

    if args.scan:
        for row in missing[:50]:
            sug = " (catalog)" if row.get("suggested") else ""
            print(f"  {row.get('id')} {row.get('word')!r}{sug}")
        if len(missing) > 50:
            print(f"  … 共 {len(missing)} 条")
        return 0

    # 词表已有建议的留给 catalog；只 AI 补完全没有建议的
    ai_targets = [row for row in missing if not row.get("suggested")]
    if args.limit > 0:
        ai_targets = ai_targets[: args.limit]

    if not ai_targets:
        print("  无需要 AI 补全的词条", flush=True)
        return 0

    if args.dry_run:
        api_key = resolve_openai_key()
        if not api_key:
            print("dry-run 预览 AI 目标（未配置 OPENAI_API_KEY，跳过生成）：", flush=True)
            for row in ai_targets:
                print(f"  {row.get('id')} {row.get('word')!r}")
            return 0

    api_key = resolve_openai_key()
    if not api_key:
        print("缺少 OPENAI_API_KEY", file=sys.stderr)
        return 1

    updates: list[dict] = []
    skipped: list[str] = []
    delay_sec = max(0, args.delay_ms) / 1000.0

    for index, row in enumerate(ai_targets):
        word_id = int(row["id"])
        word = str(row.get("word") or "")
        print(f"  [{index + 1}/{len(ai_targets)}] {word_id} {word!r} …", flush=True)
        generated, err = generate_for_row(
            row,
            api_key=api_key,
            model=args.model,
            retries=args.retries,
        )
        if not generated:
            skipped.append(f"{word_id}:{word!r}:{err}")
            print(f"    skip ({err})", flush=True)
        else:
            print(f"    -> {generated.replace(chr(10), ' / ')}", flush=True)
            updates.append({"word_id": word_id, "example_sentences": generated})
        if delay_sec > 0 and index + 1 < len(ai_targets):
            time.sleep(delay_sec)

    if not updates:
        print(f"[fill-example-ai] done, updated=0 skipped={len(skipped)}", flush=True)
        return 0 if not skipped else 1

    # 老师卡片「来源」：模型名 + 线上；勿用「手动」（那是编辑弹窗专用）
    batch_source = f"{args.model} 线上"[:64]

    if args.dry_run:
        print(
            json.dumps(
                {
                    "ok": True,
                    "dry_run": True,
                    "source": batch_source,
                    "updates": updates,
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return 0

    apply_result = call_api(
        api_url=api_url,
        token=token,
        payload={
            "mode": "apply",
            "source": batch_source,
            "updates": updates,
            "dry_run": False,
        },
    )
    if not apply_result.get("ok"):
        print(apply_result, file=sys.stderr)
        return 1

    print(
        f"[fill-example-ai] done, updated={apply_result.get('updated', 0)} "
        f"skipped={len(skipped)}",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
