#!/usr/bin/env python3
"""日语词条补全失败 → 入队；Cursor 空闲满 10 分钟后用 SDK 后台 Agent 自动补+防复发。

流程：
1) 每 10 分钟扫维护中心 unresolved_fails（可始终检测）
2) 有失败则写入 pending（含完整日志+提示词）
3) 若用户正在 Cursor 跑任务，或刚 stop 后未满 10 分钟 → 只入队不启动
4) 空闲达标 + CURSOR_API_KEY → cursor-sdk Agent.prompt（独立后台，不打断当前聊天）
5) PAUSE.switch 存在则整条链路停（检测也跳过启动；仍可 --scan-only）

暂停：
  touch ~/.config/info-quests/jp-vocab-fill-fail-autofix-PAUSE.switch
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))

from lib.cursor_agent_idle import (  # noqa: E402
    is_cursor_agent_idle,
    idle_gate_seconds,
)
from maintenance_center.jp_vocab_fill_feed import (  # noqa: E402
    list_jp_vocab_fill_unresolved_fails,
)
from maintenance_center.db import init_db  # noqa: E402

IQ = Path.home() / ".config" / "info-quests"
PAUSE_SWITCH = IQ / "jp-vocab-fill-fail-autofix-PAUSE.switch"
ENV_FILE = IQ / "jp-vocab-fill-fail-autofix.env"
PENDING_FILE = IQ / "jp-vocab-fill-fail-autofix.pending.json"
ARM_FOLLOWUP_FILE = IQ / "jp-vocab-fill-fail-autofix.arm-followup.json"
LOCK_DIR = IQ / "jp-vocab-fill-fail-autofix.lock.d"
LAST_SUCCESS = IQ / "jp-vocab-fill-fail-autofix.last_success"
LAST_RUN = IQ / "jp-vocab-fill-fail-autofix.last_run.json"
VENV_PYTHON = IQ / "cursor-sdk-venv" / "bin" / "python"
DEFAULT_MODEL = "composer-2.5"
MAX_FAILS_PER_RUN = 5
BARK_ARM_THROTTLE = IQ / "jp-vocab-fill-fail-autofix.arm-barked.json"


def _now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _log(msg: str) -> None:
    print(f"[jp-fill-fail-autofix] {_now()} {msg}", flush=True)


def _load_env_file(path: Path) -> None:
    if not path.is_file():
        return
    try:
        for line in path.read_text(encoding="utf-8").splitlines():
            s = line.strip()
            if not s or s.startswith("#") or "=" not in s:
                continue
            k, v = s.split("=", 1)
            k = k.strip()
            v = v.strip().strip("'").strip('"')
            if k and k not in os.environ:
                os.environ[k] = v
    except OSError:
        pass


def _paused() -> bool:
    if PAUSE_SWITCH.is_file():
        return True
    return (os.environ.get("JP_VOCAB_FILL_FAIL_AUTOFIX_DISABLED") or "").strip() in {
        "1",
        "true",
        "yes",
    }


def _acquire_lock() -> bool:
    try:
        LOCK_DIR.mkdir(parents=True, exist_ok=False)
        (LOCK_DIR / "pid").write_text(str(os.getpid()), encoding="utf-8")
        return True
    except FileExistsError:
        return False


def _release_lock() -> None:
    try:
        for p in LOCK_DIR.iterdir():
            p.unlink(missing_ok=True)
        LOCK_DIR.rmdir()
    except OSError:
        pass


def _format_fail_block(row: dict[str, Any]) -> str:
    kind = row.get("kind_label") or row.get("kind") or "-"
    fill = (
        row.get("fill_content_label")
        or row.get("applied_label")
        or row.get("fill_task_label")
        or "-"
    )
    lines = [
        "【词条补全失败】",
        "语言：日语",
        f"时间：{row.get('finished_at') or row.get('started_at') or '-'}",
        f"ID：{row.get('word_id') if row.get('word_id') is not None else '-'}",
        f"词条：{row.get('word') or '-'}",
        f"类型：{kind}",
        f"补全内容：{fill}",
        f"状态：{row.get('status_label') or row.get('status') or '-'}",
        f"来源：{row.get('source') or '-'}",
        f"错误：{row.get('error') or '（无详细错误信息）'}",
    ]
    preview = str(row.get("preview") or "").strip()
    if preview:
        lines.append("预览：")
        lines.append(preview)
    return "\n".join(lines)


def _build_prompt(fails: list[dict[str, Any]]) -> str:
    """与维护中心「一键复制失败日志」AI 提示词口径一致（app.js formatVocabFillFailAgentPrompt）。"""
    blocks = [_format_fail_block(r) for r in fails]
    joined = "\n\n----------\n\n".join(blocks)
    ids = ", ".join(
        f"{r.get('word_id')}:{r.get('word')}" for r in fails if r.get("word_id")
    )
    return f"""请帮忙手动更新维护中心「日语词条补全」这些未处理失败（已处理/已删除勿再动）。

未处理词条：{ids or '见下方日志'}

任务（按顺序）：
1) 读下方失败日志，判断根因（模型 JSON / apply 校验 / 假名 / 用法条数等）。
2) **手动更新线上**该词条缺/错的字段（用法/接序/例句等）：走现有 apply API；source 用「Agent现写」，禁止 source=手动。
3) 写回成功后立刻在维护中心标记为已处理：
   `python3 scripts/lib/vocab_fill_mark_resolved.py --lang jp --word-id … --word '…' --kind … --source 'Agent现写'`
4) **排查并修好防复发**：检查发给付费接口的 AI 提示词、apply 校验/检测逻辑、或相关程序代码，避免下次再发生同样错误（规则 bug-once-prevent）。
5) 本地先验证（对应 check_*.py）；写 `.cursor/hooks/.state/agent_feature_remark.txt`。
6) 不要 git commit，除非我明确要求。

失败日志原文：

{joined}
"""


def _fingerprint(fails: list[dict[str, Any]]) -> str:
    parts = []
    for r in fails:
        parts.append(
            f"{r.get('word_id')}|{r.get('word')}|{str(r.get('error') or '')[:120]}"
        )
    return "\n".join(parts)


def write_pending(fails: list[dict[str, Any]]) -> dict[str, Any]:
    prompt = _build_prompt(fails)
    payload = {
        "ok": True,
        "updated_at": _now(),
        "count": len(fails),
        "fingerprint": _fingerprint(fails),
        "fails": fails,
        "prompt": prompt,
        "idle_gate_seconds": idle_gate_seconds(),
    }
    PENDING_FILE.parent.mkdir(parents=True, exist_ok=True)
    PENDING_FILE.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return payload


def arm_ide_followup(pending: dict[str, Any], *, reason: str) -> None:
    """无 CURSOR_API_KEY 时：空闲达标后武装 IDE followup（下次 Agent stop 自动塞任务）。"""
    payload = {
        "armed_at": _now(),
        "reason": reason,
        "count": pending.get("count"),
        "fingerprint": pending.get("fingerprint"),
        "prompt": pending.get("prompt"),
        "words": [
            f"{r.get('word_id')}:{r.get('word')}"
            for r in (pending.get("fails") or [])
            if isinstance(r, dict)
        ],
    }
    ARM_FOLLOWUP_FILE.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    # 同一 fingerprint 只 Bark 一次，避免每 10 分钟吵
    prev_fp = ""
    if BARK_ARM_THROTTLE.is_file():
        try:
            prev_fp = str(
                json.loads(BARK_ARM_THROTTLE.read_text(encoding="utf-8")).get(
                    "fingerprint"
                )
                or ""
            )
        except (OSError, json.JSONDecodeError):
            prev_fp = ""
    fp = str(pending.get("fingerprint") or "")
    if fp and fp != prev_fp:
        _maybe_bark(
            "词条失败待自动修（无 API Key）",
            f"已空闲达标，入队 {pending.get('count')} 条。"
            "下次你在 Cursor 里让 Agent 跑完一轮后会自动跟进修复；"
            "若要人不在也能修：Dashboard→Integrations 生成 CURSOR_API_KEY。",
        )
        BARK_ARM_THROTTLE.write_text(
            json.dumps({"fingerprint": fp, "at": _now()}, ensure_ascii=False)
            + "\n",
            encoding="utf-8",
        )
    _log(f"armed IDE followup → {ARM_FOLLOWUP_FILE} ({reason})")


def clear_ide_followup_arm() -> None:
    ARM_FOLLOWUP_FILE.unlink(missing_ok=True)


def _cursor_api_key() -> str:
    return (os.environ.get("CURSOR_API_KEY") or "").strip()


def _sdk_python() -> str:
    env_py = (os.environ.get("CURSOR_SDK_PYTHON") or "").strip()
    if env_py and Path(env_py).is_file():
        return env_py
    if VENV_PYTHON.is_file():
        return str(VENV_PYTHON)
    return sys.executable


def _run_sdk_agent(prompt: str) -> dict[str, Any]:
    """用独立 venv 调 cursor-sdk，避免污染系统 Python。"""
    model = (os.environ.get("CURSOR_SDK_MODEL") or DEFAULT_MODEL).strip()
    key = _cursor_api_key()
    if not key:
        return {"ok": False, "error": "missing_CURSOR_API_KEY"}
    runner = r"""
import os, sys, json
from pathlib import Path
from cursor_sdk import Agent, AgentOptions, LocalAgentOptions, CursorAgentError

prompt = Path(sys.argv[1]).read_text(encoding="utf-8")
cwd = sys.argv[2]
model = sys.argv[3]
api_key = os.environ["CURSOR_API_KEY"]
try:
    result = Agent.prompt(
        prompt,
        AgentOptions(
            api_key=api_key,
            model=model,
            local=LocalAgentOptions(cwd=cwd),
        ),
    )
    status = getattr(result, "status", None) or ""
    out = {
        "ok": str(status).lower() not in ("error", "failed", "cancelled", "canceled"),
        "status": str(status),
        "result": str(getattr(result, "result", "") or "")[:4000],
        "id": str(getattr(result, "id", "") or getattr(result, "agent_id", "") or ""),
    }
    if str(status).lower() == "error":
        out["ok"] = False
        out["error"] = "run_status_error"
    print(json.dumps(out, ensure_ascii=False))
except CursorAgentError as e:
    print(json.dumps({
        "ok": False,
        "error": "startup_failed",
        "message": str(getattr(e, "message", None) or e),
        "retryable": bool(getattr(e, "is_retryable", False)),
    }, ensure_ascii=False))
    sys.exit(1)
except Exception as e:
    print(json.dumps({"ok": False, "error": "exception", "message": str(e)}, ensure_ascii=False))
    sys.exit(1)
"""
    prompt_path = IQ / "jp-vocab-fill-fail-autofix.last_prompt.txt"
    prompt_path.write_text(prompt, encoding="utf-8")
    env = os.environ.copy()
    env["CURSOR_API_KEY"] = key
    proc = subprocess.run(
        [_sdk_python(), "-c", runner, str(prompt_path), str(ROOT), model],
        cwd=str(ROOT),
        env=env,
        capture_output=True,
        text=True,
        timeout=int(os.environ.get("CURSOR_SDK_TIMEOUT_SEC") or 3600),
    )
    stdout = (proc.stdout or "").strip()
    stderr = (proc.stderr or "").strip()
    if not stdout:
        return {
            "ok": False,
            "error": "empty_sdk_output",
            "exit_code": proc.returncode,
            "stderr": stderr[-2000:],
        }
    # last JSON line
    line = stdout.splitlines()[-1]
    try:
        data = json.loads(line)
    except json.JSONDecodeError:
        return {
            "ok": False,
            "error": "bad_sdk_json",
            "stdout": stdout[-2000:],
            "stderr": stderr[-2000:],
            "exit_code": proc.returncode,
        }
    if proc.returncode != 0 and data.get("ok") is not False:
        data["ok"] = False
        data["exit_code"] = proc.returncode
    if stderr:
        data["stderr_tail"] = stderr[-1000:]
    return data


def _maybe_bark(title: str, body: str) -> None:
    try:
        sys.path.insert(0, str(SCRIPTS))
        from maintenance_center.bark_notify import send_bark_push

        send_bark_push(
            title=title,
            body=body,
            group="strategy-compare-cloud",
            level="active",
            sound="bell",
        )
    except Exception as e:
        _log(f"bark skip: {e}")


def _quiz_gate_quiet() -> bool:
    """抽查中 / 冷却中 → True（本轮不启动 Agent）。缺 token 不挡（避免误杀）。"""
    try:
        from lib.vocab_fill_quiz_gate import fetch_vocab_fill_quiz_gate

        gate = fetch_vocab_fill_quiz_gate(label="jp-vocab-fill-fail-autofix")
        if not isinstance(gate, dict):
            return False
        if gate.get("reason") == "gate_no_token":
            return False
        if gate.get("ok") is False and not gate.get("quiet"):
            return False
        return bool(gate.get("quiet") or gate.get("skip"))
    except Exception as e:
        _log(f"quiz gate check skip: {e}")
        return False


def collect_fails(limit: int = MAX_FAILS_PER_RUN) -> list[dict[str, Any]]:
    init_db()
    rows = list_jp_vocab_fill_unresolved_fails(limit=200)
    return rows[: max(1, min(MAX_FAILS_PER_RUN, int(limit)))]


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="日语补全失败自动修（空闲+SDK）")
    ap.add_argument("--scan-only", action="store_true", help="只扫库入队，不启动 Agent")
    ap.add_argument("--force", action="store_true", help="忽略空闲门禁（仍尊重 PAUSE）")
    ap.add_argument("--dry-run", action="store_true", help="入队+门禁判断，不调 SDK")
    args = ap.parse_args(argv)

    _load_env_file(ENV_FILE)
    # 也读统一补全 env（可能有 token）；API key 仍看 autofix env / CURSOR_API_KEY
    _load_env_file(IQ / "jp-vocab-fill.env")

    if _paused():
        _log("paused (PAUSE.switch or DISABLED=1)")
        return 0

    fails = collect_fails()
    if not fails:
        _log("no unresolved fails")
        if PENDING_FILE.is_file():
            PENDING_FILE.unlink(missing_ok=True)
        clear_ide_followup_arm()
        LAST_RUN.write_text(
            json.dumps(
                {"at": _now(), "action": "clean", "count": 0},
                ensure_ascii=False,
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        return 0

    pending = write_pending(fails)
    _log(f"queued unresolved={pending['count']} → {PENDING_FILE}")

    if args.scan_only:
        return 0

    idle_ok, idle_reason = is_cursor_agent_idle()
    if args.force:
        idle_ok, idle_reason = True, "force"
    if not idle_ok:
        _log(f"skip launch (wait idle): {idle_reason}; gate={idle_gate_seconds()}s")
        LAST_RUN.write_text(
            json.dumps(
                {
                    "at": _now(),
                    "action": "queued_wait_idle",
                    "count": pending["count"],
                    "idle_reason": idle_reason,
                    "words": [f"{r.get('word_id')}:{r.get('word')}" for r in fails],
                },
                ensure_ascii=False,
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        return 0

    if _quiz_gate_quiet():
        _log("skip launch: quiz gate quiet")
        return 0

    # 无 API Key：不跑 SDK，武装 IDE followup（人不在时需 Key；人在用 Cursor 可无 Key）
    if not _cursor_api_key():
        if args.dry_run:
            _log("dry-run: would arm IDE followup (no CURSOR_API_KEY)")
            return 0
        arm_ide_followup(pending, reason=f"no_api_key:{idle_reason}")
        LAST_RUN.write_text(
            json.dumps(
                {
                    "at": _now(),
                    "action": "arm_ide_followup",
                    "count": pending["count"],
                    "idle_reason": idle_reason,
                    "words": [f"{r.get('word_id')}:{r.get('word')}" for r in fails],
                },
                ensure_ascii=False,
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        return 0

    if args.dry_run:
        _log("dry-run: would launch SDK agent")
        return 0

    # 有 Key：走后台 SDK；清掉 IDE 武装避免双重跟进
    clear_ide_followup_arm()

    if not _acquire_lock():
        _log("skip: lock busy")
        return 0

    try:
        _log(f"launch SDK agent model={os.environ.get('CURSOR_SDK_MODEL') or DEFAULT_MODEL}")
        _maybe_bark(
            "正在自动修词条失败",
            f"空闲达标，后台 Agent 处理 {pending['count']} 条："
            + "、".join(str(r.get("word") or r.get("word_id")) for r in fails[:3]),
        )
        result = _run_sdk_agent(str(pending["prompt"]))
        LAST_RUN.write_text(
            json.dumps(
                {
                    "at": _now(),
                    "action": "sdk_run",
                    "count": pending["count"],
                    "idle_reason": idle_reason,
                    "result": result,
                },
                ensure_ascii=False,
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        if result.get("ok"):
            LAST_SUCCESS.write_text(_now() + "\n", encoding="utf-8")
            _log(f"sdk ok status={result.get('status')}")
            _maybe_bark("词条失败自动修完成", f"处理了约 {pending['count']} 条，请到维护中心确认绿标。")
            return 0
        _log(f"sdk failed: {result}")
        _maybe_bark(
            "词条失败自动修未完成",
            str(result.get("error") or result.get("message") or result)[:200],
        )
        return 2
    finally:
        _release_lock()


if __name__ == "__main__":
    raise SystemExit(main())
