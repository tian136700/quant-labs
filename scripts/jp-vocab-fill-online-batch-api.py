#!/usr/bin/env python3
"""日语词条：线上付费 API 一词一次补齐（单词 / 语法智能分支）。

与英语 en-vocab-fill-online-batch-api.py 同模式：Mac 调 tokken Anthropic，
Worker 只负责 list_missing / apply（禁止 Worker 内调模型）。

单词缺项：读音、释义、词性、例句（例句句末标 (N5)/(N4)…）
语法缺项：用法、接序、例句（变形课只要例句）

仅在 JP_VOCAB_FILL_LLM_BACKEND=1 时由 jp-vocab-fill-unified-stage.sh 调用。
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts" / "lib"))

from jp_vocab_fill_common import call_api, load_env_file, resolve_token  # noqa: E402
from jp_vocab_llm_backend import backend_label, is_online_backend  # noqa: E402
from paid_anthropic_client import (  # noqa: E402
    build_online_source_label,
    call_anthropic,
    poison_seconds_for_generate_error,
)
from vocab_fill_circuit_breaker import (  # noqa: E402
    after_attempt,
    assert_not_killed,
)
from worker_api_guard import skip_if_worker_unavailable  # noqa: E402
from vocab_fill_quiz_gate import skip_if_quiz_gate_quiet  # noqa: E402

BASE = "https://finance.info-quests.com"
READING_URL = f"{BASE}/api/jp-vocab/fill-reading"
MEANING_URL = f"{BASE}/api/jp-vocab/fill-meaning"
USAGE_URL = f"{BASE}/api/jp-vocab/fill-usage"
EXAMPLES_URL = f"{BASE}/api/jp-vocab/fill-example-sentences"

DEFAULT_MIN_INTERVAL_SEC = 60
HARD_ONLINE_LIMIT = 1
POISON_PATH = Path.home() / ".config" / "info-quests" / "jp-vocab-fill-online.poison.json"
RATE_GATE_PATH = Path.home() / ".config" / "info-quests" / "jp-vocab-fill-online.last_paid_call"
DEFAULT_POISON_SEC = 6 * 3600
MAINTENANCE_WORD_RUN_URL = "http://127.0.0.1:17823/api/jp-vocab-fill/word-runs"

FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE | re.IGNORECASE)
EXAMPLE_JLPT_TAIL_RE = re.compile(
    r"^(.*?)([。！？…])\s*[（(]\s*N\s*([1-5])\s*[）)]\s*$",
    re.I,
)

WORD_SYSTEM = (
    "你为中文母语的日语 N5/N4 初学者补全「单词」闪卡。"
    "只输出一个 JSON 对象，不要 markdown 围栏、不要解释。"
    "【硬规则】无论库里缺哪一项，每次都必须一次性输出该单词的全部四项，禁止只补缺项："
    "reading（假名读音）、meaning（中文释义）、pos（中文词性）、example_sentences（例句字符串）。"
    "单词没有接序，禁止输出 connection / usage 字段。"
    "释义：最常用 1～3 个中文义项，用「；」连接，常用在前；"
    "一词多种读音/大义项（与 reading 斜杠对应）用半角 / 分隔，如「前面；以前/前面的；预先的」。"
    "词性：中文（名词/动词/い形容词/な形容词/副词…），多词性用 /。"
    "例句：字符串（不要 JSON 数组）。每条日语一行（汉字须半角括号假名），"
    "句末标 JLPT 等级 (N5)/(N4)，下一行「译文：」+自然中文。"
    "N5～N4 短句，焦点在本单词，不要塞难语法。"
    "条数：释义含 / 时每段 1 句；否则 max(2, 常用用法数)。"
    "な形容词「〜だ」造句用词干，不必写「だ」。"
    "【例句用词】须自然用到该词条：优先写词条汉字（如「貰う」写成 貰(もら)う），"
    "每个汉字立刻半角括号假名；禁止只用假名读音而完全不出现词条汉字（除非词条本身无汉字）。"
    "【熟语假名·必守】二字以上熟语必须整词标假名，禁止按训读拆开："
    "✅出発(しゅっぱつ)／日本語(にほんご)／土曜日(どようび)／図書館(としょかん)；"
    "❌出(で)発(ぱつ)（读成でぱつ，错）、❌日本(にっぽん)語(ご)、❌土曜(どよう)日(ひ)、"
    "❌消防(しょうぼう)車(しょうぼうしゃ)（后字吞掉整词读音）。"
)

GRAMMAR_SYSTEM = (
    "你为中文母语的日语 N5～N2 学习者补全「语法」闪卡。"
    "只输出一个 JSON 对象，不要 markdown。"
    "【硬规则】无论库里缺哪一项，每次都必须一次性输出该语法的全部相关字段，禁止只补缺项。"
    "语法没有释义/词性/读音，禁止输出 reading / meaning / pos。"
    "句型语法字段：usage（编号中文用法，句末 (N5)/(N4)…）、"
    "example_sentences（与用法严格 1:1：每条用法恰好 1 条例句；日语+译文交替纯文本，不要接序段）、"
    "connection（接序正文，不要【接序】标记；写清词类（动词原形／一类形容词…／名词），禁止只写笼统「原形＋」）。"
    "组数=真实常用用法数；禁止多造例句；例句接续须对应该条用法（た形／原形／て形勿张冠李戴）。"
    "例句只用简单词。"
    "【熟语假名·必守】二字以上熟语整词标假名："
    "✅出発(しゅっぱつ)／日本語(にほんご)；❌出(で)発(ぱつ)、❌日本(にっぽん)語(ご)。"
    "若词条是「变形/ます形规则/て形」等活用教学：只输出 example_sentences（2～3 条 N5 短句+译文），"
    "usage 与 connection 必须是空字符串 \"\"。"
)

WORD_REQUIRED_KEYS = ("reading", "meaning", "pos", "example_sentences")
GRAMMAR_PATTERN_KEYS = ("usage", "connection", "example_sentences")
GRAMMAR_CONJ_KEYS = ("example_sentences",)


def _load_helper_module(filename: str, alias: str):
    path = ROOT / "scripts" / filename
    spec = importlib.util.spec_from_file_location(alias, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {path}")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def resolve_min_interval_sec() -> int:
    raw = (
        __import__("os").environ.get("JP_VOCAB_FILL_ONLINE_MIN_INTERVAL_SEC", "").strip()
        or load_env_file("jp-vocab-fill.env").get(
            "JP_VOCAB_FILL_ONLINE_MIN_INTERVAL_SEC", ""
        )
        or str(DEFAULT_MIN_INTERVAL_SEC)
    )
    try:
        return max(30, int(raw))
    except ValueError:
        return DEFAULT_MIN_INTERVAL_SEC


def resolve_poison_sec() -> int:
    raw = (
        __import__("os").environ.get("JP_VOCAB_FILL_ONLINE_POISON_SEC", "").strip()
        or load_env_file("jp-vocab-fill.env").get(
            "JP_VOCAB_FILL_ONLINE_POISON_SEC", ""
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
        try:
            until = float(val.get("until"))
        except (TypeError, ValueError):
            continue
        if until > now:
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
    sec = poison_seconds_for_generate_error(reason, default_sec=resolve_poison_sec())
    data[str(word_id)] = {
        "word": word,
        "reason": reason,
        "until": time.time() + sec,
    }
    save_poison(data)
    print(
        f"    poison id={word_id} for {sec}s (reason={reason})",
        flush=True,
    )


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
                f"[jp-vocab-fill-online] rate-gate: 距上次付费仅 {elapsed:.0f}s "
                f"< {min_sec}s，skip（约 {wait}s 后再试）",
                flush=True,
            )
            return False
    return True


def mark_paid_call() -> None:
    RATE_GATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    RATE_GATE_PATH.write_text(f"{time.time():.3f}\n", encoding="utf-8")


def is_conjugation_word(word: str) -> bool:
    grammar_mod = _load_helper_module(
        "jp-vocab-fill-grammar-usage-examples-api.py", "_jp_grammar_helpers"
    )
    return grammar_mod.is_conjugation_word(word)


def full_refresh_needs(kind: str, word: str) -> dict[str, bool]:
    if kind == "grammar":
        if is_conjugation_word(word):
            return {
                "reading": False,
                "meaning": False,
                "pos": False,
                "usage": False,
                "connection": False,
                "example_sentences": True,
            }
        return {
            "reading": False,
            "meaning": False,
            "pos": False,
            "usage": True,
            "connection": True,
            "example_sentences": True,
        }
    return {
        "reading": True,
        "meaning": True,
        "pos": True,
        "usage": False,
        "connection": False,
        "example_sentences": True,
    }


def now_local_str() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def report_word_run_to_maintenance_center(payload: dict[str, Any]) -> None:
    """维护中心「最近词条」；维护中心未开时静默跳过。"""
    try:
        body_obj = dict(payload)
        if not str(body_obj.get("fill_task") or "").strip():
            body_obj["fill_task"] = "jp-vocab-fill-unified"
        body = json.dumps(body_obj, ensure_ascii=False).encode("utf-8")
        req = urllib.request.Request(
            MAINTENANCE_WORD_RUN_URL,
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        urllib.request.urlopen(req, timeout=2)
    except (urllib.error.URLError, TimeoutError, OSError, ValueError):
        pass


def normalize_example_jlpt_tail(line: str) -> str:
    text = str(line or "").strip()
    m = EXAMPLE_JLPT_TAIL_RE.match(text)
    if not m:
        return text
    return f"{m.group(1)}{m.group(2)}(N{m.group(3)})"


def normalize_example_sentences_block(value: Any) -> str:
    if not value:
        return ""
    text = str(value).strip()
    if not text:
        return ""
    lines: list[str] = []
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if line.startswith("译文") or line.startswith("譯文"):
            lines.append(line if line.startswith("译文：") else f"译文：{line.split('：', 1)[-1]}")
        elif re.match(r"^(译文|翻譯|翻译)\s*[:：]", line):
            lines.append(line)
        else:
            lines.append(normalize_example_jlpt_tail(line))
    return "\n".join(lines).strip()


def parse_json_object(raw: str) -> dict[str, Any]:
    from llm_json_parse import parse_llm_json_object

    return parse_llm_json_object(raw)


def required_keys_for_row(row: dict[str, Any]) -> tuple[str, ...]:
    kind = str(row.get("kind") or "word")
    if kind == "grammar":
        if is_conjugation_word(str(row.get("word") or "")):
            return GRAMMAR_CONJ_KEYS
        return GRAMMAR_PATTERN_KEYS
    return WORD_REQUIRED_KEYS


def build_prompt(row: dict[str, Any], *, full_bundle: bool = True) -> str:
    word = str(row.get("word") or "").strip()
    kind = str(row.get("kind") or "word")
    kind_label = "语法" if kind == "grammar" else "单词"
    req_keys = required_keys_for_row(row)

    if kind == "word":
        bundle_rule = (
            "必须一次性输出 JSON 的全部四项（即使库里只有例句缺失，也要重写读音/释义/词性/例句）："
            "reading, meaning, pos, example_sentences。"
            "禁止输出 connection、usage（单词没有接序）。"
        )
    elif is_conjugation_word(word):
        bundle_rule = (
            "必须一次性输出 example_sentences；usage 与 connection 填空字符串 \"\"."
        )
    else:
        bundle_rule = (
            "必须一次性输出 JSON 的全部三项（即使库里只有接序缺失，也要重写用法/例句/接序）："
            "usage, example_sentences, connection。"
            "禁止输出 reading、meaning、pos（语法没有这些字段）。"
        )

    return f"""词条：{word}
类型：{kind_label}

{bundle_rule}

参考（可忽略旧值，以你一次性输出的完整内容为准）：
已有读音：{row.get("reading") or "（无）"}
已有释义：{row.get("meaning") or "（无）"}
已有词性：{row.get("pos") or "（无）"}
已有用法：{row.get("usage") or "（无）"}
已有接序：{row.get("connection") or "（无）"}
已有例句：{row.get("example_sentences") or "（无）"}

JSON 必须包含且非空：{", ".join(req_keys)}（变形课 usage/connection 除外，填 ""）。
只输出 JSON。"""


def fetch_candidates(token: str, *, limit: int) -> list[dict[str, Any]]:
    by_id: dict[int, dict[str, Any]] = {}
    scan_limit = max(limit * 8, 24)

    def merge(rows: list, *, connection_only: bool = False) -> None:
        for row in rows:
            wid = int(row.get("id") or 0)
            if wid <= 0:
                continue
            word = str(row.get("word") or "")
            kind = str(row.get("kind") or "word")
            cur = by_id.get(wid)
            if not cur:
                cur = {
                    "id": wid,
                    "word": word,
                    "kind": kind,
                    "reading": row.get("reading"),
                    "meaning": row.get("meaning"),
                    "pos": row.get("pos"),
                    "usage": row.get("usage"),
                    "connection": row.get("connection"),
                    "example_sentences": row.get("example_sentences"),
                    "needs": full_refresh_needs(kind, word),
                    "triggered": True,
                }
                by_id[wid] = cur
            else:
                for field in (
                    "reading",
                    "meaning",
                    "pos",
                    "usage",
                    "connection",
                    "example_sentences",
                    "kind",
                    "word",
                ):
                    if row.get(field) and not cur.get(field):
                        cur[field] = row.get(field)
                kind = str(cur.get("kind") or kind)
                cur["needs"] = full_refresh_needs(kind, str(cur.get("word") or word))
            if connection_only and kind == "grammar" and not is_conjugation_word(word):
                cur["needs"]["connection"] = True

    for url in (READING_URL, MEANING_URL, USAGE_URL, EXAMPLES_URL):
        body: dict[str, Any] = {"mode": "list_missing", "limit": scan_limit}
        data = call_api(
            url,
            token,
            body,
            user_agent="jp-vocab-fill-online-batch/1.0",
        )
        merge(list(data.get("missing") or []))

    conn_data = call_api(
        USAGE_URL,
        token,
        {"mode": "list_missing_connection", "limit": scan_limit},
        user_agent="jp-vocab-fill-online-batch/1.0",
    )
    if conn_data.get("mode") == "list_missing_connection":
        merge(list(conn_data.get("missing") or []), connection_only=True)

    poison = load_poison()
    now = time.time()
    rows: list[dict[str, Any]] = []
    for row in by_id.values():
        wid = int(row["id"])
        p = poison.get(str(wid))
        if p and float(p.get("until") or 0) > now:
            continue
        rows.append(row)
    rows.sort(key=lambda r: int(r.get("id") or 0))
    return rows[: max(1, limit)]


def apply_bundle(
    token: str,
    *,
    word_id: int,
    kind: str,
    payload: dict[str, Any],
    needs: dict[str, bool],
    source: str,
    dry_run: bool,
) -> tuple[list[str], list[str]]:
    """写回字段。返回 (done, fail_reasons)。

    单词例句必须走 fill-example-sentences；禁止靠 meaning 的「覆写成功」
    掩盖例句被拒（否则会假成功清零熔断、同一词空烧）。
    """
    done: list[str] = []
    fails: list[str] = []
    if dry_run:
        for k in payload:
            if payload.get(k):
                done.append(f"dry:{k}")
        return done, fails

    def _apply(url: str, body: dict) -> dict:
        return call_api(
            url,
            token,
            body,
            user_agent="jp-vocab-fill-online-batch/1.0",
        )

    if kind == "word":
        if payload.get("reading"):
            r = _apply(
                READING_URL,
                {
                    "mode": "apply",
                    "allow_overwrite": True,
                    "updates": [
                        {"word_id": word_id, "reading": payload["reading"]}
                    ],
                },
            )
            if int(r.get("updated") or 0) > 0:
                done.append("reading")
            else:
                sk = r.get("skipped") or []
                reason = (
                    str(sk[0].get("reason") or "reading_apply_none")
                    if sk
                    else "reading_apply_none"
                )
                fails.append(f"reading:{reason}")

        word_update: dict[str, Any] = {"word_id": word_id, "source": source}
        if payload.get("meaning"):
            word_update["meaning"] = payload["meaning"]
        if payload.get("pos"):
            word_update["pos"] = payload["pos"]
        # 例句不走 meaning：避免 updated>0（只覆写释义）却被当成整词搞定
        if len(word_update) > 2:
            r = _apply(
                MEANING_URL,
                {
                    "mode": "apply",
                    "allow_overwrite": True,
                    "validate_format": False,
                    "source": source,
                    "updates": [word_update],
                },
            )
            if int(r.get("updated") or 0) > 0:
                done.append("word_bundle")
            else:
                sk = r.get("skipped") or []
                reason = (
                    str(sk[0].get("reason") or "meaning_apply_none")
                    if sk
                    else "meaning_apply_none"
                )
                fails.append(f"meaning:{reason}")

        examples = str(payload.get("example_sentences") or "").strip()
        if examples:
            r = _apply(
                EXAMPLES_URL,
                {
                    "mode": "apply",
                    "allow_overwrite": True,
                    "source": source,
                    "updates": [
                        {
                            "word_id": word_id,
                            "example_sentences": examples,
                        }
                    ],
                },
            )
            if int(r.get("updated") or 0) > 0:
                done.append("example_sentences")
            else:
                sk = r.get("skipped") or []
                reason = (
                    str(sk[0].get("reason") or "examples_apply_none")
                    if sk
                    else "examples_apply_none"
                )
                fails.append(f"examples:{reason}")
        else:
            fails.append("examples:missing_in_payload")
        return done, fails

    if kind == "grammar":
        g_update: dict[str, Any] = {"word_id": word_id, "source": source}
        if "usage" in payload:
            g_update["usage"] = payload.get("usage") or ""
        if payload.get("connection"):
            g_update["connection"] = payload["connection"]
        if payload.get("example_sentences"):
            g_update["example_sentences"] = payload["example_sentences"]
        if len(g_update) > 2:
            r = _apply(
                USAGE_URL,
                {
                    "mode": "apply",
                    "force": True,
                    "source": source,
                    "updates": [g_update],
                },
            )
            if int(r.get("updated") or 0) > 0:
                done.append("grammar")
            else:
                sk = r.get("skipped") or []
                reason = (
                    str(sk[0].get("reason") or "grammar_apply_none")
                    if sk
                    else "grammar_apply_none"
                )
                fails.append(f"grammar:{reason}")
        else:
            fails.append("grammar:empty_update")

    return done, fails


def extract_bundle(data: dict[str, Any], row: dict[str, Any]) -> dict[str, Any]:
    kind = str(row.get("kind") or "word")
    word = str(row.get("word") or "")
    out: dict[str, Any] = {}

    if kind == "word":
        reading = str(data.get("reading") or "").strip()
        meaning = str(data.get("meaning") or "").strip()
        pos = str(data.get("pos") or "").strip()
        ex = normalize_example_sentences_block(data.get("example_sentences"))
        if reading:
            out["reading"] = reading
        if meaning:
            out["meaning"] = meaning
        if pos:
            out["pos"] = pos
        if ex:
            out["example_sentences"] = ex
        return out

    if is_conjugation_word(word):
        ex = normalize_example_sentences_block(data.get("example_sentences"))
        if ex:
            out["example_sentences"] = ex
        out["usage"] = ""
        out["connection"] = ""
        return out

    usage = str(data.get("usage") or "").strip()
    connection = str(data.get("connection") or "").strip()
    ex = normalize_example_sentences_block(data.get("example_sentences"))
    if usage:
        out["usage"] = usage
    if connection:
        out["connection"] = connection
    if ex:
        out["example_sentences"] = ex
    return out


def bundle_missing_keys(payload: dict[str, Any], row: dict[str, Any]) -> list[str]:
    missing: list[str] = []
    kind = str(row.get("kind") or "word")
    word = str(row.get("word") or "")

    if kind == "word":
        for key in WORD_REQUIRED_KEYS:
            if not str(payload.get(key) or "").strip():
                missing.append(key)
        if payload.get("connection") or payload.get("usage"):
            missing.append("forbidden_word_connection_or_usage")
        return missing

    if is_conjugation_word(word):
        if not str(payload.get("example_sentences") or "").strip():
            missing.append("example_sentences")
        return missing

    for key in ("usage", "connection", "example_sentences"):
        if not str(payload.get(key) or "").strip():
            missing.append(key)
    if payload.get("reading") or payload.get("meaning") or payload.get("pos"):
        missing.append("forbidden_grammar_reading_meaning_pos")
    return missing


def generate_bundle(row: dict[str, Any], needs: dict[str, bool]) -> dict[str, Any]:
    kind = str(row.get("kind") or "word")
    system = GRAMMAR_SYSTEM if kind == "grammar" else WORD_SYSTEM
    prompt = build_prompt(row)

    def _call(extra: str = "") -> dict[str, Any]:
        raw = call_anthropic(
            prompt + extra,
            system=system,
            max_tokens=4500,
            temperature=0.25,
            timeout=180,
        )
        return extract_bundle(parse_json_object(raw), row)

    payload = _call()
    missing = bundle_missing_keys(payload, row)
    if missing:
        retry_hint = (
            "\n\nCRITICAL: 上次 JSON 不完整或含非法字段。"
            f"缺/错：{', '.join(missing)}。"
        )
        if kind == "word":
            retry_hint += (
                "单词必须一次性给出 reading、meaning、pos、example_sentences 四项；"
                "禁止 connection、usage。"
            )
        elif is_conjugation_word(str(row.get("word") or "")):
            retry_hint += "变形课只要 example_sentences。"
        else:
            retry_hint += (
                "语法必须一次性给出 usage、example_sentences、connection；"
                "禁止 reading、meaning、pos。"
            )
        payload = _call(retry_hint)
        missing = bundle_missing_keys(payload, row)
        if missing:
            raise ValueError(f"incomplete_bundle:{','.join(missing)}")

    return payload


def process_one(
    token: str,
    row: dict[str, Any],
    *,
    index: int,
    total: int,
    dry_run: bool,
    allow_burst: bool,
) -> bool:
    if not acquire_paid_rate_gate(allow_burst=allow_burst):
        min_sec = resolve_min_interval_sec()
        print(f"    rate-gate wait {min_sec}s…", flush=True)
        time.sleep(min_sec)
        if not acquire_paid_rate_gate(allow_burst=allow_burst):
            return False

    wid = int(row["id"])
    word = str(row.get("word") or "")
    kind = str(row.get("kind") or "word")
    needs = dict(row.get("needs") or {})
    req_keys = required_keys_for_row(row)
    print(
        f"  [{index}/{total}] id={wid} kind={kind} word={word!r} "
        f"full_bundle={list(req_keys)}",
        flush=True,
    )
    report_word_run_to_maintenance_center(
        {
            "word_id": wid,
            "word": word,
            "kind": kind,
            "status": "running",
            "started_at": now_local_str(),
        }
    )

    source = build_online_source_label()
    mark_paid_call()
    try:
        payload = generate_bundle(row, needs)
    except Exception as err:
        print(f"    fail generate: {err}", flush=True)
        report_word_run_to_maintenance_center(
            {
                "word_id": wid,
                "word": word,
                "kind": kind,
                "status": "failed",
                "error": f"generate:{err}",
                "finished_at": now_local_str(),
            }
        )
        mark_poison(wid, word, f"generate:{err}")
        after_attempt(
            scope="jp-online",
            word_id=wid,
            word=word,
            fixed=False,
            detail=f"generate:{err}",
        )
        return False

    if not payload:
        mark_poison(wid, word, "empty_payload")
        after_attempt(
            scope="jp-online",
            word_id=wid,
            word=word,
            fixed=False,
            detail="empty_payload",
        )
        return False

    preview = {
        k: (str(v)[:72] + ("…" if len(str(v)) > 72 else ""))
        for k, v in payload.items()
    }
    print(f"    got={preview}", flush=True)

    if dry_run:
        return True

    done, fails = apply_bundle(
        token,
        word_id=wid,
        kind=kind,
        payload=payload,
        needs=needs,
        source=source,
        dry_run=False,
    )
    print(f"    applied={done} source={source}", flush=True)
    if fails:
        print(f"    apply_fails={fails}", flush=True)

    # 单词：例句未真正写回 → 未搞定（即使 reading/释义覆写成功）
    examples_ok = kind != "word" or "example_sentences" in done
    grammar_ok = kind != "grammar" or "grammar" in done or any(
        x.startswith("dry:") for x in done
    )
    fixed = bool(done) and not fails and examples_ok and grammar_ok
    fail_detail = (
        ";".join(fails)
        if fails
        else (
            "examples_not_applied"
            if kind == "word" and not examples_ok
            else ("grammar_not_applied" if kind == "grammar" and not grammar_ok else "")
        )
    )

    preview_text = json.dumps(preview, ensure_ascii=False)
    report_word_run_to_maintenance_center(
        {
            "word_id": wid,
            "word": word,
            "kind": kind,
            "status": "success" if fixed else "failed",
            "source": source,
            "applied": str(done),
            "preview": preview_text,
            "error": "" if fixed else (fail_detail or "apply_none"),
            "finished_at": now_local_str(),
        }
    )
    if not fixed:
        mark_poison(wid, word, fail_detail or "apply_none")
        after_attempt(
            scope="jp-online",
            word_id=wid,
            word=word,
            fixed=False,
            detail=fail_detail or "apply_none",
        )
        return False
    after_attempt(
        scope="jp-online",
        word_id=wid,
        word=word,
        fixed=True,
        detail="applied",
    )
    return True


def main() -> int:
    assert_not_killed("jp-online-batch")
    skip_if_quiz_gate_quiet("jp-online-batch")
    if not is_online_backend():
        print(
            "[jp-vocab-fill-online] JP_VOCAB_FILL_LLM_BACKEND≠1，"
            "请改 scripts/lib/jp_vocab_llm_backend.py 或 env",
            flush=True,
        )
        return 2

    token = resolve_token()
    if not token:
        raise SystemExit("缺少 JP_REVIEW_UPLOAD_TOKEN")

    skip_if_worker_unavailable(BASE, label="jp-vocab-fill-online")

    parser = argparse.ArgumentParser(
        description="日语词条：线上付费一词一次补齐"
    )
    parser.add_argument("--limit", type=int, default=HARD_ONLINE_LIMIT)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--allow-burst", action="store_true")
    parser.add_argument("--word-id", type=int, default=0)
    parser.add_argument(
        "--force",
        action="store_true",
        help="即使开关为本地也运行（调试）",
    )
    args = parser.parse_args()

    if not args.force and not is_online_backend():
        return 2

    limit = max(1, min(int(args.limit or HARD_ONLINE_LIMIT), HARD_ONLINE_LIMIT))
    print(
        f"[jp-vocab-fill-online] backend={backend_label()} limit={limit}",
        flush=True,
    )

    if args.word_id and args.word_id > 0:
        rows = fetch_candidates(token, limit=50)
        rows = [r for r in rows if int(r["id"]) == int(args.word_id)]
        if not rows:
            print(
                f"[jp-vocab-fill-online] word_id={args.word_id} 不在缺项队列",
                flush=True,
            )
            return 0
    else:
        rows = fetch_candidates(token, limit=limit)

    if not rows:
        print("[jp-vocab-fill-online] 无待补词条", flush=True)
        return 0

    ok = process_one(
        token,
        rows[0],
        index=1,
        total=len(rows),
        dry_run=args.dry_run,
        allow_burst=args.allow_burst,
    )
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
