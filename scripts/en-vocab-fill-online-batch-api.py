#!/usr/bin/env python3
"""线上付费 API：一词一次补齐音标 / 释义 / 词性 / 用法 / 例句。

与 STT 博士套磁信同一 Anthropic 中转（tokken.cc）。
仅在 EN_VOCAB_FILL_LLM_BACKEND=1 时由 en-vocab-fill-stage.sh 调用。
本地模式（0）请走分阶段 Ollama 脚本，不要跑本文件。
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts" / "lib"))

from en_vocab_fill_common import call_api, load_env_file, resolve_token  # noqa: E402
from en_vocab_llm_backend import (  # noqa: E402
    backend_label,
    is_online_backend,
)
from paid_anthropic_client import (  # noqa: E402
    anthropic_model,
    build_online_source_label,
    call_anthropic,
)
from llm_json_parse import parse_llm_json_object  # noqa: E402
from worker_api_guard import skip_if_worker_unavailable  # noqa: E402
from vocab_fill_circuit_breaker import (  # noqa: E402
    after_attempt,
    assert_not_killed,
)

BASE = "https://finance.info-quests.com"
READING_URL = f"{BASE}/api/en-vocab/fill-reading"
MEANING_URL = f"{BASE}/api/en-vocab/fill-meaning"
USAGE_URL = f"{BASE}/api/en-vocab/fill-usage"
EXAMPLES_URL = f"{BASE}/api/en-vocab/fill-example-sentences"

# —— 防烧钱硬闸 ——
# 全机付费调用最短间隔（秒）；与 launchd 每分钟对齐，禁止卡死狂打
DEFAULT_MIN_INTERVAL_SEC = 60
# 失败 / 校验不过的词冷却，避免队首同一词每分钟再烧一次
POISON_PATH = (
    Path.home() / ".config" / "info-quests" / "en-vocab-fill-online.poison.json"
)
RATE_GATE_PATH = (
    Path.home() / ".config" / "info-quests" / "en-vocab-fill-online.last_paid_call"
)
MAINTENANCE_WORD_RUN_URL = "http://127.0.0.1:17823/api/en-vocab-fill/word-runs"
DEFAULT_POISON_SEC = 6 * 3600
# 线上每轮最多 1 词（再多也钳制）
HARD_ONLINE_LIMIT = 1

EXAM_LABEL_RE = re.compile(
    r"雅思|托福|四六级|考研|专四|专八|IELTS|TOEFL|ielts|toefl|\bCET\b|\bGRE\b|\bGMAT\b|\bSAT\b",
    re.IGNORECASE,
)
LEADING_INDEX_RE = re.compile(r"^\s*\d+[.、．)\]]\s*")
_IPA_WRAPPED = re.compile(r"^([\[\/])(.+)([\]\/])$")
_IPA_FIND = re.compile(r"[/\[\]]([^/\\[\]]{1,60})[/\[\]]")

SYSTEM = (
    "You fill English learner flashcards for junior-high / IELTS-TOEFL high-frequency review. "
    "Return ONLY one JSON object. No markdown fences, no commentary. "
    "All string values MUST use double quotes; escape any \" inside strings as \\\". "
    "IPA reading MUST be a JSON string like \"/ʌp ˈtuː/\", never a bare /…/ token. "
    "Usage: Chinese numbered 1. 2. …; EACH line MUST include frequency score [1]-[10] "
    "right after the number (e.g. '1. [8] 动词：…'); 10=most common sense for that word; "
    "pick academic-exam-frequent uses; "
    "if the word has only one real high-frequency sense, output only ONE usage line; "
    "do NOT split one core sense into two near-duplicate lines just by rephrasing, narrowing the scene, "
    "or restating the same preposition/verb meaning; merge similar paraphrases into one line. "
    "NEVER write exam brand names (IELTS/TOEFL/雅思/托福 etc.) in usage text. "
    "Examples: example_sentences MUST be a plain string of alternating "
    "English line + 译文：Chinese line (NOT a JSON/Python array of objects); "
    "one short sentence per usage that MATCHES that usage "
    "(if usage is passive be expected to, the example MUST be passive; "
    "if usage is a phrase like get out, include that phrase); "
    "tense/inflection OK; keep other words VERY basic; "
    "NO hard vocabulary, NO long subordinate clauses—focus on the target usage."
)


def resolve_min_interval_sec() -> int:
    raw = (
        __import__("os").environ.get("EN_VOCAB_FILL_ONLINE_MIN_INTERVAL_SEC", "").strip()
        or load_env_file("en-vocab-fill.env").get(
            "EN_VOCAB_FILL_ONLINE_MIN_INTERVAL_SEC", ""
        )
        or str(DEFAULT_MIN_INTERVAL_SEC)
    )
    try:
        return max(30, int(raw))
    except ValueError:
        return DEFAULT_MIN_INTERVAL_SEC


def resolve_poison_sec() -> int:
    raw = (
        __import__("os").environ.get("EN_VOCAB_FILL_ONLINE_POISON_SEC", "").strip()
        or load_env_file("en-vocab-fill.env").get(
            "EN_VOCAB_FILL_ONLINE_POISON_SEC", ""
        )
        or str(DEFAULT_POISON_SEC)
    )
    try:
        return max(300, int(raw))
    except ValueError:
        return DEFAULT_POISON_SEC


def load_poison() -> dict[str, dict]:
    import time

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
    import time

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
        f"(reason={reason}) — 防同一词连环烧钱",
        flush=True,
    )


def acquire_paid_rate_gate(*, allow_burst: bool) -> bool:
    """全机付费调用最短间隔。返回 False = 本轮不许再打付费接口。"""
    import time

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
                f"[en-vocab-fill-online] rate-gate: 距上次付费调用仅 "
                f"{elapsed:.0f}s < {min_sec}s，skip（防狂打，约 {wait}s 后再试）",
                flush=True,
            )
            return False
    return True


def mark_paid_call() -> None:
    import time

    RATE_GATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    RATE_GATE_PATH.write_text(f"{time.time():.3f}\n", encoding="utf-8")


def normalize_ipa(text: str) -> str | None:
    text = (text or "").strip()
    if not text:
        return None
    m = _IPA_WRAPPED.match(text)
    if m:
        open_b, body, close_b = m.group(1), m.group(2).strip(), m.group(3)
        if (open_b, close_b) not in {("/", "/"), ("[", "]")} or not body:
            return None
        return f"/{body}/"
    found = _IPA_FIND.search(text)
    if found:
        body = found.group(1).strip()
        if body:
            return f"/{body}/"
    body = text.strip("/[] ")
    if body and re.search(r"[a-zɑæɒɔəɛɪʊʌθðŋʃʒˈˌː]", body, re.I):
        if " " not in body or re.search(r"[ˈˌːəɪʊʌʃʒθðŋ]", body):
            return f"/{body}/"
    return None


def strip_exam_labels(text: str) -> str:
    if not text:
        return ""
    lines = []
    for line in text.splitlines():
        cleaned = EXAM_LABEL_RE.sub("", line)
        cleaned = re.sub(r"\s{2,}", " ", cleaned).strip()
        cleaned = re.sub(r"[；;]{2,}", "；", cleaned)
        if cleaned:
            lines.append(cleaned)
    return "\n".join(lines).strip()


FREQ_PREFIX_RE = re.compile(r"^\[(\d{1,2})\]\s*(.+)$")
FREQ_LABEL_RE = re.compile(r"^\[频次\s*(\d{1,2})\]\s*(.+)$")
FREQ_TRAILING_RE = re.compile(
    r"^(.+?)\s*[【\[]\s*(?:频次\s*[:：]?\s*)?(\d{1,2})\s*[】\]]\s*$"
)
NUMBERED_USAGE_RE = re.compile(r"^\s*(\d+)\s*[.、．)\]]\s*(.+)$")


def _extract_usage_frequency(body: str) -> tuple[int | None, str]:
    raw = str(body or "").strip()
    if not raw:
        return None, ""
    for pattern, score_g, text_g in (
        (FREQ_PREFIX_RE, 1, 2),
        (FREQ_LABEL_RE, 1, 2),
        (FREQ_TRAILING_RE, 2, 1),
    ):
        m = pattern.match(raw)
        if not m:
            continue
        try:
            score = int(m.group(score_g))
        except (TypeError, ValueError):
            continue
        text = str(m.group(text_g) or "").strip()
        if 1 <= score <= 10 and text:
            return score, text
    return None, raw


def normalize_usage(value: Any) -> str:
    """用法 →「1. [8] 中文…」；支持字符串或 [{text, frequency}, …]。

    任一条缺 1～10 出现频次则返回空串（调用方应重试，勿写库）。
    """
    lines_out: list[str] = []

    def push(text: str, frequency: Any = None) -> bool:
        body = LEADING_INDEX_RE.sub("", str(text or "")).strip()
        if not body:
            return True
        freq, body_text = _extract_usage_frequency(body)
        if freq is None and frequency is not None:
            try:
                score = int(frequency)
            except (TypeError, ValueError):
                score = 0
            if 1 <= score <= 10:
                freq = score
        if not body_text:
            return True
        if freq is None:
            return False
        lines_out.append(f"{len(lines_out) + 1}. [{freq}] {body_text}")
        return True

    ok = True
    if isinstance(value, list):
        for item in value:
            if isinstance(item, dict):
                if not push(
                    item.get("text")
                    or item.get("usage")
                    or item.get("zh")
                    or "",
                    item.get("frequency")
                    or item.get("freq")
                    or item.get("score"),
                ):
                    ok = False
                    break
            elif isinstance(item, str):
                if not push(item):
                    ok = False
                    break
        return "\n".join(lines_out).strip() if ok and lines_out else ""

    if isinstance(value, dict):
        if not push(
            value.get("text") or value.get("usage") or "",
            value.get("frequency") or value.get("freq") or value.get("score"),
        ):
            return ""
        return "\n".join(lines_out).strip()

    text = strip_exam_labels(str(value or ""))
    if not text:
        return ""
    for line in text.splitlines():
        trimmed = line.strip()
        if not trimmed:
            continue
        m = NUMBERED_USAGE_RE.match(trimmed)
        if m:
            if not push(m.group(2)):
                return ""
        else:
            if not push(trimmed):
                return ""
    return "\n".join(lines_out).strip() if lines_out else ""


def normalize_example_sentences(value: Any) -> str:
    """把模型返回的例句规范成「英文\\n译文：」交替纯文本。

    禁止：对 list/dict 直接 str() —— 会变成 Python 列表字面量入库（页面乱码）。
    """
    lines: list[str] = []

    def push_pair(sentence: str, translation: str = "") -> None:
        sent = LEADING_INDEX_RE.sub("", str(sentence or "")).strip()
        if not sent:
            return
        lines.append(sent)
        gloss = str(translation or "").strip()
        if gloss:
            if not re.match(r"^(译文|翻譯|翻译|译|譯)\s*[:：]", gloss):
                gloss = f"译文：{gloss}"
            lines.append(gloss)

    if isinstance(value, list):
        for item in value:
            if isinstance(item, dict):
                push_pair(
                    item.get("sentence")
                    or item.get("text")
                    or item.get("en")
                    or "",
                    item.get("translation")
                    or item.get("gloss")
                    or item.get("zh")
                    or "",
                )
            elif isinstance(item, str):
                t = LEADING_INDEX_RE.sub("", item).strip()
                if t:
                    lines.append(t)
        return "\n".join(lines).strip()

    if isinstance(value, dict):
        push_pair(
            value.get("sentence") or value.get("text") or value.get("en") or "",
            value.get("translation")
            or value.get("gloss")
            or value.get("zh")
            or "",
        )
        return "\n".join(lines).strip()

    text = str(value or "").strip()
    if not text:
        return ""

    # 误把 list 用 str() 后的 Python / JSON dump：尽量还原
    if re.match(r"^\s*[\[{]", text) and re.search(
        r"['\"](?:sentence|translation|text|gloss)['\"]\s*:", text
    ):
        try:
            parsed = json.loads(text)
            return normalize_example_sentences(parsed)
        except json.JSONDecodeError:
            pass
        # Python 单引号：正则抽句
        for m in re.finditer(
            r"'(?:sentence|text|en)'\s*:\s*'((?:\\'|[^'])*)'\s*,\s*"
            r"'(?:translation|gloss|zh)'\s*:\s*'((?:\\'|[^'])*)'",
            text,
        ):
            push_pair(
                m.group(1).replace("\\'", "'"),
                m.group(2).replace("\\'", "'"),
            )
        if lines:
            return "\n".join(lines).strip()
        for m in re.finditer(
            r'"(?:sentence|text|en)"\s*:\s*"((?:\\"|[^"])*)"\s*,\s*'
            r'"(?:translation|gloss|zh)"\s*:\s*"((?:\\"|[^"])*)"',
            text,
        ):
            push_pair(
                m.group(1).replace('\\"', '"'),
                m.group(2).replace('\\"', '"'),
            )
        if lines:
            return "\n".join(lines).strip()
        return ""  # dump 还原失败 → 空，勿把乱码写回

    for line in text.splitlines():
        t = LEADING_INDEX_RE.sub("", line).strip()
        if t:
            lines.append(t)
    return "\n".join(lines).strip()


def parse_json_object(raw: str) -> dict[str, Any]:
    return parse_llm_json_object(raw)


def build_prompt(row: dict[str, Any], needs: dict[str, bool]) -> str:
    word = str(row.get("word") or "").strip()
    kind = str(row.get("kind") or "word")
    category = str(row.get("category") or "").strip()
    kind_label = "语法" if kind == "grammar" else "单词"
    need_keys = [k for k, v in needs.items() if v]
    if not category or category == "雅思托福":
        category_focus = (
            "选题按雅思、托福这类学术英语考试的高频语境，"
            "优先写作、阅读、听力常见用法。"
        )
    elif "托业" in category or "TOEIC" in category.upper():
        category_focus = (
            "选题按托业这类职场/商务英语考试的高频语境，"
            "优先邮件、会议、办公室、客户沟通、日常工作场景用法。"
        )
    else:
        category_focus = f"选题按「{category}」这一分类对应语境的高频用法。"
    return f"""词条：{word}
分类：{category or "雅思托福"}
类型：{kind_label}

说明：该词条有字段缺失或不完整。请用更准确的内容 **整词重写** 下列字段（覆盖旧值，不要只补空缺）：
{", ".join(need_keys)}
{category_focus}

参考（可忽略，以你重写为准）：
已有音标：{row.get("reading") or "（无）"}
已有释义：{row.get("meaning") or "（无）"}
已有词性：{row.get("pos") or "（无）"}
已有用法：{row.get("usage") or "（无）"}
已有例句：{row.get("example_sentences") or "（无）"}

输出 JSON（需要的字段必须给出非空值）：
- reading: 美式 IPA，形如 /həˈloʊ/
- meaning: 中文释义，分号分隔，最多 3 义
- pos: 英文词性缩写，多词性用 /，如 v 或 adj/n
- usage: 编号中文用法；每条必须带出现频次 [1]～[10]（10=该词最常见用法），形如「1. [8] 介词：…」；组数=真实不同核心义项数（1 种就 1 条，禁止硬凑 2 条）；禁止按对象/场景硬拆同一义（如 attractive「对客户有吸引力」与「外表好看」须合并）；禁止近义微调硬拆（如 carefully「仔细地完成工作」与「谨慎地避免出错」须合并为 1 条）；若两条候选用法造出的例句几乎可互换，必须合并成 1 条；只有词性/词典义/固定结构真不同才拆条；每条只标一种词性，禁止「动词/名词」等含糊写法（例句是名词就标名词；名词与动词义都常用则拆成两条）；选题按上方分类语境高频，正文禁止考试品牌名。也可返回数组 [{{"text":"…","frequency":8}},…]（frequency 必填 1～10）
- example_sentences: 字符串（不要 JSON 数组）。与 usage 一一对应；每条英文完整短句 + 下一行「译文：中文」交替；用法是被动则例句必须被动；时态/词形可变；其余词要极简单；不要难词、不要长难从句；不要行首编号；禁止输出 [{{"sentence":...}}] 这类结构

只输出 JSON。"""


def source_label() -> str:
    """付费 API 代理实际模型 → 写回 reading/meaning/usage/examples 的 source。"""
    return build_online_source_label()


def full_refresh_needs(kind: str) -> dict[str, bool]:
    """线上模式：只要触发检测，就整词重拉（付费更准，覆盖写回）。"""
    if kind == "grammar":
        return {
            "reading": False,
            "meaning": False,
            "pos": False,
            "usage": True,
            "example_sentences": True,
        }
    return {
        "reading": True,
        "meaning": True,
        "pos": True,
        "usage": True,
        "example_sentences": True,
    }


DB_NAME = "strategy-compare-db"
ONLINE_SOURCE_MARK = "线上"


def _row_from_db(row: dict[str, Any]) -> dict[str, Any]:
    kind = str(row.get("kind") or "word")
    return {
        "id": int(row.get("id") or 0),
        "word": row.get("word"),
        "kind": kind,
        "reading": row.get("reading"),
        "meaning": row.get("meaning"),
        "pos": row.get("pos"),
        "category": row.get("category"),
        "usage": row.get("usage"),
        "example_sentences": row.get("example_sentences"),
        "meaning_source": row.get("meaning_source"),
        "usage_source": row.get("usage_source"),
        "example_sentences_source": row.get("example_sentences_source"),
        "reading_source": row.get("reading_source"),
        "needs": full_refresh_needs(kind),
        "triggered": True,
    }


def fetch_words_from_d1(
    *,
    word_id: int | None = None,
    skip_online: bool = False,
) -> list[dict[str, Any]]:
    """整库强制重拉：经 wrangler 读 D1（list_missing 为空时仍可覆盖本地结果）。"""
    import json
    import subprocess

    where = "WHERE 1=1"
    if word_id and word_id > 0:
        where = f"WHERE id = {int(word_id)}"
    sql = (
        "SELECT id, word, kind, reading, meaning, pos, category, usage, example_sentences, "
        "reading_source, meaning_source, usage_source, example_sentences_source "
        f"FROM en_vocab_word {where} ORDER BY id;"
    )
    proc = subprocess.run(
        [
            "npx",
            "wrangler",
            "d1",
            "execute",
            DB_NAME,
            "--remote",
            "--json",
            "--command",
            sql,
        ],
        cwd=str(ROOT),
        check=True,
        capture_output=True,
        text=True,
    )
    payload = json.loads(proc.stdout)
    raw_rows = payload[0]["results"] if payload else []
    out: list[dict[str, Any]] = []
    for raw in raw_rows:
        row = _row_from_db(raw)
        if row["id"] <= 0:
            continue
        if skip_online:
            sources = " ".join(
                str(row.get(k) or "")
                for k in (
                    "meaning_source",
                    "usage_source",
                    "example_sentences_source",
                    "reading_source",
                )
            )
            if ONLINE_SOURCE_MARK in sources:
                continue
        out.append(row)
    return out


def fetch_candidates(token: str, *, limit: int) -> list[dict[str, Any]]:
    """合并各阶段 list_missing；任一字段缺 → 整词进入刷新队列。

    排序：优先当日序号（daily_seq）靠前——这些更可能进今日抽查池。
    """
    by_id: dict[int, dict[str, Any]] = {}

    def merge(rows: list) -> None:
        for row in rows:
            wid = int(row.get("id") or 0)
            if wid <= 0:
                continue
            cur = by_id.get(wid)
            if not cur:
                kind = str(row.get("kind") or "word")
                cur = {
                    "id": wid,
                    "word": row.get("word"),
                    "kind": kind,
                    "reading": row.get("reading"),
                    "meaning": row.get("meaning"),
                    "pos": row.get("pos"),
                    "category": row.get("category"),
                    "usage": row.get("usage"),
                    "example_sentences": row.get("example_sentences"),
                    "daily_seq": row.get("daily_seq"),
                    "needs": full_refresh_needs(kind),
                    "triggered": True,
                }
                by_id[wid] = cur
            for field in ("reading", "meaning", "pos", "category", "usage", "kind", "word"):
                if row.get(field) and not cur.get(field):
                    cur[field] = row.get(field)
            # 取各阶段返回里更靠前的当日序号
            seq = row.get("daily_seq")
            try:
                seq_n = int(seq) if seq is not None else None
            except (TypeError, ValueError):
                seq_n = None
            if seq_n is not None and seq_n > 0:
                prev = cur.get("daily_seq")
                try:
                    prev_n = int(prev) if prev is not None else None
                except (TypeError, ValueError):
                    prev_n = None
                if prev_n is None or seq_n < prev_n:
                    cur["daily_seq"] = seq_n
            # 若后来发现是 grammar，收窄 needs
            if str(cur.get("kind") or "") == "grammar":
                cur["needs"] = full_refresh_needs("grammar")

    scan_limit = max(limit * 8, 24)
    for url in (READING_URL, MEANING_URL, USAGE_URL, EXAMPLES_URL):
        data = call_api(
            url,
            token,
            {"mode": "list_missing", "limit": scan_limit},
            user_agent="en-vocab-fill-online-batch/1.0",
        )
        merge(list(data.get("missing") or []))

    rows = list(by_id.values())

    def _daily_sort_key(r: dict[str, Any]) -> tuple[int, int]:
        try:
            seq = int(r.get("daily_seq")) if r.get("daily_seq") is not None else 10**9
        except (TypeError, ValueError):
            seq = 10**9
        if seq <= 0:
            seq = 10**9
        return (seq, int(r.get("id") or 0))

    rows.sort(key=_daily_sort_key)
    return rows[: max(1, limit)]


def apply_bundle(
    token: str,
    *,
    word_id: int,
    payload: dict[str, Any],
    needs: dict[str, bool],
    source: str,
    dry_run: bool,
) -> list[str]:
    """force=True：覆盖写回；validate_format=False：付费原文透传，不做严校验拒收。"""
    done: list[str] = []
    if dry_run:
        for k, need in needs.items():
            if need and payload.get(k):
                done.append(f"dry:{k}")
        return done

    def _apply(url: str, updates: list[dict]) -> dict:
        return call_api(
            url,
            token,
            {
                "mode": "apply",
                "force": True,
                "validate_format": False,
                "source": source,
                "updates": updates,
            },
            user_agent="en-vocab-fill-online-batch/1.0",
        )

    if needs.get("reading") and payload.get("reading"):
        r = _apply(
            READING_URL,
            [
                {
                    "word_id": word_id,
                    "reading": payload["reading"],
                    "source": source,
                }
            ],
        )
        if int(r.get("updated") or 0) > 0:
            done.append("reading")
        elif r.get("skipped"):
            print(f"    reading skipped={r.get('skipped')}", flush=True)

    meaning_update: dict[str, Any] = {"word_id": word_id, "source": source}
    if needs.get("meaning") and payload.get("meaning"):
        meaning_update["meaning"] = payload["meaning"]
    if needs.get("pos") and payload.get("pos"):
        meaning_update["pos"] = payload["pos"]
    if "meaning" in meaning_update or "pos" in meaning_update:
        r = _apply(MEANING_URL, [meaning_update])
        if int(r.get("updated") or 0) > 0:
            done.append("meaning/pos")
        elif r.get("skipped"):
            print(f"    meaning skipped={r.get('skipped')}", flush=True)

    if needs.get("usage") and payload.get("usage"):
        r = _apply(
            USAGE_URL,
            [
                {
                    "word_id": word_id,
                    "usage": payload["usage"],
                    "source": source,
                }
            ],
        )
        if int(r.get("updated") or 0) > 0:
            done.append("usage")
        elif r.get("skipped"):
            print(f"    usage skipped={r.get('skipped')}", flush=True)

    if needs.get("example_sentences") and payload.get("example_sentences"):
        r = _apply(
            EXAMPLES_URL,
            [
                {
                    "word_id": word_id,
                    "example_sentences": payload["example_sentences"],
                    "source": source,
                }
            ],
        )
        if int(r.get("updated") or 0) > 0:
            done.append("example_sentences")
        elif r.get("skipped"):
            print(f"    examples skipped={r.get('skipped')}", flush=True)

    return done


def _log_raw_snippet(raw: str, *, label: str = "raw") -> None:
    snippet = re.sub(r"\s+", " ", (raw or "").strip())[:280]
    if snippet:
        print(f"    {label} snippet: {snippet}", flush=True)


def generate_bundle(row: dict[str, Any], needs: dict[str, bool]) -> dict[str, Any]:
    prompt = build_prompt(row, needs)
    raw = call_anthropic(
        prompt,
        system=SYSTEM,
        max_tokens=4500,
        temperature=0.3,
        timeout=180,
    )
    try:
        data = parse_json_object(raw)
    except ValueError as err:
        # 坏 JSON：再要一次严格输出，避免同一词空烧到熔断
        _log_raw_snippet(raw, label="bad_json")
        print(f"    retry generate after JSON error: {err}", flush=True)
        raw = call_anthropic(
            prompt
            + "\n\nCRITICAL: Previous reply was invalid JSON ("
            + str(err)[:120]
            + "). Output ONE valid JSON object only. "
            "Escape every double-quote inside string values. "
            'reading must be a quoted string like "/ʌp ˈtuː/".',
            system=SYSTEM,
            max_tokens=4500,
            temperature=0.1,
            timeout=180,
        )
        try:
            data = parse_json_object(raw)
        except ValueError:
            _log_raw_snippet(raw, label="bad_json_retry")
            raise
    out: dict[str, Any] = {}

    if needs.get("reading"):
        ipa = normalize_ipa(str(data.get("reading") or ""))
        if ipa:
            out["reading"] = ipa

    if needs.get("meaning"):
        meaning = str(data.get("meaning") or "").strip()
        if meaning:
            out["meaning"] = meaning

    if needs.get("pos"):
        pos = str(data.get("pos") or "").strip()
        if pos:
            out["pos"] = pos

    if needs.get("usage"):
        usage = normalize_usage(data.get("usage"))
        if not usage:
            # 缺 [1]～[10] 时再要一次，避免 force 写回无频次旧格式
            retry_raw = call_anthropic(
                build_prompt(row, needs)
                + "\n\nCRITICAL: usage 每一行必须带出现频次 [1]～[10]，"
                "形如「1. [8] 中文说明」。缺分值的 JSON 不可用，请重输出完整 JSON。",
                system=SYSTEM,
                max_tokens=4500,
                temperature=0.2,
                timeout=180,
            )
            retry_data = parse_json_object(retry_raw)
            usage = normalize_usage(retry_data.get("usage"))
            if usage and not out.get("meaning") and needs.get("meaning"):
                meaning = str(retry_data.get("meaning") or "").strip()
                if meaning:
                    out["meaning"] = meaning
            if usage and not out.get("pos") and needs.get("pos"):
                pos = str(retry_data.get("pos") or "").strip()
                if pos:
                    out["pos"] = pos
            if usage and needs.get("example_sentences"):
                data = retry_data
        if usage:
            out["usage"] = usage

    if needs.get("example_sentences"):
        # 切勿 str(list)：会变成 Python 列表字面量入库
        ex = normalize_example_sentences(data.get("example_sentences"))
        if ex:
            out["example_sentences"] = ex

    return out



def now_local_str() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def report_word_run_to_maintenance_center(payload: dict[str, Any]) -> None:
    """维护中心「词条补全 · 英语」；维护中心未开时静默跳过。"""
    try:
        body_obj = dict(payload)
        if not str(body_obj.get("fill_task") or "").strip():
            body_obj["fill_task"] = "en-vocab-fill"
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


def process_one(
    token: str,
    row: dict[str, Any],
    *,
    index: int,
    total: int,
    dry_run: bool,
    allow_burst: bool,
) -> bool:
    """处理一词；成功写回返回 True。"""
    import time

    if not acquire_paid_rate_gate(allow_burst=allow_burst):
        # 人工整库重跑时等满间隔再继续，不丢词
        min_sec = resolve_min_interval_sec()
        print(f"    rate-gate wait {min_sec}s…", flush=True)
        time.sleep(min_sec)
        if not acquire_paid_rate_gate(allow_burst=allow_burst):
            print("    rate-gate still blocked, skip this word this pass", flush=True)
            return False

    wid = int(row["id"])
    word = str(row.get("word") or "")
    needs = dict(row.get("needs") or {})
    need_list = [k for k, v in needs.items() if v]
    print(
        f"  [{index}/{total}] id={wid} word={word!r} full_refresh={need_list}",
        flush=True,
    )
    report_word_run_to_maintenance_center(
        {
            "word_id": wid,
            "word": word,
            "kind": "word",
            "status": "running",
            "started_at": now_local_str(),
        }
    )

    source = source_label()
    mark_paid_call()
    try:
        payload = generate_bundle(row, needs)
    except Exception as err:
        print(f"    fail generate: {err}", flush=True)
        report_word_run_to_maintenance_center(
            {
                "word_id": wid,
                "word": word,
                "kind": "word",
                "status": "failed",
                "error": f"generate:{err}",
                "finished_at": now_local_str(),
            }
        )
        mark_poison(wid, word, f"generate:{err}")
        after_attempt(
            scope="en-online",
            word_id=wid,
            word=word,
            fixed=False,
            detail=f"generate:{err}",
        )
        return False

    if not payload:
        print("    empty payload", flush=True)
        mark_poison(wid, word, "empty_payload")
        after_attempt(
            scope="en-online",
            word_id=wid,
            word=word,
            fixed=False,
            detail="empty_payload",
        )
        return False

    preview = {
        k: (str(v)[:80] + ("…" if len(str(v)) > 80 else ""))
        for k, v in payload.items()
    }
    print(f"    got={preview}", flush=True)

    if dry_run:
        print(f"    dry-run skip apply source={source}", flush=True)
        return True

    done = apply_bundle(
        token,
        word_id=wid,
        payload=payload,
        needs=needs,
        source=source,
        dry_run=False,
    )
    print(f"    applied={done} source={source}", flush=True)
    preview_text = json.dumps(preview, ensure_ascii=False)
    report_word_run_to_maintenance_center(
        {
            "word_id": wid,
            "word": word,
            "kind": "word",
            "status": "success" if done else "failed",
            "source": source,
            "applied": str(done),
            "preview": preview_text,
            "error": "" if done else "apply_none",
            "finished_at": now_local_str(),
        }
    )
    if not done:
        mark_poison(wid, word, "apply_none")
        after_attempt(
            scope="en-online",
            word_id=wid,
            word=word,
            fixed=False,
            detail="apply_none",
        )
        return False
    after_attempt(
        scope="en-online",
        word_id=wid,
        word=word,
        fixed=True,
        detail="applied",
    )
    return True


def main() -> int:
    assert_not_killed("en-online-batch")
    import os
    import time

    cfg = load_env_file("en-vocab-fill.env")
    parser = argparse.ArgumentParser(
        description="Fill en-vocab fields in one paid Anthropic call"
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="每轮最多处理条数；定时默认 1。"
        " --refill-all 不传则整库；传正整数则封顶",
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--force",
        action="store_true",
        help="即使开关为本地也运行（调试用）",
    )
    parser.add_argument(
        "--allow-burst",
        action="store_true",
        help="跳过 60s 付费间隔闸（仅人工调试；定时任务禁止）",
    )
    parser.add_argument(
        "--word-id",
        type=int,
        help="只处理指定 word_id（调试 / 整库重拉单条）",
    )
    parser.add_argument(
        "--refill-all",
        action="store_true",
        help="整库强制重拉（经 D1 拉全表；覆盖已有本地结果；须配合人工，非定时默认）",
    )
    parser.add_argument(
        "--skip-online",
        action="store_true",
        help="与 --refill-all 合用：跳过来源已含「线上」的词",
    )
    parser.add_argument(
        "--sleep-sec",
        type=float,
        default=2.0,
        help="--refill-all 多词之间的间隔秒数（默认 2；仍受 rate-gate 约束除非 --allow-burst）",
    )
    args = parser.parse_args()

    if not args.force and not is_online_backend():
        print(
            f"[en-vocab-fill-online] backend={backend_label()} → skip "
            f"(改 scripts/lib/en_vocab_llm_backend.py 里 EN_VOCAB_FILL_LLM_BACKEND=1)",
            flush=True,
        )
        return 0

    if skip_if_worker_unavailable(READING_URL, label="en-vocab-fill-online"):
        return 0

    token = resolve_token()
    if not token:
        raise SystemExit("缺少 JP_REVIEW_UPLOAD_TOKEN")

    allow_burst = bool(
        args.allow_burst
        or os.environ.get("EN_VOCAB_FILL_ONLINE_ALLOW_BURST", "").strip()
        in ("1", "true", "yes")
    )
    refill_all = bool(args.refill_all)
    # 定时默认每轮最多 1 词；--refill-all 不传 --limit 则整库
    if args.limit is None:
        if refill_all:
            limit = 10_000
        else:
            limit = min(
                HARD_ONLINE_LIMIT,
                max(
                    1,
                    int(cfg.get("EN_VOCAB_FILL_ONLINE_LIMIT") or HARD_ONLINE_LIMIT),
                ),
            )
    elif int(args.limit) <= 0:
        limit = 10_000 if refill_all else HARD_ONLINE_LIMIT
    elif refill_all:
        limit = max(1, int(args.limit))
    else:
        limit = min(HARD_ONLINE_LIMIT, max(1, int(args.limit)))

    print(
        f"[en-vocab-fill-online] backend={backend_label()} model={anthropic_model()} "
        f"limit={limit} refill_all={refill_all} allow_burst={allow_burst} "
        f"min_interval={resolve_min_interval_sec()}s",
        flush=True,
    )

    poison = load_poison()
    if refill_all or args.word_id:
        candidates = fetch_words_from_d1(
            word_id=args.word_id,
            skip_online=bool(args.skip_online),
        )
        if not refill_all and args.word_id:
            candidates = candidates[:1]
        else:
            candidates = [
                r
                for r in candidates
                if str(int(r.get("id") or 0)) not in poison
            ][:limit]
    else:
        if not acquire_paid_rate_gate(allow_burst=allow_burst):
            return 0
        candidates = fetch_candidates(token, limit=max(limit * 12, 12))
        if args.word_id:
            candidates = [
                r for r in candidates if int(r.get("id") or 0) == args.word_id
            ]
        else:
            candidates = [
                r
                for r in candidates
                if str(int(r.get("id") or 0)) not in poison
            ][:limit]

    print(
        f"[en-vocab-fill-online] candidates={len(candidates)} "
        f"poison_active={len(poison)}",
        flush=True,
    )
    if not candidates:
        print("  无待补全词条（或均在毒丸冷却中 / 已全是线上）", flush=True)
        return 0

    ok_n = 0
    total = len(candidates)
    for i, row in enumerate(candidates, start=1):
        if process_one(
            token,
            row,
            index=i,
            total=total,
            dry_run=bool(args.dry_run),
            allow_burst=allow_burst,
        ):
            ok_n += 1
        if i < total and args.sleep_sec > 0:
            time.sleep(float(args.sleep_sec))

    print(f"[en-vocab-fill-online] done ok={ok_n}/{total}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
