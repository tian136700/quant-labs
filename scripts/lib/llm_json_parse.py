"""从 LLM 纯文本里抠出 JSON object（付费/本地补全共用）。

模型常在字符串里塞未转义引号、或把 IPA 写成 /…/ 不带引号，
标准 json.loads 会报 Expecting ',' delimiter —— 须兜底修复，避免同一词烧满 3 次熔断。
"""

from __future__ import annotations

import json
import re
from typing import Any

FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE | re.MULTILINE)
# "key": /ipa…/  → "key": "/ipa…/"
_BARE_IPA_VALUE = re.compile(
    r'("(?:reading|ipa|phonetic)"\s*:\s*)(/[^/\n]{0,80}/)',
    re.IGNORECASE,
)
_SMART_QUOTES = str.maketrans(
    {
        "\u201c": '"',
        "\u201d": '"',
        "\u2018": "'",
        "\u2019": "'",
        "\uff02": '"',
    }
)


def strip_code_fence(raw: str) -> str:
    return FENCE_RE.sub("", (raw or "").strip()).strip()


def _candidates(text: str) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()

    def add(s: str) -> None:
        s = (s or "").strip()
        if not s or s in seen:
            return
        seen.add(s)
        out.append(s)

    add(text)
    add(text.translate(_SMART_QUOTES))
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        chunk = text[start : end + 1]
        add(chunk)
        add(chunk.translate(_SMART_QUOTES))
        # 去尾逗号：{ "a":1, }
        add(re.sub(r",\s*([}\]])", r"\1", chunk))
        # IPA 裸值
        add(_BARE_IPA_VALUE.sub(r'\1"\2"', chunk))
        add(_BARE_IPA_VALUE.sub(r'\1"\2"', chunk.translate(_SMART_QUOTES)))
    return out


def _try_load(s: str) -> dict[str, Any] | None:
    try:
        data = json.loads(s)
    except json.JSONDecodeError:
        return None
    return data if isinstance(data, dict) else None


def _raw_decode_object(s: str) -> dict[str, Any] | None:
    start = s.find("{")
    if start < 0:
        return None
    try:
        data, _ = json.JSONDecoder().raw_decode(s[start:])
    except json.JSONDecodeError:
        return None
    return data if isinstance(data, dict) else None


_FIELD_STRING_RE = re.compile(
    r'"(reading|meaning|pos|usage|example_sentences)"\s*:\s*"((?:\\.|[^"\\])*)"',
    re.DOTALL,
)


def _extract_known_fields(text: str) -> dict[str, Any] | None:
    """JSON 整体烂了时，尽量用正则抠出已知字段（比整轮熔断强）。"""
    out: dict[str, Any] = {}
    for m in _FIELD_STRING_RE.finditer(text):
        key = m.group(1)
        try:
            out[key] = json.loads(f'"{m.group(2)}"')
        except json.JSONDecodeError:
            out[key] = m.group(2).replace('\\"', '"').replace("\\n", "\n")
    # usage 偶发用数组
    arr = re.search(
        r'"usage"\s*:\s*(\[[\s\S]*?\])\s*(?:,|\})',
        text,
    )
    if arr and "usage" not in out:
        try:
            parsed = json.loads(arr.group(1))
            if isinstance(parsed, list):
                out["usage"] = parsed
        except json.JSONDecodeError:
            pass
    return out if out else None


def parse_llm_json_object(raw: str) -> dict[str, Any]:
    """解析模型输出为 dict；失败抛 ValueError（带原因摘要）。"""
    text = strip_code_fence(raw)
    if not text:
        raise ValueError("model output empty")

    last_err: Exception | None = None
    for cand in _candidates(text):
        data = _try_load(cand)
        if data is not None:
            return data
        data = _raw_decode_object(cand)
        if data is not None:
            return data

    # 最后兜底：已知字段
    fields = _extract_known_fields(text.translate(_SMART_QUOTES))
    if fields:
        return fields

    # 保留原始 json 错误信息（便于熔断报告）
    try:
        json.loads(text if text.startswith("{") else text[text.find("{") :])
    except json.JSONDecodeError as err:
        last_err = err
    except Exception as err:
        last_err = err

    if last_err is not None:
        raise ValueError(str(last_err)) from last_err
    raise ValueError("model output is not a JSON object")
