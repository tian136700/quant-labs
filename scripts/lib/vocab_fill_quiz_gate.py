#!/usr/bin/env python3
"""日/英语词表补全：抽查门禁（开始抽查即静默；抽完后再等 30 分钟）。

调线上 POST /api/jp-vocab/fill-schedule-gate（Bearer = JP_REVIEW_UPLOAD_TOKEN）。
日语或英语任一抽查进行中，全部 fill 任务跳过。

本机共享缓存（~/.config/info-quests/vocab-fill-quiz-gate.cache.json）：
- quiet（抽查中 / 冷却）→ 默认缓存 120s，避免 5 个 StartInterval=60 的任务每分钟各打一次门禁把 isolate 打满 → 1102
- ok_to_run → 仅短缓存 20s（多任务同秒争用合并；仍尽快感知「开始抽查」）
"""

from __future__ import annotations

import json
import os
import ssl
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

DEFAULT_GATE_URL = (
    "https://finance.info-quests.com/api/jp-vocab/fill-schedule-gate"
)
DEFAULT_COOLDOWN_MINUTES = 30

# quiet 长缓存：抽查中每分钟空打门禁是 1102 争用主因之一
DEFAULT_QUIET_CACHE_SEC = 120
# ok 短缓存：只合并同分钟多 launchd 唤醒，勿长时间遮住「刚开抽查」
DEFAULT_OK_CACHE_SEC = 20

CACHE_PATH = (
    Path.home() / ".config" / "info-quests" / "vocab-fill-quiz-gate.cache.json"
)


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


def _cache_disabled() -> bool:
    return (os.environ.get("VOCAB_FILL_QUIZ_GATE_CACHE") or "").strip().lower() in (
        "0",
        "false",
        "no",
        "off",
    )


def _env_int(name: str, default: int) -> int:
    raw = (os.environ.get(name) or "").strip()
    if not raw:
        return default
    try:
        return max(0, int(raw))
    except ValueError:
        return default


def _quiet_cache_ttl_sec(gate: dict[str, Any]) -> int:
    base = _env_int("VOCAB_FILL_QUIZ_GATE_QUIET_CACHE_SEC", DEFAULT_QUIET_CACHE_SEC)
    if base <= 0:
        return 0
    run_after = str(gate.get("run_after") or "").strip()
    if not run_after:
        return base
    try:
        # run_after 为 ISO；若已过期则勿长缓存
        from datetime import datetime

        ra = datetime.fromisoformat(run_after.replace("Z", "+00:00"))
        remain = ra.timestamp() - time.time()
        if remain <= 0:
            return min(30, base)
        # 冷却期：缓存到接近 run_after，但不超过 base（避免抽查状态变了却卡太久）
        return max(15, min(base, int(remain)))
    except Exception:
        return base


def _ok_cache_ttl_sec() -> int:
    return _env_int("VOCAB_FILL_QUIZ_GATE_OK_CACHE_SEC", DEFAULT_OK_CACHE_SEC)


def _read_cache(minutes: int, url: str) -> dict[str, Any] | None:
    if _cache_disabled():
        return None
    try:
        raw = CACHE_PATH.read_text(encoding="utf-8")
        blob = json.loads(raw)
    except (OSError, json.JSONDecodeError, TypeError):
        return None
    if not isinstance(blob, dict):
        return None
    if int(blob.get("cooldown_minutes") or 0) != int(minutes):
        return None
    if str(blob.get("gate_url") or "") != url:
        return None
    expires_at = float(blob.get("expires_at") or 0)
    if time.time() >= expires_at:
        return None
    gate = blob.get("gate")
    if not isinstance(gate, dict) or not gate.get("ok"):
        return None
    out = dict(gate)
    out["_gate_cache"] = "hit"
    out["_gate_cache_age_sec"] = max(
        0, int(time.time() - float(blob.get("fetched_at") or time.time()))
    )
    return out


def _write_cache(minutes: int, url: str, gate: dict[str, Any]) -> None:
    if _cache_disabled():
        return
    if not gate.get("ok"):
        return
    quiet = bool(gate.get("quiet"))
    ttl = _quiet_cache_ttl_sec(gate) if quiet else _ok_cache_ttl_sec()
    if ttl <= 0:
        return
    # 错误类 quiet（无 token / HTTP 失败）短缓存，避免故障时狂打；也避免长时间假静默
    reason = str(gate.get("reason") or "")
    if quiet and reason.startswith("gate_"):
        ttl = min(ttl, 45)
    now = time.time()
    payload = {
        "fetched_at": now,
        "expires_at": now + ttl,
        "cooldown_minutes": int(minutes),
        "gate_url": url,
        "ttl_sec": ttl,
        "gate": {
            k: v
            for k, v in gate.items()
            if not str(k).startswith("_")
        },
    }
    try:
        CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
        tmp = CACHE_PATH.with_suffix(".tmp")
        tmp.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        tmp.replace(CACHE_PATH)
    except OSError:
        pass


def fetch_vocab_fill_quiz_gate(
    *,
    label: str = "vocab-fill",
    cooldown_minutes: int | None = None,
    gate_url: str | None = None,
    timeout_sec: float = 20.0,
    bypass_cache: bool = False,
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

    if not bypass_cache:
        cached = _read_cache(minutes, url)
        if cached is not None:
            detail = str(cached.get("detail") or "")
            age = cached.get("_gate_cache_age_sec")
            cached["detail"] = (
                f"{detail}（本机门禁缓存 hit age={age}s）"
                if detail
                else f"本机门禁缓存 hit age={age}s"
            )
            return cached

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
        out = {
            "ok": False,
            "quiet": True,
            "reason": "gate_http_error",
            "detail": f"{label}: 门禁 HTTP {err.code}: {detail}",
        }
        _write_cache(minutes, url, out)
        return out
    except Exception as exc:
        out = {
            "ok": False,
            "quiet": True,
            "reason": "gate_request_error",
            "detail": f"{label}: 门禁请求失败，跳过本轮: {exc}",
        }
        _write_cache(minutes, url, out)
        return out

    if not isinstance(data, dict) or not data.get("ok"):
        out = {
            "ok": False,
            "quiet": True,
            "reason": "gate_not_ok",
            "detail": f"{label}: 门禁 not ok: {str(data)[:300]}",
        }
        _write_cache(minutes, url, out)
        return out

    quiet = bool(data.get("quiet"))
    detail = str(
        data.get("detail")
        or ("抽查冷却中" if quiet else "允许补全")
    )
    out = {
        "ok": True,
        "quiet": quiet,
        "reason": str(data.get("reason") or ("quiz_cooldown" if quiet else "ok_to_run")),
        "detail": detail,
        "run_after": data.get("run_after"),
        "last_quiz_at": data.get("last_quiz_at"),
        "cooldown_minutes": data.get("cooldown_minutes", minutes),
        "live_open": bool(data.get("live_open")),
        "subjects": data.get("subjects") or [],
        "_gate_cache": "miss",
    }
    _write_cache(minutes, url, out)
    return out


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
    cache_tag = gate.get("_gate_cache") or "-"
    if gate.get("quiet"):
        print(
            f"[{label}] quiz gate quiet → skip "
            f"reason={gate.get('reason')} cache={cache_tag} detail={detail}",
            flush=True,
        )
        raise SystemExit(0)
    print(
        f"[{label}] quiz gate ok reason={gate.get('reason')} "
        f"cache={cache_tag} detail={detail}",
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
    cache_tag = gate.get("_gate_cache") or "-"
    if gate.get("quiet"):
        print(
            f"[{label}] quiz gate quiet → skip "
            f"reason={gate.get('reason')} cache={cache_tag} detail={detail}",
            flush=True,
        )
        return 75
    print(
        f"[{label}] quiz gate ok reason={gate.get('reason')} "
        f"cache={cache_tag} detail={detail}",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
