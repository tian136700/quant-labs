from __future__ import annotations

import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
DATA_DIR = ROOT / "tmp" / "deploy_center"
DB_PATH = DATA_DIR / "deploy_logs.sqlite3"


def get_conn() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    return conn


def init_db() -> None:
    with get_conn() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS deploy_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                mode TEXT NOT NULL,
                status TEXT NOT NULL,
                trigger_source TEXT NOT NULL DEFAULT '',
                summary TEXT NOT NULL DEFAULT '',
                remark TEXT NOT NULL DEFAULT '',
                branch TEXT NOT NULL DEFAULT '',
                git_commit_short TEXT NOT NULL DEFAULT '',
                git_commit_full TEXT NOT NULL DEFAULT '',
                started_at TEXT NOT NULL,
                finished_at TEXT,
                exit_code INTEGER,
                details TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_deploy_logs_started_at ON deploy_logs(started_at DESC)"
        )

