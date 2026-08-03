#!/usr/bin/env python3
"""维护中心：失败词条写回成功后，报一条 success 跑次 → 失败行旁绿标。

绿标文案：
- 默认「已处理」
- 词条已从词库删除：`--resolved-label '此词条已被删除'`（写入 preview，表旁显示同文案）

页外 apply（Agent / 手动 fill-usage）只写 Worker 时，表里没有晚于失败的 success，
绿标不会出现。统一走本脚本（或等价 POST /api/*-vocab-fill/word-runs）。

用法：
  python3 scripts/lib/vocab_fill_mark_resolved.py \\
    --lang jp --word-id 146 --word '自动词与他动词的区分' \\
    --kind grammar --source 'Agent现写' --applied grammar

  # 词条已删
  python3 scripts/lib/vocab_fill_mark_resolved.py \\
    --lang jp --word-id 540 --word '違います' --kind word \\
    --resolved-label '此词条已被删除' --preview '已并入原形違う'
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

DEFAULT_HUB = "http://127.0.0.1:17823"
RESOLVED_DELETED_LABEL = "此词条已被删除"


def _hub_base() -> str:
    return (
        os.environ.get("MAINTENANCE_CENTER_URL", "").strip().rstrip("/")
        or os.environ.get("MAINTENANCE_HUB", "").strip().rstrip("/")
        or DEFAULT_HUB
    )


def mark_resolved(
    *,
    lang: str,
    word_id: int,
    word: str,
    kind: str = "grammar",
    source: str = "Agent现写",
    applied: str = "grammar",
    fill_task: str | None = None,
    preview: str = "",
    resolved_label: str = "",
    hub: str | None = None,
    timeout: float = 15.0,
) -> dict:
    lang_key = (lang or "jp").strip().lower()
    if lang_key not in ("jp", "en"):
        raise ValueError("lang must be jp or en")
    wid = int(word_id)
    name = str(word or "").strip()
    if wid <= 0 or not name:
        raise ValueError("word_id_and_word_required")

    if not fill_task:
        fill_task = (
            "jp-vocab-fill-unified" if lang_key == "jp" else "en-vocab-fill"
        )
    path = (
        "/api/jp-vocab-fill/word-runs"
        if lang_key == "jp"
        else "/api/en-vocab-fill/word-runs"
    )
    url = f"{(hub or _hub_base()).rstrip('/')}{path}"
    label = str(resolved_label or "").strip()
    preview_text = str(preview or "").strip()
    if label == RESOLVED_DELETED_LABEL:
        if RESOLVED_DELETED_LABEL not in preview_text:
            preview_text = (
                f"{RESOLVED_DELETED_LABEL}。{preview_text}"
                if preview_text
                else RESOLVED_DELETED_LABEL
            )
    elif not preview_text:
        preview_text = "失败后已写回；标已处理"
    body = {
        "word_id": wid,
        "word": name,
        "kind": (kind or "word").strip() or "word",
        "status": "success",
        "source": (source or "Agent现写").strip() or "Agent现写",
        "applied": (applied or "").strip(),
        "fill_task": fill_task,
        "preview": preview_text,
    }
    raw = json.dumps(body, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=raw,
        method="POST",
        headers={
            "Content-Type": "application/json; charset=utf-8",
            "User-Agent": "vocab-fill-mark-resolved/1.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            payload = json.loads(resp.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:500]
        raise RuntimeError(f"HTTP {exc.code}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(
            f"维护中心不可达 ({url}): {exc.reason}"
        ) from exc
    if not isinstance(payload, dict) or not payload.get("ok"):
        raise RuntimeError(f"mark_resolved failed: {payload!r}")
    return payload


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        description="失败词条写回后报 success → 绿标「已处理」或「此词条已被删除」"
    )
    p.add_argument("--lang", choices=("jp", "en"), required=True)
    p.add_argument("--word-id", type=int, required=True)
    p.add_argument("--word", required=True)
    p.add_argument("--kind", default="grammar")
    p.add_argument("--source", default="Agent现写")
    p.add_argument("--applied", default="grammar")
    p.add_argument("--fill-task", default="")
    p.add_argument("--preview", default="")
    p.add_argument(
        "--resolved-label",
        default="",
        help="绿标：已处理（默认）或 此词条已被删除",
    )
    p.add_argument("--hub", default="")
    args = p.parse_args(argv)
    try:
        out = mark_resolved(
            lang=args.lang,
            word_id=args.word_id,
            word=args.word,
            kind=args.kind,
            source=args.source,
            applied=args.applied,
            fill_task=args.fill_task or None,
            preview=args.preview,
            resolved_label=args.resolved_label,
            hub=args.hub or None,
        )
    except Exception as exc:
        print(f"[vocab-fill-mark-resolved] FAIL: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(out, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    raise SystemExit(main())
