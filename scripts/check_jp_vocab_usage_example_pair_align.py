#!/usr/bin/env python3
"""回归：语法第 N 条用法 ↔ 第 N 条例句须语义对齐（防 ～はずだ 类张冠李戴）。

镜像 src/lib/jp-vocab-usage-example-pair-align.ts 的高置信启发；
并检查 apply 路径与 prompt 已接线。
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ALIGN_TS = ROOT / "src/lib/jp-vocab-usage-example-pair-align.ts"
EX_AI = ROOT / "src/lib/jp-vocab-example-sentences-ai.ts"
USAGE_AI = ROOT / "src/lib/jp-vocab-usage-ai.ts"
FILL_PY = ROOT / "scripts/jp-vocab-fill-grammar-usage-examples-api.py"
RULE = ROOT / ".cursor/rules/jp-vocab-grammar-usage.mdc"

NUMBERED_USAGE_RE = re.compile(r"^\s*(\d+)\s*[.、．)\]]\s*(.+)$")
CITED_FORM_CHUNK_RE = re.compile(r"[「（(]([～〜~]?[^」）)]{1,40})[」）)]")
NEG_USAGE_RE = re.compile(r"否定推断|理所当然不会|不会发生|不会存在|不可能(?!性)")
POS_USAGE_RE = re.compile(
    r"肯定推断|理所当然会发生|理所当然会存在|理所当然会发生或存在"
)
CONTRAST_USAGE_RE = re.compile(
    r"与预期相悖|事实与预期相悖|预期落空|惊讶或怀疑|含有惊讶"
)
PAREN_RE = re.compile(r"[（(][^）)]*[）)]")
JP_LINE_GLOSS_RE = re.compile(
    r"^(.+?)\n(?:译文|翻譯|翻译|译|譯)\s*[:：]\s*.+$", re.M
)


def lemma_core(word: str) -> str:
    return re.sub(r"^[～~〜\s]+|[～~〜\s]+$", "", word).strip()


def plain_jp(line: str) -> str:
    return PAREN_RE.sub("", line).replace(" ", "").replace("\u3000", "")


def parse_usage_bodies(usage: str) -> list[str]:
    out: list[str] = []
    for line in usage.splitlines():
        m = NUMBERED_USAGE_RE.match(line.strip())
        if m:
            out.append(m.group(2).strip())
    return out


def parse_example_jp_lines(examples: str) -> list[str]:
    items = parseJpVocab_like(examples)
    return items


def parseJpVocab_like(raw: str) -> list[str]:
    """Minimal: alternate JP / 译文 lines."""
    lines = [ln.strip() for ln in raw.splitlines() if ln.strip()]
    jp: list[str] = []
    i = 0
    while i < len(lines):
        if re.match(r"^(译文|翻譯|翻译|译|譯)\s*[:：]", lines[i]):
            i += 1
            continue
        jp.append(lines[i])
        i += 1
        if i < len(lines) and re.match(
            r"^(译文|翻譯|翻译|译|譯)\s*[:：]", lines[i]
        ):
            i += 1
    return jp


def extract_cited(usage_body: str, word: str) -> list[str]:
    core = lemma_core(word)
    if not core:
        return []
    core_base = re.sub(r"だ$", "", core)
    found: list[str] = []
    for m in CITED_FORM_CHUNK_RE.finditer(usage_body):
        chunk = m.group(1).strip()
        for part in re.split(r"[\/／、,，]", chunk):
            form = re.sub(r"^[～〜~\s]+|[～〜~\s]+$", "", part).strip()
            if len(form) < 2:
                continue
            if core in form or (len(core_base) >= 2 and core_base in form):
                found.append(form)
    return list(dict.fromkeys(found))


CITED_FORM_TRAILING_PUNCT_RE = re.compile(r"[？?！!。．\.、,，…⋯]+$")


def example_has_form(plain: str, form: str) -> bool:
    if form in plain:
        return True
    stripped = CITED_FORM_TRAILING_PUNCT_RE.sub("", form)
    if stripped and stripped != form and stripped in plain:
        return True
    if form.endswith("だ") and (form[:-1] + "です") in plain:
        return True
    # 「ことができる」↔「ことができます」；「ようにする」↔「ようにします」
    if form.endswith("る") and (form[:-1] + "ます") in plain:
        return True
    if form.endswith("できる") and (form[:-3] + "できます") in plain:
        return True
    return False


def hazuda_neg(plain: str) -> bool:
    return bool(re.search(r"はずがない|ないはず", plain))


def hazuda_contrast(plain: str) -> bool:
    return bool(re.search(r"はずなのに|なのに", plain))


def hazuda_affirm(plain: str) -> bool:
    return bool(
        re.search(r"はずだ|はずです", plain)
        and not hazuda_neg(plain)
        and "はずなのに" not in plain
    )


def align_ok(word: str, usage: str, examples: str) -> tuple[bool, str]:
    bodies = parse_usage_bodies(usage)
    if not bodies:
        return True, "ok"
    jps = parse_example_jp_lines(examples)
    if len(jps) < len(bodies):
        return False, "pair_semantic_mismatch:count"
    core = lemma_core(word)
    is_hazuda = core == "はずだ" or core.startswith("はず")
    for i, body in enumerate(bodies):
        plain = plain_jp(jps[i])
        idx = i + 1
        for form in extract_cited(body, word):
            if not example_has_form(plain, form):
                return False, f"pair_semantic_mismatch:{idx}:cited_form_missing"
        if not is_hazuda:
            continue
        neg_u = bool(NEG_USAGE_RE.search(body))
        pos_u = bool(POS_USAGE_RE.search(body))
        contrast_u = bool(CONTRAST_USAGE_RE.search(body))
        if neg_u and not pos_u and not hazuda_neg(plain):
            return False, f"pair_semantic_mismatch:{idx}:neg_usage_needs_hazuda_neg"
        if pos_u and not neg_u and not hazuda_affirm(plain):
            return False, f"pair_semantic_mismatch:{idx}:pos_usage_needs_hazuda_affirm"
        if contrast_u and not hazuda_contrast(plain) and not hazuda_neg(plain):
            return (
                False,
                f"pair_semantic_mismatch:{idx}:contrast_usage_needs_nanoni_or_neg",
            )
    return True, "ok"


# 旧错配（条数对、语义错）——必须拒
BAD_USAGE = """1. 表示根据道理或状况，某事理所当然会发生或存在（肯定推断）。(N3)
2. 表示根据道理或状况，某事理所当然不会发生或存在（否定推断）。(N3)
3. 表示事实与预期或约定相符（应当如此）。(N3)
4. 表示事实与预期相悖，含有惊讶或怀疑的语气（～はずがない/ないはずだ）。(N3)"""

BAD_EXAMPLES = """彼(かれ)は医者(いしゃ)だから、この病気(びょうき)のことを知(し)っているはずだ。
译文：他是医生，应该知道这个病。
彼女(かのじょ)はもう家(いえ)に着(つ)いているはずだ。
译文：她应该已经到家了。
彼(かれ)はそんなひどいことを言(い)うはずがない。
译文：他不可能说出那么过分的话。
鍵(かぎ)はここに置(お)いたはずなのに、見(み)つからない。
译文：钥匙应该放在这里的，却找不到了。"""

# 已纠正 —— 必须过
GOOD_USAGE = """1. 表示根据道理或状况，某事理所当然会发生或存在（肯定推断）。(N3)
2. 表示根据道理或状况，某事理所当然不会发生或存在（否定推断）。(N3)
3. 表示事实与预期或约定相符（应当如此）。(N3)
4. 表示事实与预期相悖，含有惊讶或怀疑的语气（～はずなのに）。(N3)"""

GOOD_EXAMPLES = """彼(かれ)は医者(いしゃ)だから、この病気(びょうき)のことを知(し)っているはずだ。
译文：他是医生，应该知道这个病。
彼(かれ)はそんなひどいことを言(い)うはずがない。
译文：他不可能说出那么过分的话。
約束(やくそく)したのだから、彼(かれ)は来(く)るはずだ。
译文：既然约好了，他应该会来。
鍵(かぎ)はここに置(お)いたはずなのに、見(み)つからない。
译文：钥匙明明该放在这儿，却找不到。"""


def main() -> int:
    errors: list[str] = []

    if not ALIGN_TS.is_file():
        errors.append("缺 jp-vocab-usage-example-pair-align.ts")
    else:
        align = ALIGN_TS.read_text(encoding="utf-8")
        if "validateJpVocabUsageExamplePairAlignment" not in align:
            errors.append("align.ts 缺 validateJpVocabUsageExamplePairAlignment")
        if "cited_form_missing" not in align:
            errors.append("align.ts 须拒 cited_form_missing")

    ex_ai = EX_AI.read_text(encoding="utf-8")
    if "validateJpVocabUsageExamplePairAlignment" not in ex_ai:
        errors.append("example-sentences-ai 须调用 pair alignment")
    if "pair_semantic_mismatch" not in ex_ai:
        errors.append("example upload_spec 须含 pair_semantic_mismatch")

    usage_ai = USAGE_AI.read_text(encoding="utf-8")
    if "pair_semantic_mismatch" not in usage_ai:
        errors.append("usage upload_spec 须含 pair_semantic_mismatch")
    if "语义必须对齐" not in usage_ai and "点名的形态" not in usage_ai:
        errors.append("usage prompt 须要求用法-例句语义对齐")

    fill_py = FILL_PY.read_text(encoding="utf-8")
    if "语义必须对齐" not in fill_py and "点名的形态" not in fill_py:
        errors.append("Mac PAIR_SYSTEM 须要求语义对齐")

    rule = RULE.read_text(encoding="utf-8")
    if "pair_semantic_mismatch" not in rule and "语义对齐" not in rule:
        errors.append("jp-vocab-grammar-usage.mdc 须写语义对齐 / pair_semantic_mismatch")

    ok, reason = align_ok("～はずだ", BAD_USAGE, BAD_EXAMPLES)
    if ok:
        errors.append("旧错配 ～はずだ 应被拒，却通过了")
    elif "pair_semantic_mismatch" not in reason:
        errors.append(f"旧错配拒因异常: {reason}")

    ok2, reason2 = align_ok("～はずだ", GOOD_USAGE, GOOD_EXAMPLES)
    if not ok2:
        errors.append(f"纠正后 ～はずだ 应通过，却拒: {reason2}")

    # 「それで？」用法 vs 例句「それで、」——尾部？不得误拒
    sorede_usage = (
        "1. [口语8|考试7] 表示顺接因果：后句用「それで」引出结果。(N4)\n"
        "2. [口语9|考试5] 对话中用「それで？」追问「然后呢？」。(N4)"
    )
    sorede_examples = (
        "昨日(きのう)は雨(あめ)が降(ふ)っていました。それで、家(いえ)にいました。\n"
        "译文：昨天下雨了，所以我待在家里。\n"
        "A：財布(さいふ)をなくしたんです。B：それで、見(み)つかりましたか。\n"
        "译文：A：我把钱包弄丢了。B：那后来找到了吗？"
    )
    ok3, reason3 = align_ok("～それで", sorede_usage, sorede_examples)
    if not ok3:
        errors.append(f"～それで「それで？」尾标点应对齐通过，却拒: {reason3}")

    # 「ことができる」用法点名辞书形，例句用ます形不得误拒（id=678）
    dekiru_usage = (
        "1. [口语7|考试9] 表示具备某种能力或条件，能够做某事；"
        "「できる」单独也可表达相同意思，但「ことができる」更正式。(N5)"
    )
    dekiru_examples = (
        "日本語(にほんご)を話(はな)すことができます。\n"
        "译文：我会说日语。\n"
        "自転車(じてんしゃ)に乗(の)ることができます。\n"
        "译文：我会骑自行车。\n"
        "一人(ひとり)で来(く)ることができます。\n"
        "译文：我能一个人来。"
    )
    ok4, reason4 = align_ok("～ことができる", dekiru_usage, dekiru_examples)
    if not ok4:
        errors.append(f"ことができる ます形应对齐通过，却拒: {reason4}")

    if errors:
        for e in errors:
            print(f"FAIL: {e}", file=sys.stderr)
        return 1
    print("OK: usage↔example semantic pair alignment guards")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
