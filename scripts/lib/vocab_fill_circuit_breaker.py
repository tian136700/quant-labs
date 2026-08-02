#!/usr/bin/env python3
"""日语/英语补全熔断：同一 word_id 调满 3 次仍未搞定 → 立刻停掉全部 JP/EN fill launchd。

防烧钱硬规则（用户要求）：
  - 记录每次对同一语法/单词的接口调用次数
  - 满 3 次仍未清除缺失 → 永久跳过该 id，并 bootout 所有相关定时任务
  - 各 fill 入口启动时若发现 KILL 开关 → 直接 exit 0，不再打模型/付费 API

恢复：
  python3 scripts/lib/vocab_fill_circuit_breaker.py resume
  或 bash scripts/vocab-fill-circuit-resume.sh
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

CFG_DIR = Path.home() / ".config" / "info-quests"
ATTEMPTS_PATH = CFG_DIR / "vocab-fill-attempts.json"
KILL_PATH = CFG_DIR / "vocab-fill-KILL.switch"
KILL_REPORT_PATH = CFG_DIR / "vocab-fill-KILL-report.txt"
KILL_LOG_PATH = Path.home() / "Library" / "Logs" / "vocab-fill-circuit-breaker.log"
# 人读任务状态日志（某某任务已暂停 / 正常运行 / 原因）
TASK_STATUS_LOG_PATH = (
    Path.home() / "Library" / "Logs" / "vocab-fill-task-status.log"
)
TASK_STATUS_JSON_PATH = CFG_DIR / "vocab-fill-task-status.json"

DEFAULT_MAX_ATTEMPTS = 3

# label → 中文名（维护中心日志用）
FILL_TASKS: tuple[dict[str, str], ...] = (
    {
        "label": "com.infoquests.jp-vocab-fill-unified",
        "id": "jp-vocab-fill-unified",
        "title": "日语统一补全（线上）",
    },
    {
        "label": "com.infoquests.jp-vocab-fill-pos-online",
        "id": "jp-vocab-fill-pos-online",
        "title": "临时词性补全（线上）",
    },
    {
        "label": "com.infoquests.jp-vocab-fill-related-compounds-online",
        "id": "jp-vocab-fill-related-compounds-online",
        "title": "临时相关构词补全（线上）",
    },
    {
        "label": "com.infoquests.jp-vocab-fill-frequency-online",
        "id": "jp-vocab-fill-frequency-online",
        "title": "临时口语/考试频率补全（线上）",
    },
    {
        "label": "com.infoquests.jp-vocab-fill-grammar",
        "id": "jp-vocab-fill-grammar",
        "title": "日语语法用法+例句补全",
    },
    {
        "label": "com.infoquests.jp-vocab-fill-examples",
        "id": "jp-vocab-fill-examples",
        "title": "日语例句补全",
    },
    {
        "label": "com.infoquests.jp-vocab-fill-pos",
        "id": "jp-vocab-fill-pos",
        "title": "日语词性补全",
    },
    {
        "label": "com.infoquests.jp-vocab-fill-reading",
        "id": "jp-vocab-fill-reading",
        "title": "日语读音补全",
    },
    {
        "label": "com.infoquests.en-vocab-fill",
        "id": "en-vocab-fill",
        "title": "英语整词补全",
    },
)

FILL_LAUNCHD_LABELS: tuple[str, ...] = tuple(t["label"] for t in FILL_TASKS)


def max_attempts() -> int:
    raw = (
        os.environ.get("VOCAB_FILL_MAX_ATTEMPTS")
        or str(DEFAULT_MAX_ATTEMPTS)
    ).strip()
    try:
        n = int(raw)
    except ValueError:
        return DEFAULT_MAX_ATTEMPTS
    return max(1, min(n, 20))


def _log(msg: str) -> None:
    line = f"{time.strftime('%F %T')} {msg}"
    print(line, flush=True)
    try:
        KILL_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
        with KILL_LOG_PATH.open("a", encoding="utf-8") as fh:
            fh.write(line + "\n")
    except OSError:
        pass


def is_killed() -> bool:
    return KILL_PATH.is_file()


def read_kill_reason() -> str:
    if not KILL_PATH.is_file():
        return ""
    try:
        return KILL_PATH.read_text(encoding="utf-8").strip()
    except OSError:
        return "(unreadable kill switch)"


def assert_not_killed(owner: str = "vocab-fill") -> None:
    """入口调用：已熔断则打印原因（含三次明细路径）并以 0 退出。"""
    if not is_killed():
        return
    reason = read_kill_reason() or "no detail"
    print(
        f"[{owner}] vocab-fill KILL switch active — skip all API calls.\n"
        f"  reason:\n{reason}\n"
        f"  full_report: {KILL_REPORT_PATH}\n"
        f"  resume: bash scripts/vocab-fill-circuit-resume.sh",
        flush=True,
    )
    if KILL_REPORT_PATH.is_file():
        try:
            print(KILL_REPORT_PATH.read_text(encoding="utf-8"), flush=True)
        except OSError:
            pass
    raise SystemExit(0)


def _load_attempts() -> dict[str, Any]:
    if not ATTEMPTS_PATH.is_file():
        return {"items": {}}
    try:
        raw = json.loads(ATTEMPTS_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"items": {}}
    if not isinstance(raw, dict):
        return {"items": {}}
    items = raw.get("items")
    if not isinstance(items, dict):
        raw["items"] = {}
    return raw


def _save_attempts(data: dict[str, Any]) -> None:
    CFG_DIR.mkdir(parents=True, exist_ok=True)
    ATTEMPTS_PATH.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def _item_key(scope: str, word_id: int) -> str:
    return f"{scope}:{int(word_id)}"


def get_attempt_count(scope: str, word_id: int) -> int:
    data = _load_attempts()
    item = data.get("items", {}).get(_item_key(scope, word_id)) or {}
    try:
        return int(item.get("count") or 0)
    except (TypeError, ValueError):
        return 0


def get_attempt_history(scope: str, word_id: int) -> list[dict[str, Any]]:
    data = _load_attempts()
    item = data.get("items", {}).get(_item_key(scope, word_id)) or {}
    hist = item.get("history") if isinstance(item, dict) else None
    if not isinstance(hist, list):
        return []
    out: list[dict[str, Any]] = []
    for row in hist:
        if isinstance(row, dict):
            out.append(row)
    return out


def record_attempt(
    scope: str,
    word_id: int,
    word: str = "",
    reason: str = "",
) -> int:
    """记录一次失败调用（含第几次 + 原因）；返回累计次数。"""
    data = _load_attempts()
    items: dict[str, Any] = data.setdefault("items", {})
    key = _item_key(scope, word_id)
    prev = items.get(key) if isinstance(items.get(key), dict) else {}
    history = list(prev.get("history") or []) if isinstance(prev, dict) else []
    # 只保留失败明细；成功会 clear_attempts
    count = int(prev.get("count") or 0) + 1 if isinstance(prev, dict) else 1
    if len(history) + 1 != count:
        count = len(history) + 1
    reason_text = (reason or "unknown").strip() or "unknown"
    entry = {
        "n": count,
        "at": time.strftime("%F %T"),
        "at_ts": time.time(),
        "reason": reason_text[:500],
    }
    history.append(entry)
    items[key] = {
        "count": count,
        "scope": scope,
        "word_id": int(word_id),
        "word": str(word or (prev.get("word") if isinstance(prev, dict) else "") or ""),
        "history": history,
        "updated_at": time.time(),
    }
    _save_attempts(data)
    _log(
        f"attempt#{count} {key} word={word!r} reason={reason_text!r}"
    )
    print(
        f"[vocab-fill-circuit] 第{count}次未搞定 "
        f"scope={scope} id={word_id} word={word!r} 原因={reason_text}",
        flush=True,
    )
    return count


def clear_attempts(scope: str, word_id: int) -> None:
    data = _load_attempts()
    items: dict[str, Any] = data.setdefault("items", {})
    key = _item_key(scope, word_id)
    if key in items:
        del items[key]
        _save_attempts(data)
        _log(f"cleared attempts {key}")


def format_attempt_report(
    *,
    scope: str,
    word_id: int,
    word: str,
    history: list[dict[str, Any]] | None = None,
) -> str:
    """人读：第1/2/3次分别调了什么、为何没结果。"""
    hist = history if history is not None else get_attempt_history(scope, word_id)
    lines = [
        "【补全熔断报告】同一词条调满 3 次仍未搞定 → 已停掉全部日语/英语补全定时任务",
        f"模块(scope)：{scope}",
        f"词条：{word}（id={word_id}）",
        f"累计失败次数：{len(hist)}",
        "",
    ]
    if not hist:
        lines.append("（无明细：history 为空）")
    for row in hist:
        n = row.get("n", "?")
        at = row.get("at", "?")
        reason = row.get("reason", "unknown")
        lines.append(f"第{n}次  {at}")
        lines.append(f"  调不出结果的原因：{reason}")
        lines.append("")
    lines.append("恢复（确认修好后再开）：")
    lines.append("  bash scripts/vocab-fill-circuit-resume.sh")
    lines.append(f"明细文件：{KILL_REPORT_PATH}")
    lines.append(f"计数文件：{ATTEMPTS_PATH}")
    return "\n".join(lines).rstrip() + "\n"

def _append_task_status_log(line: str) -> None:
    """追加一行人读状态日志（某某任务已暂停 / 正常运行…）。"""
    text = line.rstrip("\n")
    stamped = f"{time.strftime('%F %T')} | {text}"
    print(stamped, flush=True)
    try:
        TASK_STATUS_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
        with TASK_STATUS_LOG_PATH.open("a", encoding="utf-8") as fh:
            fh.write(stamped + "\n")
        with KILL_LOG_PATH.open("a", encoding="utf-8") as fh:
            fh.write(stamped + "\n")
    except OSError:
        pass


def _launchctl_loaded_labels() -> set[str]:
    loaded: set[str] = set()
    try:
        proc = subprocess.run(
            ["launchctl", "list"],
            capture_output=True,
            text=True,
            timeout=8,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return loaded
    for line in (proc.stdout or "").splitlines():
        parts = line.split("\t")
        if len(parts) >= 3 and parts[2].strip():
            loaded.add(parts[2].strip())
    return loaded


def build_fill_task_status_rows(
    *,
    pause_reason: str | None = None,
) -> list[dict[str, Any]]:
    """每条补全定时：paused / running_ok / not_loaded + 说明。"""
    killed = is_killed()
    reason = (pause_reason or read_kill_reason() or "").strip()
    loaded = _launchctl_loaded_labels()
    rows: list[dict[str, Any]] = []
    for task in FILL_TASKS:
        label = task["label"]
        title = task["title"]
        tid = task["id"]
        if killed:
            state = "paused"
            state_label = "已暂停"
            detail = reason or "熔断：同一词条调满 3 次仍未搞定"
            line = f"{title}：已暂停（原因：{detail[:200]}）"
        elif label in loaded:
            state = "running_ok"
            state_label = "正在运行"
            detail = "定时任务已开启，按间隔检测/补全"
            line = f"{title}：正在运行"
        else:
            state = "not_loaded"
            state_label = "未运行"
            detail = "定时任务未开启（未安装或已卸下）"
            line = f"{title}：未运行"
        rows.append(
            {
                "id": tid,
                "label": label,
                "title": title,
                "state": state,
                "state_label": state_label,
                "detail": detail,
                "line": line,
            }
        )
    return rows


def write_task_status_snapshot(
    *,
    event: str,
    pause_reason: str | None = None,
) -> dict[str, Any]:
    """写 JSON 快照 + 追加状态日志（维护中心日志模块用）。"""
    rows = build_fill_task_status_rows(pause_reason=pause_reason)
    killed = is_killed()
    payload = {
        "ok": True,
        "event": event,
        "killed": killed,
        "status": "paused" if killed else "running",
        "status_label": "补全定时已全部暂停（熔断）"
        if killed
        else "补全定时正常（未熔断）",
        "pause_reason": (pause_reason or read_kill_reason() or "").strip() or None,
        "updated_at": time.strftime("%F %T"),
        "tasks": rows,
        "paths": {
            "kill_switch": str(KILL_PATH),
            "kill_report": str(KILL_REPORT_PATH),
            "attempts": str(ATTEMPTS_PATH),
            "task_status_log": str(TASK_STATUS_LOG_PATH),
            "task_status_json": str(TASK_STATUS_JSON_PATH),
            "circuit_log": str(KILL_LOG_PATH),
        },
        "resume_hint": "bash scripts/vocab-fill-circuit-resume.sh",
    }
    try:
        CFG_DIR.mkdir(parents=True, exist_ok=True)
        TASK_STATUS_JSON_PATH.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
    except OSError as exc:
        _log(f"write task status json failed: {exc}")

    _append_task_status_log(f"—— 事件：{event} ——")
    _append_task_status_log(payload["status_label"])
    if payload.get("pause_reason"):
        _append_task_status_log(f"熔断原因：{payload['pause_reason'][:300]}")
    for row in rows:
        _append_task_status_log(row["line"])
    return payload


def public_circuit_snapshot(*, log_tail_lines: int = 80) -> dict[str, Any]:
    """维护中心 API 用：当前状态 + 任务列表 + 日志尾。"""
    # 刷新一份最新快照（不追加「事件」噪音时用 silent rebuild）
    rows = build_fill_task_status_rows()
    killed = is_killed()
    report = ""
    if KILL_REPORT_PATH.is_file():
        try:
            report = KILL_REPORT_PATH.read_text(encoding="utf-8")
        except OSError:
            report = ""
    log_tail = ""
    if TASK_STATUS_LOG_PATH.is_file():
        try:
            lines = TASK_STATUS_LOG_PATH.read_text(encoding="utf-8").splitlines()
            log_tail = "\n".join(lines[-max(1, log_tail_lines) :])
        except OSError:
            log_tail = ""
    attempts_summary: list[dict[str, Any]] = []
    data = _load_attempts()
    for key, meta in sorted((data.get("items") or {}).items()):
        if not isinstance(meta, dict):
            continue
        attempts_summary.append(
            {
                "key": key,
                "word": meta.get("word"),
                "word_id": meta.get("word_id"),
                "scope": meta.get("scope"),
                "count": meta.get("count"),
                "history": meta.get("history") or [],
            }
        )
    return {
        "ok": True,
        "killed": killed,
        "status": "paused" if killed else "running",
        "status_label": "补全定时已全部暂停（熔断）"
        if killed
        else "补全定时正常（未熔断）",
        "pause_reason": read_kill_reason() or None,
        "report": report,
        "tasks": rows,
        "attempts": attempts_summary,
        "task_status_log_tail": log_tail,
        "paths": {
            "kill_switch": str(KILL_PATH),
            "kill_report": str(KILL_REPORT_PATH),
            "attempts": str(ATTEMPTS_PATH),
            "task_status_log": str(TASK_STATUS_LOG_PATH),
            "task_status_json": str(TASK_STATUS_JSON_PATH),
        },
        "resume_hint": "bash scripts/vocab-fill-circuit-resume.sh",
        "server_time": time.strftime("%Y-%m-%d %H:%M:%S"),
    }


def _gui_domain() -> str:
    try:
        uid = os.getuid()
    except AttributeError:
        uid = 501
    return f"gui/{uid}"


def bootout_all_fill_launchd() -> list[str]:
    """立刻卸掉日语/英语补全定时任务；返回已尝试的 label。"""
    domain = _gui_domain()
    done: list[str] = []
    for label in FILL_LAUNCHD_LABELS:
        try:
            subprocess.run(
                ["launchctl", "bootout", f"{domain}/{label}"],
                check=False,
                capture_output=True,
                text=True,
                timeout=15,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            _log(f"bootout {label} failed: {exc}")
        done.append(label)
        _log(f"bootout {label}")
    return done


def trip_kill_switch(
    *,
    scope: str,
    word_id: int,
    word: str,
    attempts: int,
    detail: str = "",
) -> None:
    """同一词 3 次未搞定：写 KILL 开关 + 三次明细报告 + 停掉全部 JP/EN fill launchd。"""
    CFG_DIR.mkdir(parents=True, exist_ok=True)
    history = get_attempt_history(scope, word_id)
    report = format_attempt_report(
        scope=scope,
        word_id=word_id,
        word=word,
        history=history,
    )
    KILL_REPORT_PATH.write_text(report, encoding="utf-8")
    reason = (
        f"SAME_ITEM_3_STRIKES scope={scope} word_id={word_id} word={word!r} "
        f"attempts={attempts} at={time.strftime('%F %T')}"
    )
    if detail:
        reason += f" last_reason={detail}"
    # 开关文件：摘要 + 三次原因各一行，方便 cat
    switch_lines = [reason, ""]
    for row in history:
        switch_lines.append(
            f"#{row.get('n')} {row.get('at')} | {row.get('reason')}"
        )
    switch_lines.append("")
    switch_lines.append(f"full_report={KILL_REPORT_PATH}")
    switch_lines.append("resume: bash scripts/vocab-fill-circuit-resume.sh")
    KILL_PATH.write_text("\n".join(switch_lines) + "\n", encoding="utf-8")
    _log(f"KILL SWITCH TRIPPED: {reason}")
    print(report, flush=True)
    bootout_all_fill_launchd()
    write_task_status_snapshot(
        event="熔断触发：停掉全部日语/英语补全定时",
        pause_reason=reason,
    )
    _log(
        "All jp/en vocab fill launchd stopped. "
        "Resume: bash scripts/vocab-fill-circuit-resume.sh"
    )
    bark_detail = (
        f"{word}（id={word_id} scope={scope}）×{attempts}次未搞定，"
        f"已停全部 JP/EN 补全定时"
    )
    if detail:
        bark_detail += f"；末次：{detail[:80]}"
    _try_bark(bark_detail)


def _try_bark(reason: str) -> None:
    """熔断后必须推 Bark（未配置则安静 skip；失败不挡熔断）。

    约定：用户要立刻知道付费定时已停；level=active + sound（勿 critical/call）。
    """
    try:
        env_path = Path.home() / ".config" / "bark" / "env"
        file_env: dict[str, str] = {}
        if env_path.is_file():
            for line in env_path.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, _, v = line.partition("=")
                file_env[k.strip()] = v.strip().strip('"').strip("'")

        enabled = (
            os.environ.get("BARK_ENABLED") or file_env.get("BARK_ENABLED") or "1"
        ).strip().lower()
        if enabled in {"0", "false", "no", "off"}:
            _log("bark skip: BARK_ENABLED off")
            return

        key = (os.environ.get("BARK_DEVICE_KEY") or file_env.get("BARK_DEVICE_KEY") or "").strip()
        push_url = (
            os.environ.get("BARK_PUSH_URL") or file_env.get("BARK_PUSH_URL") or ""
        ).strip()
        if not key and push_url:
            # https://api.day.app/<key>…
            parts = push_url.rstrip("/").split("/")
            if parts:
                key = parts[-1].split("?")[0].strip()
        if not key:
            _log("bark skip: no BARK_DEVICE_KEY")
            return

        import json as _json
        import urllib.request

        server = (
            os.environ.get("BARK_SERVER")
            or file_env.get("BARK_SERVER")
            or "https://api.day.app"
        ).rstrip("/")
        sound = (
            os.environ.get("BARK_SOUND_CIRCUIT")
            or file_env.get("BARK_SOUND_CIRCUIT")
            or os.environ.get("BARK_SOUND_DEPLOY_FAIL")
            or file_env.get("BARK_SOUND_DEPLOY_FAIL")
            or "shake"
        )
        title = "补全熔断"
        body = (
            f"改动：词条补全三次熔断已停定时\n"
            f"项目：strategy-compare-cloud\n"
            f"状态：失败（熔断）\n"
            f"详情：{reason[:180]}"
        )
        payload = _json.dumps(
            {
                "title": title,
                "body": body,
                "group": "strategy-compare-cloud",
                "level": "active",
                "sound": sound,
            },
            ensure_ascii=False,
        ).encode("utf-8")
        req = urllib.request.Request(
            f"{server}/{key}",
            data=payload,
            headers={"Content-Type": "application/json; charset=utf-8"},
            method="POST",
        )
        urllib.request.urlopen(req, timeout=8).read()
        _log(f"bark ok: {title} | {reason[:120]}")
    except Exception as exc:  # noqa: BLE001
        _log(f"bark failed (ignored): {exc}")


def after_attempt(
    *,
    scope: str,
    word_id: int,
    word: str,
    fixed: bool,
    detail: str = "",
) -> int:
    """
    每次对某词打完接口后调用。
    fixed=True → 清零计数；fixed=False → 记第 N 次失败原因；≥3 → 熔断全停。
    返回当前累计次数。
    """
    if fixed:
        clear_attempts(scope, word_id)
        return 0
    count = record_attempt(
        scope,
        word_id,
        word,
        reason=detail or "not_fixed",
    )
    if count >= max_attempts():
        trip_kill_switch(
            scope=scope,
            word_id=word_id,
            word=word,
            attempts=count,
            detail=detail or "not_fixed_after_max_attempts",
        )
    return count


def clear_kill_switch() -> None:
    if KILL_PATH.is_file():
        KILL_PATH.unlink()
        _log("kill switch file removed")
    # 保留 KILL_REPORT_PATH 便于事后查看三次原因；不自动删


def resume_fill_launchd() -> None:
    """清 KILL 后重新 bootstrap 已安装的 plist（若文件仍在 LaunchAgents）。"""
    clear_kill_switch()
    domain = _gui_domain()
    agents = Path.home() / "Library" / "LaunchAgents"
    for label in FILL_LAUNCHD_LABELS:
        plist = agents / f"{label}.plist"
        if not plist.is_file():
            _log(f"resume skip (no plist): {label}")
            continue
        subprocess.run(
            ["launchctl", "bootout", f"{domain}/{label}"],
            check=False,
            capture_output=True,
            text=True,
        )
        proc = subprocess.run(
            ["launchctl", "bootstrap", domain, str(plist)],
            check=False,
            capture_output=True,
            text=True,
        )
        subprocess.run(
            ["launchctl", "enable", f"{domain}/{label}"],
            check=False,
            capture_output=True,
            text=True,
        )
        if proc.returncode == 0:
            _log(f"resume bootstrap ok: {label}")
        else:
            _log(
                f"resume bootstrap failed: {label} "
                f"err={(proc.stderr or proc.stdout or '').strip()}"
            )
    write_task_status_snapshot(event="熔断已解除：补全定时已恢复加载")


def main(argv: list[str] | None = None) -> int:
    args = list(argv if argv is not None else sys.argv[1:])
    if not args or args[0] in {"status", "--status"}:
        snap = public_circuit_snapshot()
        print(f"killed={snap['killed']} status={snap['status_label']}")
        if snap.get("pause_reason"):
            print(f"pause_reason=\n{snap['pause_reason']}")
        print("--- tasks ---")
        for row in snap.get("tasks") or []:
            print(f"  {row.get('line')}")
        print(f"attempts_file={ATTEMPTS_PATH}")
        print(f"task_status_log={TASK_STATUS_LOG_PATH}")
        data = _load_attempts()
        items = data.get("items") or {}
        print(f"tracked_items={len(items)}")
        for key, meta in sorted(items.items()):
            if not isinstance(meta, dict):
                continue
            print(
                f"  {key} count={meta.get('count')} "
                f"word={meta.get('word')!r}"
            )
            for row in meta.get("history") or []:
                if isinstance(row, dict):
                    print(
                        f"    #{row.get('n')} {row.get('at')} "
                        f"原因={row.get('reason')}"
                    )
        return 0
    if args[0] == "resume":
        resume_fill_launchd()
        print("OK: kill cleared; fill launchd re-bootstrapped (if plists exist)")
        return 0
    if args[0] == "kill-test":
        trip_kill_switch(
            scope="test",
            word_id=0,
            word="kill-test",
            attempts=max_attempts(),
            detail="manual kill-test",
        )
        return 0
    print(
        "usage: vocab_fill_circuit_breaker.py [status|resume|kill-test]",
        file=sys.stderr,
    )
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
