from __future__ import annotations

import subprocess
from datetime import datetime
from typing import Any

from .db import get_conn, init_db


def now_str() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def git_output(*args: str) -> str:
    try:
        proc = subprocess.run(
            ["git", *args],
            text=True,
            capture_output=True,
        )
    except OSError:
        return ""
    if proc.returncode != 0:
        return ""
    return proc.stdout.strip()


def create_deploy_log(
    *,
    mode: str,
    trigger_source: str,
    summary: str = "",
    remark: str = "",
) -> int:
    init_db()
    with get_conn() as conn:
        cur = conn.execute(
            """
            INSERT INTO deploy_logs (
                mode, status, trigger_source, summary, remark, branch,
                git_commit_short, git_commit_full, started_at
            ) VALUES (?, 'running', ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                mode,
                trigger_source,
                summary.strip(),
                remark.strip(),
                git_output("rev-parse", "--abbrev-ref", "HEAD") or "",
                git_output("rev-parse", "--short", "HEAD") or "",
                git_output("rev-parse", "HEAD") or "",
                now_str(),
            ),
        )
        return int(cur.lastrowid)


def finish_deploy_log(
    *,
    log_id: int,
    status: str,
    exit_code: int | None,
    details: str,
    summary: str = "",
) -> None:
    init_db()
    with get_conn() as conn:
        conn.execute(
            """
            UPDATE deploy_logs
            SET status = ?, exit_code = ?, finished_at = ?, details = ?, summary = ?
            WHERE id = ?
            """,
            (status, exit_code, now_str(), details, summary.strip(), log_id),
        )


def list_deploy_logs(limit: int = 100) -> list[dict[str, Any]]:
    init_db()
    safe_limit = max(1, min(500, int(limit)))
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT
                id, mode, status, trigger_source, summary, remark, branch,
                git_commit_short, started_at, finished_at, exit_code
            FROM deploy_logs
            ORDER BY id DESC
            LIMIT ?
            """,
            (safe_limit,),
        ).fetchall()
    return [dict(row) for row in rows]


def get_deploy_log(log_id: int) -> dict[str, Any] | None:
    init_db()
    with get_conn() as conn:
        row = conn.execute(
            """
            SELECT
                id, mode, status, trigger_source, summary, remark, branch,
                git_commit_short, git_commit_full, started_at, finished_at, exit_code, details
            FROM deploy_logs
            WHERE id = ?
            """,
            (int(log_id),),
        ).fetchone()
    return dict(row) if row else None

