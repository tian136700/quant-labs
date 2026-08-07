#!/usr/bin/env python3
"""Regression: Agent 功能分块 SQLite + session/stop 钩子接线。"""

from __future__ import annotations

import json
import os
import sqlite3
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CLI = ROOT / "scripts" / "agent_task_chunks.py"
HOOKS_JSON = ROOT / ".cursor" / "hooks.json"
SESSION = ROOT / ".cursor" / "hooks" / "agent-task-chunks-session.py"
STOP = ROOT / ".cursor" / "hooks" / "agent-task-chunks-stop.py"
RULE = ROOT / ".cursor" / "rules" / "agent-task-chunks.mdc"
STATE_DIR = ROOT / ".cursor" / "hooks" / ".state"
CONTINUE_FLAG = STATE_DIR / "agent_task_chunks_continue.json"


def fail(msg: str) -> int:
    print(f"[check_agent_task_chunks] FAIL: {msg}", file=sys.stderr)
    return 1


def main() -> int:
    for path in (CLI, SESSION, STOP, RULE, HOOKS_JSON):
        if not path.is_file():
            return fail(f"missing {path.relative_to(ROOT)}")

    hooks = HOOKS_JSON.read_text(encoding="utf-8")
    if "agent-task-chunks-session.py" not in hooks:
        return fail("hooks.json sessionStart must include agent-task-chunks-session.py")
    if "agent-task-chunks-stop.py" not in hooks:
        return fail("hooks.json stop must include agent-task-chunks-stop.py")

    rule = RULE.read_text(encoding="utf-8")
    if "alwaysApply: true" not in rule:
        return fail("rule must alwaysApply: true")
    if "agent_task_chunks.py" not in rule:
        return fail("rule must point at agent_task_chunks.py")

    stop_src = STOP.read_text(encoding="utf-8")
    if "agent_task_chunks_continue.json" not in stop_src:
        return fail("stop must gate on continue flag file")
    if "followup_message" not in stop_src:
        return fail("stop hook must emit followup_message")

    with tempfile.TemporaryDirectory() as td:
        fake_root = Path(td) / "proj"
        (fake_root / "scripts").mkdir(parents=True)
        (fake_root / ".cursor" / "hooks" / ".state").mkdir(parents=True)
        (fake_root / "scripts" / "agent_task_chunks.py").write_text(
            CLI.read_text(encoding="utf-8"), encoding="utf-8"
        )
        fake_cli = fake_root / "scripts" / "agent_task_chunks.py"
        fake_state = fake_root / ".cursor" / "hooks" / ".state"
        fake_continue = fake_state / "agent_task_chunks_continue.json"

        def fake_run(args: list[str]) -> subprocess.CompletedProcess[str]:
            return subprocess.run(
                [sys.executable, str(fake_cli), *args],
                cwd=str(fake_root),
                capture_output=True,
                text=True,
                check=False,
            )

        r = fake_run(
            ["create", "--title", "测试大功能", "--chunks", "块A|块B|块C"]
        )
        if r.returncode != 0:
            return fail(f"create failed: {r.stderr or r.stdout}")

        db = fake_state / "agent_task_chunks.sqlite"
        if not db.is_file():
            return fail("sqlite not created")

        conn = sqlite3.connect(str(db))
        n = conn.execute("SELECT COUNT(*) FROM chunks").fetchone()[0]
        if n != 3:
            return fail(f"expected 3 chunks, got {n}")
        first = conn.execute(
            "SELECT id, status FROM chunks WHERE seq = 1"
        ).fetchone()
        second = conn.execute("SELECT id FROM chunks WHERE seq = 2").fetchone()
        if not first or first[1] != "in_progress":
            return fail("seq1 should be in_progress after create")
        conn.close()

        if fake_continue.is_file():
            return fail("create must not set continue flag")

        r2 = fake_run(["done", str(first[0])])
        if r2.returncode != 0:
            return fail(f"done failed: {r2.stderr or r2.stdout}")
        if not fake_continue.is_file():
            return fail("done with remaining chunks must write continue flag")

        flag = json.loads(fake_continue.read_text(encoding="utf-8"))
        if int(flag.get("next_chunk_id")) != int(second[0]):
            return fail("continue flag next_chunk_id mismatch")

        conn = sqlite3.connect(str(db))
        st1 = conn.execute(
            "SELECT status FROM chunks WHERE id = ?", (first[0],)
        ).fetchone()[0]
        st2 = conn.execute(
            "SELECT status FROM chunks WHERE id = ?", (second[0],)
        ).fetchone()[0]
        if st1 != "done" or st2 != "in_progress":
            return fail(f"after done: got {st1}/{st2}, want done/in_progress")
        conn.close()

        r3 = fake_run(["session-summary"])
        data = json.loads((r3.stdout or "").strip())
        if not data.get("has_open") or int(data["chunk"]["id"]) != int(second[0]):
            return fail(f"session-summary bad: {data}")

        # 真实 stop：用仓库 STATE 临时放 continue 旗（测完清掉）
        STATE_DIR.mkdir(parents=True, exist_ok=True)
        backup = None
        if CONTINUE_FLAG.is_file():
            backup = CONTINUE_FLAG.read_text(encoding="utf-8")
        try:
            CONTINUE_FLAG.write_text(
                json.dumps(
                    {
                        "task_id": 1,
                        "task_title": "测",
                        "next_chunk_id": 99,
                        "next_seq": 2,
                        "next_title": "下一块",
                        "remaining": 2,
                    },
                    ensure_ascii=False,
                )
                + "\n",
                encoding="utf-8",
            )
            env = os.environ.copy()
            env["AGENT_TASK_CHUNKS_FOLLOWUP"] = "1"
            proc = subprocess.run(
                [sys.executable, str(STOP)],
                input=json.dumps({"status": "completed", "loop_count": 0}),
                capture_output=True,
                text=True,
                cwd=str(ROOT),
                env=env,
                timeout=10,
                check=False,
            )
            out = (proc.stdout or "").strip()
            data_stop = json.loads(out) if out else {}
            if "chunk#99" not in (data_stop.get("followup_message") or ""):
                return fail(f"expected followup for next chunk, got {data_stop}")
            if CONTINUE_FLAG.is_file():
                return fail("stop must clear continue flag after followup")

            # aborted 不应 followup
            CONTINUE_FLAG.write_text(
                json.dumps({"next_chunk_id": 1, "task_id": 1, "task_title": "x"}),
                encoding="utf-8",
            )
            proc = subprocess.run(
                [sys.executable, str(STOP)],
                input=json.dumps({"status": "aborted", "loop_count": 0}),
                capture_output=True,
                text=True,
                cwd=str(ROOT),
                env=env,
                timeout=10,
                check=False,
            )
            data_ab = json.loads((proc.stdout or "").strip() or "{}")
            if data_ab.get("followup_message"):
                return fail("aborted must not followup")
            if CONTINUE_FLAG.is_file():
                return fail("aborted must clear continue flag")

            # FOLLOWUP=0
            CONTINUE_FLAG.write_text(
                json.dumps({"next_chunk_id": 1, "task_id": 1, "task_title": "x"}),
                encoding="utf-8",
            )
            env["AGENT_TASK_CHUNKS_FOLLOWUP"] = "0"
            proc = subprocess.run(
                [sys.executable, str(STOP)],
                input=json.dumps({"status": "completed", "loop_count": 0}),
                capture_output=True,
                text=True,
                cwd=str(ROOT),
                env=env,
                timeout=10,
                check=False,
            )
            data_off = json.loads((proc.stdout or "").strip() or "{}")
            if data_off.get("followup_message"):
                return fail("FOLLOWUP=0 must not followup")
        finally:
            if backup is None:
                if CONTINUE_FLAG.exists():
                    CONTINUE_FLAG.unlink()
            else:
                CONTINUE_FLAG.write_text(backup, encoding="utf-8")

        # 做完剩余
        fake_run(["done", str(second[0])])
        third = sqlite3.connect(str(db)).execute(
            "SELECT id FROM chunks WHERE seq = 3"
        ).fetchone()[0]
        fake_run(["done", str(third)])
        if fake_continue.is_file():
            return fail("last done must clear continue flag")
        r4 = fake_run(["session-summary"])
        data4 = json.loads((r4.stdout or "").strip())
        if data4.get("has_open"):
            return fail("after all done, no open task expected")

    print("[check_agent_task_chunks] OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
