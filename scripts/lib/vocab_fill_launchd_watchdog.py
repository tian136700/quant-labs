#!/usr/bin/env python3
"""词表补全 LaunchAgent 看门狗：被卸掉却未暂停/熔断时自动 bootstrap + Bark。

背景：英语整词补全曾被裸 bootout 止血后未挂回，停了 3.5 天无人知晓，
今日抽查池词条全空。熔断会卸 JP+EN；本看门狗只修「应启用却未加载」。

调用方：
- jp-vocab-fill-unified-stage.sh / en-vocab-fill-stage.sh（quiz gate 之前）
- 维护中心 en/jp feed snapshot（页面打开时）
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

CONFIG_DIR = Path.home() / ".config" / "info-quests"
STATE_PATH = CONFIG_DIR / "vocab-fill-launchd-watchdog.state.json"
KILL_PATH = CONFIG_DIR / "vocab-fill-KILL.switch"
AGENTS_DIR = Path.home() / "Library" / "LaunchAgents"
LOG_PATH = Path.home() / "Library" / "Logs" / "vocab-fill-launchd-watchdog.log"

# Bark 同一 label 最短间隔（秒）；bootstrap 每次检查都可试，不节流
DEFAULT_BARK_COOLDOWN_SEC = 6 * 3600

WATCH_TARGETS: tuple[dict[str, str], ...] = (
    {
        "label": "com.infoquests.en-vocab-fill",
        "title": "英语整词补全",
        "pause": "en-vocab-fill-PAUSE.switch",
    },
    {
        "label": "com.infoquests.jp-vocab-fill-unified",
        "title": "日语统一补全",
        "pause": "jp-vocab-fill-unified-PAUSE.switch",
    },
)


def _uid() -> int:
    return os.getuid()


def _domain() -> str:
    return f"gui/{_uid()}"


def _env_int(name: str, default: int) -> int:
    raw = (os.environ.get(name) or "").strip()
    if not raw:
        return default
    try:
        return max(0, int(raw))
    except ValueError:
        return default


def _log(msg: str, *, quiet: bool = False) -> None:
    line = f"{time.strftime('%F %T')} {msg}"
    if not quiet:
        print(line, flush=True)
    try:
        LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
        with LOG_PATH.open("a", encoding="utf-8") as fh:
            fh.write(line + "\n")
    except OSError:
        pass


def _run_launchctl(args: list[str], *, timeout: float = 12) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["launchctl", *args],
        capture_output=True,
        text=True,
        timeout=timeout,
        check=False,
    )


def is_launchd_loaded(label: str) -> bool:
    try:
        proc = _run_launchctl(["print", f"{_domain()}/{label}"], timeout=8)
    except (OSError, subprocess.TimeoutExpired):
        return False
    return proc.returncode == 0


def is_circuit_killed() -> bool:
    return KILL_PATH.is_file()


def _load_state() -> dict[str, Any]:
    try:
        raw = STATE_PATH.read_text(encoding="utf-8")
        blob = json.loads(raw)
    except (OSError, json.JSONDecodeError, TypeError):
        return {}
    return blob if isinstance(blob, dict) else {}


def _save_state(state: dict[str, Any]) -> None:
    try:
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        STATE_PATH.write_text(
            json.dumps(state, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
    except OSError:
        pass


def _bootstrap_agent(label: str, plist: Path) -> tuple[bool, str]:
    domain = _domain()
    # 先尽量卸干净，避免 Error 5
    _run_launchctl(["bootout", domain, str(plist)])
    _run_launchctl(["bootout", f"{domain}/{label}"])
    last_err = ""
    for attempt in range(4):
        boot = _run_launchctl(["bootstrap", domain, str(plist)])
        _run_launchctl(["enable", f"{domain}/{label}"])
        if boot.returncode == 0 or is_launchd_loaded(label):
            return True, "bootstrapped" if boot.returncode == 0 else "already_loaded"
        last_err = (boot.stderr or boot.stdout or "").strip() or f"exit {boot.returncode}"
        time.sleep(0.15 * (attempt + 1))
        _run_launchctl(["bootout", domain, str(plist)])
    return False, last_err or "bootstrap_failed"


def _try_bark(*, title: str, body: str) -> None:
    try:
        root = Path(__file__).resolve().parents[2]
        scripts = str(root / "scripts")
        if scripts not in sys.path:
            sys.path.insert(0, scripts)
        from maintenance_center.bark_notify import send_bark_push  # noqa: WPS433

        send_bark_push(
            title=title[:80],
            body=body[:500],
            group="strategy-compare-cloud",
            level="active",
            sound=(
                os.environ.get("BARK_SOUND_VOCAB_FILL_WATCHDOG")
                or os.environ.get("BARK_SOUND_DEPLOY_FAIL")
                or "shake"
            ),
        )
    except Exception as exc:  # noqa: BLE001
        _log(f"bark failed (ignored): {exc}", quiet=False)


def check_one(
    target: dict[str, str],
    *,
    dry_run: bool = False,
    quiet: bool = False,
    auto_heal: bool = True,
) -> dict[str, Any]:
    label = target["label"]
    title = target["title"]
    pause_path = CONFIG_DIR / target["pause"]
    plist = AGENTS_DIR / f"{label}.plist"
    out: dict[str, Any] = {
        "label": label,
        "title": title,
        "ok": True,
        "action": "none",
    }

    if not plist.is_file():
        out["action"] = "no_plist"
        out["detail"] = f"未安装 {plist.name}"
        return out

    if is_circuit_killed():
        out["action"] = "skip_killed"
        out["detail"] = "熔断中（KILL），不自动挂回"
        return out

    if pause_path.is_file():
        out["action"] = "skip_paused"
        out["detail"] = "维护中心已手动暂停"
        return out

    if is_launchd_loaded(label):
        out["action"] = "loaded"
        out["detail"] = "已在运行调度"
        return out

    # 应启用却未加载
    out["ok"] = False
    out["action"] = "unloaded"
    out["detail"] = "plist 在但 launchd 未加载"

    if dry_run or not auto_heal:
        return out

    healed, detail = _bootstrap_agent(label, plist)
    out["heal_ok"] = healed
    out["heal_detail"] = detail
    out["action"] = "healed" if healed else "heal_failed"
    out["ok"] = healed
    _log(
        f"watchdog {label}: unloaded → "
        f"{'bootstrap ok' if healed else 'bootstrap FAILED'} ({detail})",
        quiet=quiet,
    )

    state = _load_state()
    row = state.get(label) if isinstance(state.get(label), dict) else {}
    now = time.time()
    cooldown = _env_int(
        "VOCAB_FILL_LAUNCHD_WATCHDOG_BARK_COOLDOWN_SEC",
        DEFAULT_BARK_COOLDOWN_SEC,
    )
    last_bark = float(row.get("last_bark_at") or 0)
    should_bark = cooldown <= 0 or (now - last_bark) >= cooldown
    if should_bark:
        status_line = (
            "已自动重新加载"
            if healed
            else f"自动加载失败：{detail[:120]}"
        )
        _try_bark(
            title="补全定时异常",
            body=(
                f"改动：{title} launchd 被卸掉后已检测\n"
                f"项目：strategy-compare-cloud\n"
                f"状态：{status_line}\n"
                f"详情：应启用却未加载（非暂停/非熔断）"
            ),
        )
        row["last_bark_at"] = now
    row["last_issue_at"] = now
    row["last_issue"] = "unloaded"
    row["last_heal_ok"] = healed
    row["last_heal_detail"] = detail
    state[label] = row
    _save_state(state)
    return out


def run_watchdog(
    *,
    dry_run: bool = False,
    quiet: bool = False,
    auto_heal: bool = True,
) -> dict[str, Any]:
    results = [
        check_one(t, dry_run=dry_run, quiet=quiet, auto_heal=auto_heal)
        for t in WATCH_TARGETS
    ]
    healed = [r for r in results if r.get("action") == "healed"]
    failed = [r for r in results if r.get("action") in {"unloaded", "heal_failed"}]
    return {
        "ok": not failed,
        "results": results,
        "healed_count": len(healed),
        "problem_count": len(failed),
    }


def main(argv: list[str] | None = None) -> int:
    args = list(argv if argv is not None else sys.argv[1:])
    dry_run = "--dry-run" in args
    quiet = "--quiet" in args
    no_heal = "--no-heal" in args
    snap = run_watchdog(dry_run=dry_run, quiet=quiet, auto_heal=not no_heal and not dry_run)
    if not quiet:
        print(json.dumps(snap, ensure_ascii=False, indent=2))
    # 看门狗自身失败不挡 fill：exit 0；仅 --strict 时带问题码
    if "--strict" in args and not snap.get("ok"):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
