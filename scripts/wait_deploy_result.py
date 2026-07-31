#!/usr/bin/env python3
"""等待维护中心最近一次部署结束；失败则打印日志并 exit 1。

供 Cursor stop followup / Agent 自动修发布失败：
  python3 scripts/wait_deploy_result.py
  python3 scripts/wait_deploy_result.py --since-id 753 --timeout 600

成功 exit 0；失败 exit 1（并把完整日志写到
`.cursor/hooks/.state/last_deploy_failure.txt`）。
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STATE_DIR = ROOT / ".cursor" / "hooks" / ".state"
FAILURE_FILE = STATE_DIR / "last_deploy_failure.txt"
PENDING_FILE = STATE_DIR / "pending_deploy_followup.json"
BASE = "http://127.0.0.1:17823"


def _get_json(path: str, timeout: float = 8.0) -> dict:
    req = urllib.request.Request(f"{BASE}{path}", method="GET")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read().decode("utf-8", errors="replace")
    return json.loads(raw) if raw else {}


def _latest_rows(limit: int = 5) -> list[dict]:
    data = _get_json(f"/api/deploy-logs?limit={limit}")
    rows = data.get("rows") or []
    return rows if isinstance(rows, list) else []


def _get_log(log_id: int) -> dict | None:
    data = _get_json(f"/api/deploy-logs/{int(log_id)}")
    if not data.get("ok"):
        return None
    row = data.get("row")
    return row if isinstance(row, dict) else None


def _manual_snapshot() -> dict:
    try:
        data = _get_json("/api/auto-status")
    except Exception:
        return {}
    manual = data.get("manual")
    return manual if isinstance(manual, dict) else {}


def _pick_target(since_id: int | None) -> dict | None:
    rows = _latest_rows(8)
    if not rows:
        return None
    if since_id is not None:
        candidates = [r for r in rows if int(r.get("id") or 0) >= since_id]
        if candidates:
            return max(candidates, key=lambda r: int(r.get("id") or 0))
    return rows[0]


def _is_terminal(status: str) -> bool:
    return status in {"success", "error", "failed", "cancelled"}


def main() -> int:
    parser = argparse.ArgumentParser(description="Wait for maintenance-center deploy result")
    parser.add_argument("--timeout", type=int, default=600, help="seconds (default 600)")
    parser.add_argument(
        "--since-id",
        type=int,
        default=None,
        help="only consider deploy logs with id >= this",
    )
    parser.add_argument(
        "--poll",
        type=float,
        default=5.0,
        help="poll interval seconds (default 5)",
    )
    args = parser.parse_args()

    STATE_DIR.mkdir(parents=True, exist_ok=True)
    deadline = time.time() + max(30, args.timeout)
    last_status = ""
    target_id: int | None = args.since_id

    print(
        f"[wait-deploy] 等待维护中心部署结果（timeout={args.timeout}s"
        + (f", since-id>={args.since_id}" if args.since_id is not None else "")
        + "）…",
        flush=True,
    )

    while time.time() < deadline:
        try:
            manual = _manual_snapshot()
            m_status = str(manual.get("status") or "")
            row = _pick_target(target_id if target_id is not None else args.since_id)
            if row:
                rid = int(row.get("id") or 0)
                if target_id is None or rid > (target_id or 0):
                    # 锁定我们关心的那次（最新或 >= since-id）
                    if args.since_id is None or rid >= args.since_id:
                        target_id = rid
                status = str(row.get("status") or "")
                if status != last_status:
                    print(
                        f"[wait-deploy] log#{rid} status={status}"
                        + (f" exit={row.get('exit_code')}" if row.get("exit_code") is not None else ""),
                        flush=True,
                    )
                    last_status = status
                if _is_terminal(status) and (args.since_id is None or rid >= args.since_id):
                    full = _get_log(rid) or row
                    details = str(full.get("details") or "")
                    summary = str(full.get("summary") or full.get("message") or "")
                    exit_code = full.get("exit_code")
                    if status == "success" or exit_code == 0:
                        print(f"[wait-deploy] 部署成功 log#{rid}", flush=True)
                        if FAILURE_FILE.is_file():
                            FAILURE_FILE.unlink(missing_ok=True)
                        if PENDING_FILE.is_file():
                            PENDING_FILE.unlink(missing_ok=True)
                        return 0
                    # failure
                    tail = details[-8000:] if details else summary
                    payload = (
                        f"deploy_log_id={rid}\n"
                        f"status={status}\n"
                        f"exit_code={exit_code}\n"
                        f"summary={summary}\n"
                        f"started_at={full.get('started_at')}\n"
                        f"finished_at={full.get('finished_at')}\n"
                        f"--- details ---\n{tail}\n"
                    )
                    FAILURE_FILE.write_text(payload, encoding="utf-8")
                    print("[wait-deploy] 部署失败。日志已写入：", flush=True)
                    print(f"  {FAILURE_FILE}", flush=True)
                    print("--- 失败摘要（末尾）---", flush=True)
                    print(tail[-3500:], flush=True)
                    return 1

            # 若列表还没有新行，但 manual 显示 running，继续等
            if m_status == "running":
                time.sleep(args.poll)
                continue
        except urllib.error.URLError as exc:
            print(f"[wait-deploy] 维护中心不可达: {exc}", file=sys.stderr)
            time.sleep(args.poll)
            continue
        except Exception as exc:
            print(f"[wait-deploy] 轮询异常: {exc}", file=sys.stderr)
            time.sleep(args.poll)
            continue

        time.sleep(args.poll)

    print("[wait-deploy] 超时仍未拿到终态", file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
