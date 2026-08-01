"""日语词条口语/考试频率（1～10）从 AI 正文剥离。"""

from __future__ import annotations

import re

FREQ_BLOCK_MARKERS = ("【出现频率】", "【频率】")
ORAL_LINE_RE = re.compile(
    r"^(?:口语频率|口语出现频率|oral(?:[_\s-]?freq(?:uency)?)?)\s*[:：]\s*(\d{1,2})\s*$",
    re.I,
)
EXAM_LINE_RE = re.compile(
    r"^(?:考试频率|考试出现频率|exam(?:[_\s-]?freq(?:uency)?)?)\s*[:：]\s*(\d{1,2})\s*$",
    re.I,
)


def clamp_freq(raw: object) -> int | None:
    try:
        n = int(str(raw).strip())
    except (TypeError, ValueError):
        return None
    if 1 <= n <= 10:
        return n
    return None


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

    return "\n".join(kept).strip(), oral, exam
