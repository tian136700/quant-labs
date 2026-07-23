#!/usr/bin/env python3
"""补全 en_vocab_word 缺失例句：list_missing → 本机 Ollama → apply。

须先有 usage；条数 = 用法编号条数；第 N 句对应第 N 条用法。
其它词尽量简单。默认模型 gemma4:26b；source 标「本地 gemma4:26b」。
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts" / "lib"))

from en_vocab_fill_common import (  # noqa: E402
    build_source_label,
    call_api,
    call_ollama,
    is_ollama_timeout_error,
    load_env_file,
    probe_ollama,
    resolve_ollama_model,
    resolve_ollama_model_chain,
    resolve_token,
)

DEFAULT_API_URL = (
    "https://finance.info-quests.com/api/en-vocab/fill-example-sentences"
)
LEADING_INDEX_RE = re.compile(r"^\s*\d+[.、．)\]]\s*")
GLOSS_LABEL_RE = re.compile(r"^(译文|翻譯|翻译|译|譯)\s*[:：]\s*")
HAN_RE = re.compile(r"[\u4E00-\u9FFF]")
LATIN_RE = re.compile(r"[A-Za-z]")
USAGE_POINT_RE = re.compile(r"^\s*(\d+)\s*[.、．)\]]\s*(.+)$")
# 整链失败后冷却，避免队首毒丸词每分钟再烧 5～10 分钟占死 ollama_slot
POISON_PATH = (
    Path.home() / ".config" / "info-quests" / "en-vocab-fill-examples.poison.json"
)
DEFAULT_POISON_SEC = 6 * 3600


def is_english_line(text: str) -> bool:
    t = text.strip()
    if not t or GLOSS_LABEL_RE.match(t):
        return False
    if not LATIN_RE.search(t):
        return False
    han = len(HAN_RE.findall(t))
    latin = len(LATIN_RE.findall(t))
    if han >= 4 and latin > 0 and han >= latin:
        return False
    return True


def is_gloss_line(text: str) -> bool:
    t = text.strip()
    if not t or is_english_line(t):
        return False
    body = GLOSS_LABEL_RE.sub("", t).strip()
    return bool(HAN_RE.search(body))


def english_word_tokens(text: str) -> list[str]:
    return re.findall(r"[A-Za-z]+(?:'[A-Za-z]+)?", text or "")


EN_SENTENCE_FINAL_PUNCT_RE = re.compile(r"""[.!?]"?'?\s*$""")
EN_FINITE_HINT_RE = re.compile(
    r"\b(?:am|is|are|was|were|be|been|being|do|does|did|have|has|had|"
    r"will|would|can|could|may|might|must|should|shall|need|needs|ought)\b",
    re.I,
)


def assess_english_sentence(
    english: str, word: str, gloss: str = ""
) -> str | None:
    """返回不合格 reason；合格返回 None。与 TS assessEnVocabExampleEnglishSentence 对齐。"""
    en = (english or "").strip()
    if not en:
        return "english_not_sentence"
    tokens = english_word_tokens(en)
    lemma_tokens = english_word_tokens(word)
    if (
        lemma_tokens
        and len(tokens) == len(lemma_tokens)
        and all(t.lower() == lemma_tokens[i].lower() for i, t in enumerate(tokens))
    ):
        return "lemma_only_example"
    if len(tokens) < 3:
        return "english_not_sentence"
    if not EN_SENTENCE_FINAL_PUNCT_RE.search(en):
        return "missing_sentence_final_punct"
    starts_with_lemma = (
        bool(lemma_tokens)
        and len(tokens) >= len(lemma_tokens)
        and all(
            tokens[i].lower() == lemma_tokens[i].lower()
            for i in range(len(lemma_tokens))
        )
    )
    if starts_with_lemma and len(tokens) <= 5 and not EN_FINITE_HINT_RE.search(en):
        return "english_phrase_not_sentence"
    gloss_body = gloss or ""
    for _ in range(8):
        nxt = GLOSS_LABEL_RE.sub("", gloss_body)
        nxt = re.sub(r"^[\s／/]+", "", nxt).strip()
        if nxt == gloss_body:
            break
        gloss_body = nxt
    han_count = len(HAN_RE.findall(gloss_body))
    if han_count >= 8 and len(tokens) < 4:
        return "english_too_short_vs_gloss"
    return None


def word_used(sentence: str, word: str, kind: str) -> bool:
    target = word.strip()
    if not target:
        return False
    # 语法 / 多词词条（Present Perfect）：须出现词条原文；用 includes，避免只示范时态
    if kind == "grammar" or (" " in target or "-" in target):
        return target.lstrip("～~").lower() in sentence.lower()
    escaped = re.escape(target)
    return bool(re.search(rf"\b{escaped}\b", sentence, flags=re.I))


def resolve_poison_sec() -> int:
    raw = (
        os.environ.get("EN_VOCAB_FILL_EXAMPLE_POISON_SEC", "").strip()
        or load_env_file("en-vocab-fill.env").get(
            "EN_VOCAB_FILL_EXAMPLE_POISON_SEC", ""
        )
        or str(DEFAULT_POISON_SEC)
    )
    try:
        return max(300, int(raw))
    except ValueError:
        return DEFAULT_POISON_SEC


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
        until = val.get("until")
        try:
            until_f = float(until)
        except (TypeError, ValueError):
            continue
        if until_f > now:
            out[str(key)] = val
    return out


def save_poison(data: dict[str, dict]) -> None:
    POISON_PATH.parent.mkdir(parents=True, exist_ok=True)
    POISON_PATH.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def mark_poison(word_id: int, word: str, reason: str) -> None:
    data = load_poison()
    data[str(word_id)] = {
        "word": word,
        "reason": reason,
        "until": time.time() + resolve_poison_sec(),
        "marked_at": time.time(),
    }
    save_poison(data)
    print(
        f"    poison id={word_id} for {resolve_poison_sec()}s "
        f"(reason={reason}) — 跳过队首毒丸，下轮跑其它词",
        flush=True,
    )


def count_usage_points(usage: str) -> int | None:
    lines = [ln.strip() for ln in usage.splitlines() if ln.strip()]
    if not lines:
        return None
    points: list[tuple[int, str]] = []
    for line in lines:
        m = USAGE_POINT_RE.match(line)
        if not m:
            return None
        n = int(m.group(1))
        text = m.group(2).strip()
        if n <= 0 or not text or not HAN_RE.search(text):
            return None
        points.append((n, text))
    for i, (n, _) in enumerate(points):
        if n != i + 1:
            return None
    return len(points) if points else None


def validate_examples(
    raw: str,
    *,
    word: str,
    kind: str,
    expected_count: int,
) -> tuple[str | None, str | None]:
    if expected_count < 1:
        return None, "usage_required"

    lines = [
        LEADING_INDEX_RE.sub("", ln).strip()
        for ln in raw.splitlines()
        if ln.strip()
    ]
    if len(lines) < expected_count * 2:
        return None, "need_pair_lines"

    pairs: list[tuple[str, str]] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        if not is_english_line(line):
            i += 1
            continue
        gloss = ""
        if i + 1 < len(lines) and is_gloss_line(lines[i + 1]):
            gloss_body = lines[i + 1]
            for _ in range(8):
                nxt = GLOSS_LABEL_RE.sub("", gloss_body)
                nxt = re.sub(r"^[\s／/]+", "", nxt).strip()
                if nxt == gloss_body:
                    break
                gloss_body = nxt
            gloss = f"译文：{gloss_body}"
            i += 2
        else:
            i += 1
        pairs.append((line, gloss))

    if len(pairs) != expected_count:
        return None, "wrong_example_count"

    out_lines: list[str] = []
    for en, gloss in pairs:
        if not gloss:
            return None, "missing_chinese_gloss"
        sentence_err = assess_english_sentence(en, word, gloss)
        if sentence_err:
            return None, sentence_err
        if not word_used(en, word, kind):
            return None, "word_not_used"
        out_lines.append(en)
        out_lines.append(gloss)
    return "\n".join(out_lines), None


def resolve_expected_count(row: dict) -> int | None:
    raw = row.get("expected_count")
    if isinstance(raw, int) and raw >= 1:
        return raw
    if isinstance(raw, str) and raw.strip().isdigit():
        n = int(raw.strip())
        if n >= 1:
            return n
    usage = str(row.get("usage") or "").strip()
    return count_usage_points(usage)


def generate_for_row(
    row: dict, *, model: str, retries: int
) -> tuple[str | None, str | None, str]:
    """返回 (text, error, model_used)。"""
    prompt = str(row.get("prompt") or "").strip()
    word = str(row.get("word") or "")
    kind = str(row.get("kind") or "word")
    expected = resolve_expected_count(row)
    if expected is None:
        return None, "usage_required", model

    if not prompt:
        prompt = (
            f"词条：{word}\n类型：{'语法' if kind == 'grammar' else '单词'}\n"
            f"应写例句条数：{expected}\n\n"
            "请按已有用法编号一一对应写英语例句；每条英文下一行「译文：」中文。"
        )

    base_prompt = prompt
    chain = resolve_ollama_model_chain(model)
    last_err = "unknown"
    last_model = chain[0]
    for mi, use_model in enumerate(chain):
        last_model = use_model
        work_prompt = base_prompt
        if mi > 0:
            print(
                f"[en-vocab-fill-examples] fallback → {use_model} (prev={last_err})",
                flush=True,
            )
        for attempt in range(max(1, retries)):
            try:
                content = call_ollama(work_prompt, model=use_model)
                text, reason = validate_examples(
                    content,
                    word=word,
                    kind=kind,
                    expected_count=expected,
                )
                if text:
                    return text, None, use_model
                last_err = reason or "invalid"
                extra = (
                    f"\n\n上次不合格（{last_err}）。请只输出英文/译文交替行，"
                    f"恰好 {expected} 句，一一对应用法，不要编号，其它词尽量简单。"
                )
                if last_err == "word_not_used":
                    extra += (
                        f"\nCRITICAL: 每条英文必须原样出现词条文字「{word}」"
                        f"（可改大小写）。禁止只示范含义/时态却不写词条原文。"
                    )
                if last_err in {
                    "missing_sentence_final_punct",
                    "english_not_sentence",
                    "lemma_only_example",
                    "english_phrase_not_sentence",
                    "english_too_short_vs_gloss",
                }:
                    extra += (
                        "\nCRITICAL: 英文必须是完整句子（主语+谓语，句末 .!?）。"
                        f"禁止只写「{word}」或搭配短语；中文须翻译整句英文。"
                    )
                work_prompt = base_prompt + extra
            except Exception as err:
                last_err = str(err)
                if is_ollama_timeout_error(err) and mi + 1 < len(chain):
                    break
                if attempt + 1 >= retries:
                    if mi + 1 < len(chain):
                        break
                    return None, last_err, last_model
                time.sleep(1.2)
        else:
            if mi + 1 < len(chain):
                continue
            return None, last_err, last_model
    return None, last_err, last_model


def main() -> int:
    cfg = load_env_file("en-vocab-fill.env")
    parser = argparse.ArgumentParser(
        description="Fill en_vocab example sentences via Ollama (requires usage)"
    )
    parser.add_argument(
        "--api-url",
        default=cfg.get("EN_VOCAB_FILL_EXAMPLE_SENTENCES_URL") or DEFAULT_API_URL,
    )
    parser.add_argument("--token", default=resolve_token())
    parser.add_argument(
        "--limit",
        type=int,
        default=int(cfg.get("EN_VOCAB_FILL_EXAMPLE_LIMIT") or 1),
    )
    parser.add_argument("--kind", choices=["word", "grammar"])
    parser.add_argument("--retries", type=int, default=2)
    parser.add_argument("--delay-ms", type=int, default=300)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--scan", action="store_true")
    args = parser.parse_args()

    if not args.token:
        raise SystemExit(
            "缺少 JP_REVIEW_UPLOAD_TOKEN（~/.config/info-quests/jp-review-sync.env）"
        )

    body: dict = {
        # 多拉候选，避开 poison 队首；真正处理条数仍受 --limit
        "mode": "list_missing",
        "limit": max(1, args.limit * 12, 12),
    }
    if args.kind:
        body["kind"] = args.kind

    scan = call_api(
        args.api_url,
        args.token,
        body,
        user_agent="en-vocab-fill-example-sentences/1.0",
    )
    if not scan.get("ok"):
        raise SystemExit(f"API error: {scan.get('error', scan)}")

    missing_all = list(scan.get("missing") or [])
    total = int(scan.get("total_missing") or len(missing_all))
    poison = load_poison()
    poisoned_ids = set(poison.keys())
    skipped_poison = [
        row
        for row in missing_all
        if str(int(row.get("id") or 0)) in poisoned_ids
    ]
    missing = [
        row
        for row in missing_all
        if str(int(row.get("id") or 0)) not in poisoned_ids
    ][: max(1, args.limit)]

    print(
        f"[en-vocab-fill-examples] list_missing={len(missing_all)} "
        f"total_missing={total} process={len(missing)} "
        f"poison_skipped={len(skipped_poison)} (requires usage)",
        flush=True,
    )
    if skipped_poison:
        for row in skipped_poison[:5]:
            wid = int(row.get("id") or 0)
            meta = poison.get(str(wid)) or {}
            print(
                f"  poison-skip id={wid} word={row.get('word')!r} "
                f"reason={meta.get('reason')}",
                flush=True,
            )
    if args.scan:
        print(json.dumps(scan, ensure_ascii=False, indent=2))
        return 0
    if not missing:
        if skipped_poison:
            print(
                "  候选均在毒丸冷却中（或尚无其它可造句词），本轮不调模型",
                flush=True,
            )
        else:
            print("  无缺失例句（或尚无用法可造句）", flush=True)
        return 0

    if not probe_ollama():
        raise SystemExit("本地 Ollama 不可用（先 brew services start ollama）")

    model = resolve_ollama_model()
    source = build_source_label(model)
    updates: list[dict] = []
    skipped: list[dict] = []

    for index, row in enumerate(missing):
        word_id = int(row.get("id") or 0)
        word = str(row.get("word") or "")
        expected = resolve_expected_count(row)
        print(
            f"  [{index + 1}/{len(missing)}] id={word_id} word={word!r} "
            f"expected={expected}",
            flush=True,
        )
        text, err, used_model = generate_for_row(
            row, model=model, retries=max(1, args.retries)
        )
        if not text:
            skipped.append({"id": word_id, "word": word, "reason": err or "empty"})
            print(f"    skip reason={err}", flush=True)
            # 整链失败 → 毒丸冷却，避免下一分钟再烧满槽占死其它任务
            if not args.dry_run:
                mark_poison(word_id, word, err or "empty")
        else:
            updates.append(
                {
                    "word_id": word_id,
                    "example_sentences": text,
                    "source": build_source_label(used_model),
                }
            )
            preview = text.splitlines()[0] if text else ""
            print(f"    ok model={used_model} preview={preview!r}", flush=True)
        if args.delay_ms > 0 and index + 1 < len(missing):
            time.sleep(args.delay_ms / 1000.0)

    if args.dry_run:
        print(
            json.dumps(
                {
                    "ok": True,
                    "dry_run": True,
                    "source": source,
                    "updates": updates,
                    "skipped": skipped,
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return 0

    if not updates:
        print(f"  无可写回（skipped={len(skipped)}）", flush=True)
        return 0

    apply = call_api(
        args.api_url,
        args.token,
        {"mode": "apply", "source": source, "updates": updates},
        user_agent="en-vocab-fill-example-sentences/1.0",
    )
    print(
        f"[en-vocab-fill-examples] apply updated={apply.get('updated')} "
        f"skipped={len(apply.get('skipped') or [])} source={source}",
        flush=True,
    )
    if not apply.get("ok"):
        raise SystemExit(f"apply failed: {apply}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
