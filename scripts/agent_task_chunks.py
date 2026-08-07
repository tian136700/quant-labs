#!/usr/bin/env python3
"""Agent 功能分块进度（SQLite）：大改动拆成几块，一块一块做完再标已处理。

防 Cursor 一次塞太多改动卡住。约定见 .cursor/rules/agent-task-chunks.mdc

用法：
  python3 scripts/agent_task_chunks.py create --title '…' --chunks '块1|块2|块3'
  python3 scripts/agent_task_chunks.py status
  python3 scripts/agent_task_chunks.py next
  python3 scripts/agent_task_chunks.py start <chunk_id>
  python3 scripts/agent_task_chunks.py done <chunk_id>
  python3 scripts/agent_task_chunks.py cancel-task <task_id>
  python3 scripts/agent_task_chunks.py list [--all]
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STATE_DIR = ROOT / ".cursor" / "hooks" / ".state"
DB_PATH = STATE_DIR / "agent_task_chunks.sqlite"
ACTIVE_POINTER = STATE_DIR / "agent_task_chunks_active.json"
# done 一块后写入；stop 钩子读到才 followup，避免无关回合误续
CONTINUE_FLAG = STATE_DIR / "agent_task_chunks_continue.json"

STATUS_OPEN = "open"
STATUS_DONE = "done"
STATUS_CANCELLED = "cancelled"

CHUNK_PENDING = "pending"
CHUNK_IN_PROGRESS = "in_progress"
CHUNK_DONE = "done"
CHUNK_SKIPPED = "skipped"


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def ensure_db() -> sqlite3.Connection:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS tasks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'open',
          conversation_id TEXT,
          notes TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          completed_at TEXT
        );
        CREATE TABLE IF NOT EXISTS chunks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          task_id INTEGER NOT NULL,
          seq INTEGER NOT NULL,
          title TEXT NOT NULL,
          detail TEXT,
          status TEXT NOT NULL DEFAULT 'pending',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          completed_at TEXT,
          UNIQUE(task_id, seq),
          FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_chunks_task_status
          ON chunks(task_id, status);
        CREATE INDEX IF NOT EXISTS idx_tasks_status
          ON tasks(status);
        """
    )
    conn.commit()
    return conn


def write_active_pointer(task_id: int | None) -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    if task_id is None:
        if ACTIVE_POINTER.exists():
            ACTIVE_POINTER.unlink()
        return
    ACTIVE_POINTER.write_text(
        json.dumps({"task_id": task_id, "updated_at": utc_now()}, ensure_ascii=False)
        + "\n",
        encoding="utf-8",
    )


def write_continue_flag(payload: dict | None) -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    if payload is None:
        if CONTINUE_FLAG.exists():
            CONTINUE_FLAG.unlink()
        return
    CONTINUE_FLAG.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def read_active_pointer() -> int | None:
    if not ACTIVE_POINTER.is_file():
        return None
    try:
        data = json.loads(ACTIVE_POINTER.read_text(encoding="utf-8"))
        tid = data.get("task_id")
        return int(tid) if tid is not None else None
    except (OSError, json.JSONDecodeError, TypeError, ValueError):
        return None


def parse_chunks(raw: str) -> list[str]:
    parts: list[str] = []
    for line in raw.replace("\r\n", "\n").split("\n"):
        for piece in line.split("|"):
            t = piece.strip()
            if t:
                parts.append(t)
    return parts


def cmd_create(args: argparse.Namespace) -> int:
    titles = parse_chunks(args.chunks or "")
    if len(titles) < 2:
        print(
            "create 至少要 2 块（用 | 或换行分隔）。小改动不必建分块。",
            file=sys.stderr,
        )
        return 2
    if len(titles) > 20:
        print("单次最多 20 块，请再合并。", file=sys.stderr)
        return 2

    now = utc_now()
    conn = ensure_db()
    # 同会话只保留一个 open 任务为「当前」；旧 open 仍可查，但不自动续
    cur = conn.execute(
        """
        INSERT INTO tasks(title, status, conversation_id, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            args.title.strip(),
            STATUS_OPEN,
            (args.conversation_id or "").strip() or None,
            (args.notes or "").strip() or None,
            now,
            now,
        ),
    )
    task_id = int(cur.lastrowid)
    for i, title in enumerate(titles, start=1):
        conn.execute(
            """
            INSERT INTO chunks(task_id, seq, title, detail, status, created_at, updated_at)
            VALUES (?, ?, ?, NULL, ?, ?, ?)
            """,
            (task_id, i, title, CHUNK_PENDING, now, now),
        )
    conn.commit()
    write_active_pointer(task_id)
    # 第一块自动标 in_progress，Agent 立刻做这一块
    first = conn.execute(
        "SELECT id FROM chunks WHERE task_id = ? AND seq = 1",
        (task_id,),
    ).fetchone()
    if first:
        conn.execute(
            """
            UPDATE chunks SET status = ?, updated_at = ?
            WHERE id = ?
            """,
            (CHUNK_IN_PROGRESS, now, int(first["id"])),
        )
        conn.commit()

    print_task(conn, task_id)
    print(f"\nOK created task_id={task_id} chunks={len(titles)}")
    print(f"DB: {DB_PATH.relative_to(ROOT)}")
    print("下一步：只做 in_progress 那一块；做完后：")
    print(f"  python3 scripts/agent_task_chunks.py done {int(first['id'])}")
    return 0


def fetch_open_task_id(conn: sqlite3.Connection) -> int | None:
    pointed = read_active_pointer()
    if pointed is not None:
        row = conn.execute(
            "SELECT id, status FROM tasks WHERE id = ?",
            (pointed,),
        ).fetchone()
        if row and row["status"] == STATUS_OPEN:
            return int(row["id"])
    row = conn.execute(
        """
        SELECT id FROM tasks
        WHERE status = ?
        ORDER BY id DESC
        LIMIT 1
        """,
        (STATUS_OPEN,),
    ).fetchone()
    return int(row["id"]) if row else None


def print_task(conn: sqlite3.Connection, task_id: int) -> None:
    task = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    if not task:
        print(f"task {task_id} not found", file=sys.stderr)
        return
    chunks = conn.execute(
        """
        SELECT id, seq, title, status, completed_at
        FROM chunks WHERE task_id = ?
        ORDER BY seq
        """,
        (task_id,),
    ).fetchall()
    done_n = sum(1 for c in chunks if c["status"] == CHUNK_DONE)
    print(
        f"task#{task['id']} [{task['status']}] {task['title']}"
        f"  ({done_n}/{len(chunks)} chunks done)"
    )
    for c in chunks:
        mark = {
            CHUNK_DONE: "✓",
            CHUNK_IN_PROGRESS: "→",
            CHUNK_PENDING: "·",
            CHUNK_SKIPPED: "-",
        }.get(c["status"], "?")
        print(f"  {mark} chunk#{c['id']} seq={c['seq']} [{c['status']}] {c['title']}")


def cmd_status(_args: argparse.Namespace) -> int:
    conn = ensure_db()
    tid = fetch_open_task_id(conn)
    if tid is None:
        print("无进行中的分块任务。")
        return 0
    print_task(conn, tid)
    nxt = next_chunk_row(conn, tid)
    if nxt:
        print(
            f"\n当前应做: chunk#{nxt['id']} seq={nxt['seq']} 「{nxt['title']}」"
        )
    else:
        print("\n全部块已处理 → 可结束总任务。")
    return 0


def next_chunk_row(conn: sqlite3.Connection, task_id: int) -> sqlite3.Row | None:
    row = conn.execute(
        """
        SELECT * FROM chunks
        WHERE task_id = ? AND status = ?
        ORDER BY seq LIMIT 1
        """,
        (task_id, CHUNK_IN_PROGRESS),
    ).fetchone()
    if row:
        return row
    return conn.execute(
        """
        SELECT * FROM chunks
        WHERE task_id = ? AND status = ?
        ORDER BY seq LIMIT 1
        """,
        (task_id, CHUNK_PENDING),
    ).fetchone()


def cmd_next(_args: argparse.Namespace) -> int:
    conn = ensure_db()
    tid = fetch_open_task_id(conn)
    if tid is None:
        print(json.dumps({"ok": True, "task_id": None, "chunk": None}))
        return 0
    task = conn.execute("SELECT * FROM tasks WHERE id = ?", (tid,)).fetchone()
    chunk = next_chunk_row(conn, tid)
    payload = {
        "ok": True,
        "task_id": tid,
        "task_title": task["title"] if task else None,
        "task_status": task["status"] if task else None,
        "chunk": None
        if chunk is None
        else {
            "id": int(chunk["id"]),
            "seq": int(chunk["seq"]),
            "title": chunk["title"],
            "status": chunk["status"],
            "detail": chunk["detail"],
        },
        "remaining": count_remaining(conn, tid),
    }
    print(json.dumps(payload, ensure_ascii=False))
    return 0


def count_remaining(conn: sqlite3.Connection, task_id: int) -> int:
    row = conn.execute(
        """
        SELECT COUNT(*) AS n FROM chunks
        WHERE task_id = ? AND status IN (?, ?)
        """,
        (task_id, CHUNK_PENDING, CHUNK_IN_PROGRESS),
    ).fetchone()
    return int(row["n"]) if row else 0


def cmd_start(args: argparse.Namespace) -> int:
    conn = ensure_db()
    chunk_id = int(args.chunk_id)
    chunk = conn.execute("SELECT * FROM chunks WHERE id = ?", (chunk_id,)).fetchone()
    if not chunk:
        print(f"chunk {chunk_id} not found", file=sys.stderr)
        return 1
    task = conn.execute(
        "SELECT * FROM tasks WHERE id = ?", (int(chunk["task_id"]),)
    ).fetchone()
    if not task or task["status"] != STATUS_OPEN:
        print("所属任务不是 open，无法 start", file=sys.stderr)
        return 1
    now = utc_now()
    # 同任务其它 in_progress 退回 pending（只允许一块进行中）
    conn.execute(
        """
        UPDATE chunks SET status = ?, updated_at = ?
        WHERE task_id = ? AND status = ? AND id != ?
        """,
        (CHUNK_PENDING, now, int(chunk["task_id"]), CHUNK_IN_PROGRESS, chunk_id),
    )
    conn.execute(
        """
        UPDATE chunks SET status = ?, updated_at = ?
        WHERE id = ?
        """,
        (CHUNK_IN_PROGRESS, now, chunk_id),
    )
    conn.execute(
        "UPDATE tasks SET updated_at = ? WHERE id = ?",
        (now, int(chunk["task_id"])),
    )
    conn.commit()
    write_active_pointer(int(chunk["task_id"]))
    print_task(conn, int(chunk["task_id"]))
    print(f"\nOK started chunk#{chunk_id}")
    return 0


def maybe_complete_task(conn: sqlite3.Connection, task_id: int) -> bool:
    left = count_remaining(conn, task_id)
    if left > 0:
        return False
    now = utc_now()
    conn.execute(
        """
        UPDATE tasks
        SET status = ?, updated_at = ?, completed_at = ?
        WHERE id = ?
        """,
        (STATUS_DONE, now, now, task_id),
    )
    conn.commit()
    pointed = read_active_pointer()
    if pointed == task_id:
        write_active_pointer(None)
    write_continue_flag(None)
    return True


def cmd_done(args: argparse.Namespace) -> int:
    conn = ensure_db()
    chunk_id = int(args.chunk_id)
    chunk = conn.execute("SELECT * FROM chunks WHERE id = ?", (chunk_id,)).fetchone()
    if not chunk:
        print(f"chunk {chunk_id} not found", file=sys.stderr)
        return 1
    if chunk["status"] == CHUNK_DONE:
        print(f"chunk#{chunk_id} 已是 done")
        print_task(conn, int(chunk["task_id"]))
        return 0

    now = utc_now()
    conn.execute(
        """
        UPDATE chunks
        SET status = ?, updated_at = ?, completed_at = ?
        WHERE id = ?
        """,
        (CHUNK_DONE, now, now, chunk_id),
    )
    conn.execute(
        "UPDATE tasks SET updated_at = ? WHERE id = ?",
        (now, int(chunk["task_id"])),
    )
    conn.commit()

    task_id = int(chunk["task_id"])
    # 自动把下一块标成 in_progress
    nxt = conn.execute(
        """
        SELECT id FROM chunks
        WHERE task_id = ? AND status = ?
        ORDER BY seq LIMIT 1
        """,
        (task_id, CHUNK_PENDING),
    ).fetchone()
    task = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    if nxt:
        conn.execute(
            """
            UPDATE chunks SET status = ?, updated_at = ?
            WHERE id = ?
            """,
            (CHUNK_IN_PROGRESS, now, int(nxt["id"])),
        )
        conn.commit()
        write_active_pointer(task_id)
        write_continue_flag(
            {
                "task_id": task_id,
                "task_title": task["title"] if task else "",
                "done_chunk_id": chunk_id,
                "next_chunk_id": int(nxt["id"]),
                "next_seq": int(
                    conn.execute(
                        "SELECT seq FROM chunks WHERE id = ?",
                        (int(nxt["id"]),),
                    ).fetchone()["seq"]
                ),
                "next_title": conn.execute(
                    "SELECT title FROM chunks WHERE id = ?",
                    (int(nxt["id"]),),
                ).fetchone()["title"],
                "remaining": count_remaining(conn, task_id),
                "updated_at": now,
            }
        )
        print_task(conn, task_id)
        print(f"\nOK done chunk#{chunk_id}; next → chunk#{int(nxt['id'])}")
        print(
            "stop 钩子会 followup 续跑下一块"
            "（可用 AGENT_TASK_CHUNKS_FOLLOWUP=0 关闭）。"
        )
        return 0

    finished = maybe_complete_task(conn, task_id)
    print_task(conn, task_id)
    if finished:
        print(f"\nOK done chunk#{chunk_id}; 全部块完成 → task#{task_id} 已标 done")
        print("可以写 ready / 功能备注并结束总任务。")
    else:
        print(f"\nOK done chunk#{chunk_id}")
    return 0


def cmd_cancel_task(args: argparse.Namespace) -> int:
    conn = ensure_db()
    task_id = int(args.task_id)
    task = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    if not task:
        print(f"task {task_id} not found", file=sys.stderr)
        return 1
    now = utc_now()
    conn.execute(
        """
        UPDATE tasks SET status = ?, updated_at = ?, completed_at = ?
        WHERE id = ?
        """,
        (STATUS_CANCELLED, now, now, task_id),
    )
    conn.execute(
        """
        UPDATE chunks SET status = ?, updated_at = ?
        WHERE task_id = ? AND status IN (?, ?)
        """,
        (CHUNK_SKIPPED, now, task_id, CHUNK_PENDING, CHUNK_IN_PROGRESS),
    )
    conn.commit()
    if read_active_pointer() == task_id:
        write_active_pointer(None)
    write_continue_flag(None)
    print_task(conn, task_id)
    print(f"\nOK cancelled task#{task_id}")
    return 0


def cmd_list(args: argparse.Namespace) -> int:
    conn = ensure_db()
    if args.all:
        rows = conn.execute(
            "SELECT * FROM tasks ORDER BY id DESC LIMIT 30"
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM tasks WHERE status = ? ORDER BY id DESC",
            (STATUS_OPEN,),
        ).fetchall()
    if not rows:
        print("（无）")
        return 0
    for t in rows:
        n = conn.execute(
            "SELECT COUNT(*) AS n FROM chunks WHERE task_id = ?",
            (int(t["id"]),),
        ).fetchone()
        done = conn.execute(
            """
            SELECT COUNT(*) AS n FROM chunks
            WHERE task_id = ? AND status = ?
            """,
            (int(t["id"]), CHUNK_DONE),
        ).fetchone()
        print(
            f"task#{t['id']} [{t['status']}] {t['title']}"
            f"  {int(done['n'])}/{int(n['n'])}"
        )
    return 0


def cmd_session_summary(_args: argparse.Namespace) -> int:
    """给 sessionStart / stop 钩子用的一行摘要（JSON）。"""
    conn = ensure_db()
    tid = fetch_open_task_id(conn)
    if tid is None:
        print(json.dumps({"has_open": False}))
        return 0
    task = conn.execute("SELECT * FROM tasks WHERE id = ?", (tid,)).fetchone()
    chunk = next_chunk_row(conn, tid)
    remaining = count_remaining(conn, tid)
    print(
        json.dumps(
            {
                "has_open": True,
                "task_id": tid,
                "task_title": task["title"] if task else "",
                "remaining": remaining,
                "chunk": None
                if chunk is None
                else {
                    "id": int(chunk["id"]),
                    "seq": int(chunk["seq"]),
                    "title": chunk["title"],
                    "status": chunk["status"],
                },
                "all_done": chunk is None and remaining == 0,
            },
            ensure_ascii=False,
        )
    )
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Agent 功能分块进度（SQLite）")
    sub = p.add_subparsers(dest="cmd", required=True)

    c = sub.add_parser("create", help="新建分块任务")
    c.add_argument("--title", required=True)
    c.add_argument(
        "--chunks",
        required=True,
        help="用 | 或换行分隔的块标题，至少 2 块",
    )
    c.add_argument("--conversation-id", default="")
    c.add_argument("--notes", default="")
    c.set_defaults(func=cmd_create)

    s = sub.add_parser("status", help="打印当前 open 任务")
    s.set_defaults(func=cmd_status)

    n = sub.add_parser("next", help="JSON：下一块")
    n.set_defaults(func=cmd_next)

    st = sub.add_parser("start", help="把某块标为进行中")
    st.add_argument("chunk_id")
    st.set_defaults(func=cmd_start)

    d = sub.add_parser("done", help="标记一块已处理")
    d.add_argument("chunk_id")
    d.set_defaults(func=cmd_done)

    ct = sub.add_parser("cancel-task", help="取消整任务")
    ct.add_argument("task_id")
    ct.set_defaults(func=cmd_cancel_task)

    ls = sub.add_parser("list", help="列出任务")
    ls.add_argument("--all", action="store_true")
    ls.set_defaults(func=cmd_list)

    ss = sub.add_parser("session-summary", help="钩子用 JSON 摘要")
    ss.set_defaults(func=cmd_session_summary)

    return p


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
