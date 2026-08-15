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
SCRIPTS = ROOT / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from lib.next_document_deploy_retry import (  # noqa: E402
    hub_transient_republish_max,
    is_deploy_transient_republish_failure,
)
from lib.maintenance_center_restart_interrupt import (  # noqa: E402
    external_auto_deploy_process_running,
    hub_restart_interrupt_is_details_only,
    is_maintenance_center_restart_interrupt,
)

STATE_DIR = ROOT / ".cursor" / "hooks" / ".state"
FAILURE_FILE = STATE_DIR / "last_deploy_failure.txt"
PENDING_FILE = STATE_DIR / "pending_deploy_followup.json"
BASE = "http://127.0.0.1:17823"
# 部署成功后探活：客户端靠此戳强制刷新；404 = 机制未上线
LIVE_VERSION_URL = "https://finance.info-quests.com/api/app-deploy-version"


def _get_json(path: str, timeout: float = 8.0) -> dict:
    req = urllib.request.Request(f"{BASE}{path}", method="GET")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read().decode("utf-8", errors="replace")
    return json.loads(raw) if raw else {}


def verify_app_deploy_version(*, attempts: int = 8, delay_sec: float = 5.0) -> bool:
    """确认线上 version API 可用；失败只告警不改部署 exit（构建已成功）。"""
    last_err = ""
    # CF 对默认 Python-urllib UA 会 403/1010；探活须伪装浏览器
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        "Accept": "application/json",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
    }
    for i in range(1, attempts + 1):
        try:
            req = urllib.request.Request(
                LIVE_VERSION_URL,
                method="GET",
                headers=headers,
            )
            with urllib.request.urlopen(req, timeout=12) as resp:
                raw = resp.read().decode("utf-8", errors="replace")
                status = getattr(resp, "status", 200)
            if status != 200:
                last_err = f"HTTP {status}"
            else:
                data = json.loads(raw) if raw else {}
                version = str(data.get("version") or "").strip()
                if data.get("ok") and version:
                    print(
                        f"[wait-deploy] app-deploy-version ok version={version}",
                        flush=True,
                    )
                    return True
                last_err = f"bad body: {raw[:200]}"
        except Exception as exc:
            last_err = str(exc)
        print(
            f"[wait-deploy] app-deploy-version 探活 {i}/{attempts} 未通过（{last_err}）",
            flush=True,
        )
        if i < attempts:
            time.sleep(delay_sec)
    print(
        f"[wait-deploy] 警告：线上 {LIVE_VERSION_URL} 仍不可用（{last_err}）；"
        "开着的标签页无法自动强制刷新",
        file=sys.stderr,
        flush=True,
    )
    return False


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


def _post_json(path: str, body: dict, timeout: float = 15.0) -> dict:
    raw_body = json.dumps(body, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        f"{BASE}{path}",
        data=raw_body,
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read().decode("utf-8", errors="replace")
    return json.loads(raw) if raw else {}


def _read_pending() -> dict | None:
    if not PENDING_FILE.is_file():
        return None
    try:
        data = json.loads(PENDING_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return data if isinstance(data, dict) else None


def _write_pending(data: dict) -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    PENDING_FILE.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def _try_auto_republish_transient(
    *,
    rid: int,
    details: str,
    summary: str,
) -> int | None:
    """瞬时失败（/_document / CF 5xx）自动再 POST publish；返回新的 since_id 继续等。"""
    blob = f"{summary}\n{details}"
    if not is_deploy_transient_republish_failure(blob):
        return None
    pending = _read_pending() or {}
    used = int(pending.get("transient_republish") or 0)
    max_n = hub_transient_republish_max()
    if used >= max_n:
        print(
            f"[wait-deploy] 瞬时失败已自动重发 {used}/{max_n} 次，不再重入队",
            flush=True,
        )
        return None
    remark = str(pending.get("remark") or summary or "自动重试部署").strip()
    if "（瞬时失败自动重试）" not in remark:
        remark = f"{remark}（瞬时失败自动重试）"
    try:
        result = _post_json(
            "/api/manual/publish",
            {"message": remark, "source": "auto"},
        )
    except Exception as exc:
        print(f"[wait-deploy] 自动重发 publish 失败: {exc}", file=sys.stderr, flush=True)
        return None
    if not result.get("ok") and result.get("status") not in {"queued", "running", "ok"}:
        # 维护中心有时 ok=true + queued；宽松认 queued/running
        if "queued" not in str(result).lower() and "running" not in str(result).lower():
            print(
                f"[wait-deploy] 自动重发被拒绝: {result}",
                file=sys.stderr,
                flush=True,
            )
            return None
    used += 1
    pending["transient_republish"] = used
    pending["phase"] = "waiting_after_transient_republish"
    pending["since_log_id"] = rid + 1
    pending["remark"] = remark
    pending["republished_at"] = time.strftime("%Y-%m-%dT%H:%M:%S+00:00", time.gmtime())
    _write_pending(pending)
    print(
        f"[wait-deploy] 识别为瞬时失败（/_document 或 CF API），"
        f"已自动重新入队部署 ({used}/{max_n})；继续等待 log>={rid + 1}…",
        flush=True,
    )
    return rid + 1


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
                        verify_app_deploy_version()
                        return 0
                    # 维护中心重启误标：git-auto-push 可能仍在跑，随后会 finish success
                    if is_maintenance_center_restart_interrupt(
                        summary
                    ) or is_maintenance_center_restart_interrupt(details):
                        if external_auto_deploy_process_running():
                            print(
                                f"[wait-deploy] log#{rid} 维护中心重启误标且外部部署仍在跑，"
                                "继续等待（勿当 Cloudflare 业务失败）…",
                                flush=True,
                            )
                            time.sleep(args.poll)
                            continue
                        if hub_restart_interrupt_is_details_only(details, summary):
                            # 短详情假失败：再观望几轮，避免抢在 success 覆写前落 failure
                            print(
                                f"[wait-deploy] log#{rid} 仅为维护中心本地重启误标，"
                                "暂不触发自动修，继续确认…",
                                flush=True,
                            )
                            time.sleep(args.poll)
                            continue
                    # failure
                    tail = details[-8000:] if details else summary
                    payload = (
                        f"deploy_log_id={rid}\n"
                        f"status={status}\n"
                        f"exit_code={exit_code}\n"
                        f"summary={summary}\n"
                        f"started_at={full.get('started_at')}\n"
                        f"finished_at={full.get('finished_at')}\n"
                        f"--- tip ---\n"
                        f"在 Cursor 原对话回一句（或停一轮）即可触发自动修 followup；"
                        f"不必从维护中心复制日志。\n"
                        f"--- details ---\n{tail}\n"
                    )
                    FAILURE_FILE.write_text(payload, encoding="utf-8")
                    next_since = _try_auto_republish_transient(
                        rid=rid,
                        details=details,
                        summary=summary,
                    )
                    if next_since is not None:
                        # 瞬时失败已重入队：清失败文件，继续等新一轮
                        FAILURE_FILE.unlink(missing_ok=True)
                        target_id = next_since
                        last_status = ""
                        time.sleep(args.poll)
                        continue
                    # 标 pending：下一轮任意 Agent stop 应立刻 followup 修（勿干等用户）
                    try:
                        if PENDING_FILE.is_file():
                            pending = json.loads(PENDING_FILE.read_text(encoding="utf-8"))
                            if isinstance(pending, dict):
                                pending["phase"] = "failed_awaiting_fix"
                                pending["failed_at"] = time.strftime("%Y-%m-%dT%H:%M:%S+00:00", time.gmtime())
                                pending["deploy_log_id"] = rid
                                PENDING_FILE.write_text(
                                    json.dumps(pending, ensure_ascii=False, indent=2) + "\n",
                                    encoding="utf-8",
                                )
                    except (OSError, json.JSONDecodeError, TypeError):
                        pass
                    print("[wait-deploy] 部署失败。日志已写入：", flush=True)
                    print(f"  {FAILURE_FILE}", flush=True)
                    print(
                        "[wait-deploy] 下一回合 Cursor Agent stop 会 followup 自动修；"
                        "若对话已停，请在该对话任意回一句以触发（或新开对话靠 sessionStart 提醒）。",
                        flush=True,
                    )
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
