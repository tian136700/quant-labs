#!/usr/bin/env python3
"""日/英语词表补全：抽查门禁（开始抽查即静默；抽完后再等 30 分钟）。

调线上 POST /api/jp-vocab/fill-schedule-gate（Bearer = JP_REVIEW_UPLOAD_TOKEN）。
日语或英语任一抽查进行中，全部 fill 任务跳过。
"""

from __future__ import annotations

import json
import os
import ssl
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

DEFAULT_GATE_URL = (
    "https://finance.info-quests.com/api/jp-vocab/fill-schedule-gate"
)
DEFAULT_COOLDOWN_MINUTES = 30


def _ssl_context() -> ssl.SSLContext:
    try:
        import certifi  # type: ignore

        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        return ssl.create_default_context()


def _load_token() -> str:
    token = (os.environ.get("JP_REVIEW_UPLOAD_TOKEN") or "").strip()
    if token:
        return token
    cfg = Path.home() / ".config" / "info-quests" / "jp-review-sync.env"
    try:
        for line in cfg.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            if key.strip() == "JP_REVIEW_UPLOAD_TOKEN":
                return value.strip().strip('"').strip("'")
    except OSError:
        pass
    return ""


def fetch_vocab_fill_quiz_gate(
    *,
    label: str = "vocab-fill",
    cooldown_minutes: int | None = None,
    gate_url: str | None = None,
    timeout_sec: float = 20.0,
) -> dict[str, Any]:
    """返回门禁 JSON；失败时 quiet=True（宁可跳过）。"""
    auth = _load_token()
    if not auth:
        return {
            "ok": False,
            "quiet": True,
            "reason": "gate_no_token",
            "detail": f"{label}: 缺少 JP_REVIEW_UPLOAD_TOKEN，跳过本轮以免误跑",
        }

    minutes = cooldown_minutes
    if minutes is None:
        raw = (
            os.environ.get("VOCAB_FILL_QUIZ_COOLDOWN_MINUTES")
            or os.environ.get("JP_VOCAB_FILL_QUIZ_COOLDOWN_MINUTES")
            or str(DEFAULT_COOLDOWN_MINUTES)
        ).strip()
        try:
            minutes = max(1, int(raw))
        except ValueError:
            minutes = DEFAULT_COOLDOWN_MINUTES

    url = (
        gate_url
        or os.environ.get("VOCAB_FILL_QUIZ_GATE_URL")
        or os.environ.get("JP_VOCAB_FILL_SCHEDULE_GATE_URL")
        or DEFAULT_GATE_URL
    ).strip()

    body = json.dumps({"cooldown_minutes": minutes}, ensure_ascii=False).encode(
        "utf-8"
    )
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {auth}",
            "Content-Type": "application/json; charset=utf-8",
            "User-Agent": f"{label}/quiz-gate",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(
            req, timeout=timeout_sec, context=_ssl_context()
        ) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        detail = err.read().decode("utf-8", errors="replace")[:300]
        if err.code == 404:
            return {
                "ok": True,
                "quiet": False,
                "reason": "gate_not_deployed",
                "detail": f"{label}: 门禁 API 404，临时允许本轮",
            }
        return {
            "ok": False,
            "quiet": True,
            "reason": "gate_http_error",
            "detail": f"{label}: 门禁 HTTP {err.code}: {detail}",
        }
    except Exception as exc:
        return {
            "ok": False,
            "quiet": True,
            "reason": "gate_request_error",
            "detail": f"{label}: 门禁请求失败，跳过本轮: {exc}",
        }

    if not isinstance(data, dict) or not data.get("ok"):
        return {
            "ok": False,
            "quiet": True,
            "reason": "gate_not_ok",
            "detail": f"{label}: 门禁 not ok: {str(data)[:300]}",
        }

    quiet = bool(data.get("quiet"))
    detail = str(
        data.get("detail")
        or ("抽查冷却中" if quiet else "允许补全")
    )
    return {
        "ok": True,
        "quiet": quiet,
        "reason": str(data.get("reason") or ("quiz_cooldown" if quiet else "ok_to_run")),
        "detail": detail,
        "run_after": data.get("run_after"),
        "last_quiz_at": data.get("last_quiz_at"),
        "cooldown_minutes": data.get("cooldown_minutes", minutes),
        "live_open": bool(data.get("live_open")),
        "subjects": data.get("subjects") or [],
    }


def skip_if_quiz_gate_quiet(
    label: str = "vocab-fill",
    *,
    force: bool = False,
) -> None:
    """抽查门禁 quiet 时打印原因并以 SystemExit(0) 跳过本轮。FORCE=1 可绕过。"""
    if force or (os.environ.get("VOCAB_FILL_QUIZ_GATE_FORCE") or "").strip() in (
        "1",
        "true",
        "yes",
    ):
        print(f"[{label}] quiz gate: FORCE → skip gate check", flush=True)
        return

    gate = fetch_vocab_fill_quiz_gate(label=label)
    detail = str(gate.get("detail") or "")
    if gate.get("quiet"):
        print(
            f"[{label}] quiz gate quiet → skip "
            f"reason={gate.get('reason')} detail={detail}",
            flush=True,
        )
        raise SystemExit(0)
    print(
        f"[{label}] quiz gate ok reason={gate.get('reason')} detail={detail}",
        flush=True,
    )


def main(argv: list[str] | None = None) -> int:
    """CLI：quiet → exit 75（shell 当作 skip）；允许跑 → 0。"""
    args = list(sys.argv[1:] if argv is None else argv)
    label = "vocab-fill-quiz-gate"
    if args and not args[0].startswith("-"):
        label = args[0]
    if (os.environ.get("VOCAB_FILL_FORCE") or os.environ.get("FORCE") or "").strip() in (
        "1",
        "true",
        "yes",
    ) or (os.environ.get("VOCAB_FILL_QUIZ_GATE_FORCE") or "").strip() in (
        "1",
        "true",
        "yes",
    ):
        print(f"[{label}] quiz gate: FORCE → skip gate check", flush=True)
        return 0

    gate = fetch_vocab_fill_quiz_gate(label=label)
    detail = str(gate.get("detail") or "")
    if gate.get("quiet"):
        print(
            f"[{label}] quiz gate quiet → skip "
            f"reason={gate.get('reason')} detail={detail}",
            flush=True,
        )
        return 75
    print(
        f"[{label}] quiz gate ok reason={gate.get('reason')} detail={detail}",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
