"""日语统一补全：判定「真正搞定」+ 变形课必带接续（防假成功空烧）。

曾复发：变形课（如「动词变否定」）Claude 只出例句、extract 把 connection 清空，
apply 因 force 仍 updated>0 → fixed=True 清熔断，但 list_missing 仍缺接续 → 每分钟烧钱。
"""

from __future__ import annotations

from typing import Any, Callable

# 变形课：例句 + 接续表（usage 故意为空）
GRAMMAR_CONJ_KEYS = ("example_sentences", "connection")
GRAMMAR_PATTERN_KEYS = ("usage", "connection", "example_sentences")
WORD_REQUIRED_KEYS = ("reading", "meaning", "pos", "example_sentences")


def full_refresh_needs(
    kind: str, word: str, *, is_conjugation: Callable[[str], bool]
) -> dict[str, bool]:
    if kind == "grammar":
        if is_conjugation(word):
            return {
                "reading": False,
                "meaning": False,
                "pos": False,
                "usage": False,
                # 变形课有例句+接续表才算完成（usage 空是故意的）
                "connection": True,
                "example_sentences": True,
                "related_compounds": False,
            }
        return {
            "reading": False,
            "meaning": False,
            "pos": False,
            "usage": True,
            "connection": True,
            "example_sentences": True,
            "related_compounds": False,
        }
    return {
        "reading": True,
        "meaning": True,
        "pos": True,
        "usage": False,
        "connection": False,
        "example_sentences": True,
        "related_compounds": True,
    }


def merge_needs_from_missing_flags(
    needs: dict[str, bool], row: dict[str, Any]
) -> dict[str, bool]:
    """用 list_missing 的 need_* 收窄 needs，避免已有例句还反复重造。"""
    out = dict(needs)
    if "need_examples" in row:
        out["example_sentences"] = bool(row.get("need_examples"))
    if "need_connection" in row:
        out["connection"] = bool(row.get("need_connection"))
    if "need_usage" in row:
        out["usage"] = bool(row.get("need_usage"))
    return out


def required_keys_from_needs(
    row: dict[str, Any],
    *,
    is_conjugation: Callable[[str], bool],
) -> tuple[str, ...]:
    """按 needs（或变形/句型默认）决定本次必须生成的字段。"""
    kind = str(row.get("kind") or "word")
    word = str(row.get("word") or "")
    needs = row.get("needs") if isinstance(row.get("needs"), dict) else None

    if kind == "word":
        if needs:
            keys = [k for k in WORD_REQUIRED_KEYS if needs.get(k)]
            if keys:
                return tuple(keys)
        return WORD_REQUIRED_KEYS

    if kind == "grammar":
        default = (
            GRAMMAR_CONJ_KEYS
            if is_conjugation(word)
            else GRAMMAR_PATTERN_KEYS
        )
        if needs:
            keys = [k for k in default if needs.get(k)]
            if keys:
                return tuple(keys)
        return default

    return WORD_REQUIRED_KEYS


def still_missing_detail_from_rows(
    word_id: int, missing_rows: list[dict[str, Any]]
) -> tuple[bool, str]:
    """list_missing 结果里是否仍含该 id。"""
    for row in missing_rows:
        if int(row.get("id") or 0) != int(word_id):
            continue
        detail = (
            "apply_ok_but_still_missing:"
            f"need_usage={row.get('need_usage')} "
            f"need_examples={row.get('need_examples')} "
            f"need_connection={row.get('need_connection')}"
        )
        return True, detail
    return False, ""


def payload_covers_required(
    payload: dict[str, Any], required: tuple[str, ...]
) -> list[str]:
    """返回 payload 仍缺的必填键（空串算缺）。"""
    missing: list[str] = []
    for key in required:
        if not str(payload.get(key) or "").strip():
            missing.append(key)
    return missing


def evaluate_online_batch_fixed(
    *,
    kind: str,
    word: str,
    done: list[str],
    fails: list[str],
    payload: dict[str, Any],
    required: tuple[str, ...],
    still_missing: bool | None = None,
    still_detail: str = "",
) -> tuple[bool, str]:
    """apply 之后是否算真正搞定。

    still_missing=True → 一律未搞定（禁止假成功清熔断）。
    """
    if fails:
        return False, ";".join(fails)
    if not done:
        return False, "apply_none"

    if kind == "word":
        if "example_sentences" not in done and "dry:example_sentences" not in done:
            return False, "examples_not_applied"
        return True, "applied"

    if kind == "grammar":
        if "grammar" not in done and not any(x.startswith("dry:") for x in done):
            return False, "grammar_not_applied"
        missing_payload = payload_covers_required(payload, required)
        if missing_payload:
            return (
                False,
                "grammar_payload_missing:" + ",".join(missing_payload),
            )
        if still_missing is True:
            return False, still_detail or "apply_ok_but_still_missing"
        return True, "applied"

    return False, "unknown_kind"
