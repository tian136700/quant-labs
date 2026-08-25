"""自动修：最后一次部署成功 → 以前的失败记录一律清掉。

产品约定（勿再改歪）：
- 维护中心里**最后一次已结束**的部署若是 success，说明当前代码已推上；
  此前所有 last_deploy_failure / pending / gave_up **必须静默清除**。
- 禁止拿更早的失败记录继续 followup「再修再发」——那是脑残设计。

用户症状：维护中心早已成功，Cursor 仍插「自动部署失败 / 已达 3 次上限」。
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any


def parse_deploy_failure_log_id(text: str) -> int | None:
    m = re.search(r"deploy_log_id=(\d+)", text or "")
    if not m:
        return None
    try:
        return int(m.group(1))
    except ValueError:
        return None


def deploy_row_is_success(row: dict[str, Any]) -> bool:
    status = str(row.get("status") or "").strip().lower()
    if status == "success":
        return True
    try:
        return int(row.get("exit_code")) == 0
    except (TypeError, ValueError):
        return False


def _row_id(row: dict[str, Any]) -> int:
    try:
        return int(row.get("id") or 0)
    except (TypeError, ValueError):
        return 0


def latest_finished_deploy_row(rows: list[Any]) -> dict[str, Any] | None:
    """按 id 最大取最后一次**已结束**部署（忽略 running / queued）。"""
    if not isinstance(rows, list):
        return None
    finished: list[dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        status = str(row.get("status") or "").strip().lower()
        if status in {"running", "queued", "pending", ""}:
            continue
        finished.append(row)
    if not finished:
        return None
    return max(finished, key=_row_id)


def should_clear_failure_after_latest_success(
    rows: list[Any],
    *,
    failure_log_id: int | None,
) -> bool:
    """最后一次已结束部署成功 → 清掉更早（或无 id）的失败残留。

    - 最新已结束 = success，且 failure_log_id 缺失或 < 该 success id → 清
    - 最新已结束仍是失败 → 不清（那是当前真失败）
    - 另：任意 id > failure_log_id 的 success 也清（兼容列表截断时仍能盖掉旧账）
    """
    if not isinstance(rows, list):
        return False

    latest = latest_finished_deploy_row(rows)
    if latest is not None and deploy_row_is_success(latest):
        latest_id = _row_id(latest)
        if latest_id > 0:
            if failure_log_id is None:
                return True
            if failure_log_id < latest_id:
                return True

    # 兜底：列表里任意比 failure 更新的 success（与「最后一次成功」同义于多数情况）
    return newer_deploy_success_exists(rows, failure_log_id=failure_log_id)


def newer_deploy_success_exists(
    rows: list[Any],
    *,
    failure_log_id: int | None,
) -> bool:
    """是否存在 id 大于 failure 的成功部署（或 failure 无 id 时任意 success）。"""
    if not isinstance(rows, list):
        return False
    for row in rows:
        if not isinstance(row, dict):
            continue
        if not deploy_row_is_success(row):
            continue
        rid = _row_id(row)
        if rid <= 0:
            continue
        if failure_log_id is None:
            return True
        if rid > failure_log_id:
            return True
    return False


def clear_deploy_autofix_state(
    *,
    failure_file: Path,
    pending_file: Path,
    gave_up_file: Path | None = None,
) -> None:
    """清掉失败跟随态：failure + pending + gave_up。"""
    failure_file.unlink(missing_ok=True)
    pending_file.unlink(missing_ok=True)
    if gave_up_file is not None:
        gave_up_file.unlink(missing_ok=True)


def should_skip_followup_for_gave_up(
    *,
    gave_up_file: Path,
    failure_log_id: int | None,
) -> bool:
    """同一 deploy_log_id 已达自动修上限后，禁止再对同一失败刷 followup。"""
    if failure_log_id is None or not gave_up_file.is_file():
        return False
    try:
        data = json.loads(gave_up_file.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError, TypeError):
        return False
    if not isinstance(data, dict):
        return False
    try:
        gave = int(data.get("deploy_log_id") or 0)
    except (TypeError, ValueError):
        return False
    return gave > 0 and gave == failure_log_id


def write_autofix_gave_up(
    *,
    gave_up_file: Path,
    failure_log_id: int | None,
    max_attempts: int,
) -> None:
    if failure_log_id is None:
        return
    gave_up_file.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "deploy_log_id": int(failure_log_id),
        "max_attempts": int(max_attempts),
        "reason": "autofix_max_attempts",
    }
    gave_up_file.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
