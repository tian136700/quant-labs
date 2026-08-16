#!/usr/bin/env python3
"""Regression: ～時／とき 接续禁止动词／形容词误接「の時」。

对照 src/lib/jp-vocab-connection-toki.ts
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOKI_TS = ROOT / "src/lib/jp-vocab-connection-toki.ts"
CONN_AI = ROOT / "src/lib/jp-vocab-connection-ai.ts"
UPLOAD = ROOT / "src/lib/jp-vocab-connection-upload-spec.ts"
PROMPT = ROOT / "src/lib/jp-vocab-connection-prompt.ts"
CHECK_GUARD = ROOT / "scripts/check_jp_vocab_content_quality_guard.py"


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def has_wrong(raw: str) -> bool:
    """Mirror connectionHasWrongTokiNoParticle (line/seg level)."""
    for line in str(raw or "").replace("\r\n", "\n").split("\n"):
        body = re.sub(r"^用法\s*\d+\s*[:：]\s*", "", line.strip()).strip()
        if not body:
            continue
        segs = re.split(r"[；;]", body) if re.search(r"[；;]", body) else [body]
        for seg in segs:
            s = seg.strip()
            if re.search(r"名词", s) and not re.search(r"(?:动词|形容词)", s):
                continue
            if re.search(
                r"(?:二类形容词|な形容词)[^；;\n]*な\s*[＋+]\s*の(?:時|とき)", s
            ):
                return True
            if re.search(
                r"(?:动词|一类动词|二类动词|三类动词|一类形容词)[^；;\n]*[＋+]の(?:時|とき)",
                s,
            ):
                return True
    return False


def rewrite(raw: str) -> str:
    """Mirror rewriteJpVocabConnectionTokiNoParticle."""
    text = str(raw or "")
    if not text.strip():
        return text
    if not re.search(r"(?:時|とき)", text) or not re.search(r"[＋+]の", text):
        return text
    out_lines = []
    for line in text.split("\n"):
        if not line.strip():
            out_lines.append(line)
            continue
        m = re.match(r"^(用法\s*\d+\s*[:：]\s*)", line)
        prefix = m.group(1) if m else ""
        body = line[len(prefix) :] if m else line
        parts = re.split(r"([；;])", body) if re.search(r"[；;]", body) else [body]
        rebuilt: list[str] = []
        for part in parts:
            if part in ("；", ";"):
                rebuilt.append(part)
                continue
            seg = part
            if re.search(r"名词", seg) and not re.search(r"(?:动词|形容词)", seg):
                rebuilt.append(seg)
                continue
            seg = re.sub(
                r"(二类形容词|な形容词)([^；;\n]*?)な\s*[＋+]\s*の(時|とき)",
                r"\1\2な＋\3",
                seg,
            )
            if re.search(r"(?:动词|一类动词|二类动词|三类动词|一类形容词)", seg) and re.search(
                r"[＋+]の(?:時|とき)", seg
            ):
                seg = re.sub(r"([＋+])の(時|とき)", r"\1\2", seg)
            rebuilt.append(seg)
        out_lines.append(prefix + "".join(rebuilt))
    return "\n".join(out_lines)


def main() -> None:
    for path in (TOKI_TS, CONN_AI, UPLOAD, PROMPT):
        if not path.is_file():
            fail(f"missing {path.relative_to(ROOT)}")

    toki = TOKI_TS.read_text(encoding="utf-8")
    for needle in (
        "connectionHasWrongTokiNoParticle",
        "rewriteJpVocabConnectionTokiNoParticle",
        "な＋の時",
        "＋の時",
    ):
        if needle not in toki:
            fail(f"toki.ts missing {needle!r}")

    conn = CONN_AI.read_text(encoding="utf-8")
    if "toki_no_on_verb_adj" not in conn:
        fail("connection-ai validate missing toki_no_on_verb_adj")
    if "rewriteJpVocabConnectionTokiNoParticle" not in conn:
        fail("connection-ai normalize missing toki rewrite")

    upload = UPLOAD.read_text(encoding="utf-8")
    if "toki_no_on_verb_adj" not in upload:
        fail("upload_spec missing toki_no_on_verb_adj")
    if "名词＋の＋時" not in upload and "名词＋の＋時" not in upload:
        # rule text uses 名词＋の＋時
        if "～時／～とき" not in upload:
            fail("upload_spec missing ～時／とき rule")

    prompt = PROMPT.read_text(encoding="utf-8")
    if "＋の時" not in prompt or "名词＋の＋時" not in prompt:
        fail("connection prompt missing ～時／とき no-particle rule")

    bad = (
        "一类动词辞书形（动词原形）＋の時｜动作尚未完成时\n"
        "一类动词た形＋の時｜动作已完成时\n"
        "二类形容词词干＋な＋の時｜状态存在时\n"
        "名词＋の時｜身份或状态存在时"
    )
    if not has_wrong(bad):
        fail("detector should flag verb/adj ＋の時")
    fixed = rewrite(bad)
    if has_wrong(fixed):
        fail(f"rewrite left wrong の: {fixed!r}")
    if "一类动词辞书形（动词原形）＋時｜" not in fixed:
        fail(f"rewrite missed verb: {fixed!r}")
    if "な＋時｜" not in fixed:
        fail(f"rewrite missed na-adj: {fixed!r}")
    if "名词＋の時｜" not in fixed:
        fail(f"rewrite must keep noun の: {fixed!r}")

    good = (
        "一类动词辞书形（动词原形）＋時｜动作尚未完成时\n"
        "二类形容词词干＋な＋時｜状态存在时\n"
        "名词＋の＋時｜身份或状态存在时"
    )
    if has_wrong(good):
        fail("detector false-positive on correct connection")

    # content-quality guard should mention this pitfall once wired
    guard = (ROOT / ".cursor/rules/jp-vocab-content-quality-guard.mdc").read_text(
        encoding="utf-8"
    )
    if "toki_no_on_verb_adj" not in guard:
        fail("content-quality-guard.mdc missing toki_no_on_verb_adj row")

    if CHECK_GUARD.is_file():
        gsrc = CHECK_GUARD.read_text(encoding="utf-8")
        if "toki_no_on_verb_adj" not in gsrc and "connection-toki" not in gsrc:
            # optional: guard check may list scripts; our own script is enough
            pass

    print("OK: jp-vocab connection toki の particle guard")


if __name__ == "__main__":
    main()
