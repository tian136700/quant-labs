"""日语词条口语/考试频率（1～10）从 AI 正文剥离。

模型常写成「口语频率：8/10」、短标签「口语：8」、同一行、JSON、或列表前缀；
须宽容解析，避免 word_ai_incomplete oral=None exam=None 空烧。
"""

from __future__ import annotations

import json
import re

FREQ_BLOCK_MARKERS = ("【出现频率】", "【频率】")

# 行首可有列表/编号前缀；标签后可有 /10、分、点
_LINE_PREFIX = r"^(?:[-*•]|\d{1,2}[.)、])?\s*"
_SCORE = r"(\d{1,2})(?:\s*/\s*10)?(?:\s*[分点])?"

ORAL_LINE_RE = re.compile(
    _LINE_PREFIX
    + r"(?:口语(?:出现)?频率|oral(?:[_\s-]?freq(?:uency)?)?|口语)\s*[:：\s]\s*"
    + _SCORE
    + r"\s*$",
    re.I,
)
EXAM_LINE_RE = re.compile(
    _LINE_PREFIX
    + r"(?:考试(?:出现)?频率|exam(?:[_\s-]?freq(?:uency)?)?|考试)\s*[:：\s]\s*"
    + _SCORE
    + r"\s*$",
    re.I,
)

# 同一行：口语频率：8/10 考试频率：6/10
SAME_LINE_RE = re.compile(
    r"(?:口语(?:出现)?频率|oral(?:[_\s-]?freq(?:uency)?)?|口语)\s*[:：\s]\s*"
    + _SCORE
    + r"\s*(?:[·|,，/\s]+)\s*"
    r"(?:考试(?:出现)?频率|exam(?:[_\s-]?freq(?:uency)?)?|考试)\s*[:：\s]\s*"
    + _SCORE,
    re.I,
)

JSON_ORAL_KEYS = ("oral_frequency", "oral", "oralFreq", "oral_freq")
JSON_EXAM_KEYS = ("exam_frequency", "exam", "examFreq", "exam_freq")


def clamp_freq(raw: object) -> int | None:
    try:
        n = int(str(raw).strip())
    except (TypeError, ValueError):
        return None
    if 1 <= n <= 10:
        return n
    return None


def _from_json_blob(text: str) -> tuple[int | None, int | None]:
    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end <= start:
        return None, None
    try:
        data = json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        return None, None
    if not isinstance(data, dict):
        return None, None
    oral = None
    exam = None
    for k in JSON_ORAL_KEYS:
        if k in data:
            oral = clamp_freq(data.get(k))
            if oral is not None:
                break
    for k in JSON_EXAM_KEYS:
        if k in data:
            exam = clamp_freq(data.get(k))
            if exam is not None:
                break
    return oral, exam


def extract_jp_vocab_frequencies(raw: str) -> tuple[str, int | None, int | None]:
    """返回 (剥掉频率行后的正文, oral, exam)。"""
    text = str(raw or "").replace("\r\n", "\n")
    if not text.strip():
        return "", None, None

    oral: int | None = None
    exam: int | None = None
    kept: list[str] = []
    in_block = False

    for line in text.split("\n"):
        trimmed = line.strip()
        if not trimmed:
            if not in_block:
                kept.append(line)
            continue
        if trimmed in FREQ_BLOCK_MARKERS:
            in_block = True
            continue

        m_same = SAME_LINE_RE.search(trimmed)
        if m_same:
            oral = clamp_freq(m_same.group(1)) or oral
            exam = clamp_freq(m_same.group(2)) or exam
            in_block = True
            continue

        m_oral = ORAL_LINE_RE.match(trimmed)
        if m_oral:
            oral = clamp_freq(m_oral.group(1)) or oral
            in_block = True
            continue
        m_exam = EXAM_LINE_RE.match(trimmed)
        if m_exam:
            exam = clamp_freq(m_exam.group(1)) or exam
            in_block = True
            continue
        if in_block:
            in_block = False
        kept.append(line)

    if oral is None or exam is None:
        j_oral, j_exam = _from_json_blob(text)
        if oral is None:
            oral = j_oral
        if exam is None:
            exam = j_exam

    return "\n".join(kept).strip(), oral, exam
