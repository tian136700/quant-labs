#!/usr/bin/env python3
"""统一日程：开课前 10/5/1 分钟 Bark 推送到 iPhone（各持续铃响一次）。

数据源与 ICS / 日程页相同：GET /api/admin/schedule-events
（Bearer = JP_REVIEW_UPLOAD_TOKEN）。

触发按北京时间课表；通知正文展示泰国时间（北京 − 1 小时）。
由 schedule-class-bark-remind.sh / launchd 每分钟调度。
"""

from __future__ import annotations

import argparse
import json
import os
import ssl
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
SCRIPTS = ROOT / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from maintenance_center.bark_notify import (  # noqa: E402
    format_class_remind_push,
    resolve_icon_url,
    send_bark_push,
)

DEFAULT_API_URL = "https://finance.info-quests.com/api/admin/schedule-events"
CONFIG_DIR = Path.home() / ".config" / "info-quests"
SENT_FILE = CONFIG_DIR / "schedule-class-bark-remind.sent.json"
BEIJING = timezone(timedelta(hours=8))
THAILAND = timezone(timedelta(hours=7))  # 通知展示用：北京墙钟 − 1 小时
DEFAULT_LEAD_MINUTES = (10, 5, 1)
HTTP_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)
# 已发送记录保留天数（过期清理，避免文件无限涨）
SENT_RETENTION_DAYS = 14


def load_env_file(name: str) -> dict[str, str]:
    cfg_path = CONFIG_DIR / name
    data: dict[str, str] = {}
    if not cfg_path.is_file():
        return data
    for line in cfg_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        data[key.strip()] = value.strip().strip('"').strip("'")
    return data


def load_system_bark_env() -> dict[str, str]:
    """本机共享：~/.config/bark/env（跨项目，勿进 Git）。"""
    path = Path.home() / ".config" / "bark" / "env"
    data: dict[str, str] = {}
    if not path.is_file():
        return data
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        data[key.strip()] = value.strip().strip('"').strip("'")
    return data


def load_repo_deploy_env() -> dict[str, str]:
    path = ROOT / ".env.deploy.local"
    data: dict[str, str] = {}
    if not path.is_file():
        return data
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        data[key.strip()] = value.strip().strip('"').strip("'")
    return data


def resolve_token(review_cfg: dict[str, str]) -> str:
    return (
        os.environ.get("JP_REVIEW_UPLOAD_TOKEN")
        or review_cfg.get("JP_REVIEW_UPLOAD_TOKEN", "")
    ).strip()


def ensure_bark_env(remind_cfg: dict[str, str], deploy_cfg: dict[str, str]) -> None:
    """把 Bark key 注入进程环境，供 bark_notify 读取。

    优先级：已有进程环境 > 本脚本专属 env > 项目 .env.deploy.local > ~/.config/bark/env
    """
    system_cfg = load_system_bark_env()
    for key in ("BARK_DEVICE_KEY", "BARK_PUSH_URL", "BARK_SERVER", "BARK_ENABLED"):
        if os.environ.get(key):
            continue
        value = (
            remind_cfg.get(key)
            or deploy_cfg.get(key)
            or system_cfg.get(key)
            or ""
        ).strip()
        if value:
            os.environ[key] = value


def build_ssl_context() -> ssl.SSLContext | None:
    cafile = os.environ.get("SSL_CERT_FILE", "").strip()
    capath = os.environ.get("SSL_CERT_DIR", "").strip()
    if cafile or capath:
        return ssl.create_default_context(cafile=cafile or None, capath=capath or None)
    try:
        import certifi  # type: ignore

        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        return None


_SSL_CONTEXT = build_ssl_context()


def fetch_schedule_events(*, api_url: str, token: str) -> list[dict[str, Any]]:
    request = urllib.request.Request(
        api_url,
        method="GET",
        headers={
            "Authorization": f"Bearer {token}",
            "User-Agent": HTTP_USER_AGENT,
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=60, context=_SSL_CONTEXT) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        body = err.read().decode("utf-8", errors="replace")
        raise SystemExit(f"schedule-events API HTTP {err.code}: {body}") from err

    if not payload.get("ok"):
        raise SystemExit(f"schedule-events API error: {payload.get('error')}")
    events = payload.get("events")
    if not isinstance(events, list):
        raise SystemExit("schedule-events API: missing events list")
    return events


def parse_beijing(class_at: str) -> datetime:
    text = class_at.strip().replace("T", " ")
    if len(text) == 16:
        text = f"{text}:00"
    dt = datetime.strptime(text, "%Y-%m-%d %H:%M:%S")
    return dt.replace(tzinfo=BEIJING)


def load_sent() -> dict[str, str]:
    if not SENT_FILE.is_file():
        return {}
    try:
        raw = json.loads(SENT_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    if not isinstance(raw, dict):
        return {}
    return {str(k): str(v) for k, v in raw.items() if k and v}


def save_sent(sent: dict[str, str]) -> None:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    SENT_FILE.write_text(
        json.dumps(sent, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def prune_sent(sent: dict[str, str], *, now: datetime) -> dict[str, str]:
    cutoff = now - timedelta(days=SENT_RETENTION_DAYS)
    out: dict[str, str] = {}
    for uid, ts in sent.items():
        try:
            sent_at = datetime.fromisoformat(ts)
            if sent_at.tzinfo is None:
                sent_at = sent_at.replace(tzinfo=BEIJING)
        except ValueError:
            continue
        if sent_at >= cutoff:
            out[uid] = ts
    return out


def format_class_time(start: datetime) -> str:
    return start.strftime("%m-%d %H:%M")


def beijing_to_thailand_display(beijing_start: datetime) -> datetime:
    """日程存北京墙钟；通知按泰国时间展示（同墙钟时刻 − 1 小时）。"""
    naive = beijing_start.replace(tzinfo=None) - timedelta(hours=1)
    return naive.replace(tzinfo=THAILAND)


def parse_lead_minutes(raw: str) -> list[int]:
    """支持 `10` 或 `10,5,1`；降序去重，至少保留一个。"""
    parts = [p.strip() for p in (raw or "").replace("，", ",").split(",") if p.strip()]
    leads: list[int] = []
    for part in parts:
        try:
            n = int(part)
        except ValueError:
            continue
        if n >= 1 and n not in leads:
            leads.append(n)
    if not leads:
        leads = list(DEFAULT_LEAD_MINUTES)
    return sorted(leads, reverse=True)


def sent_key(uid: str, lead: int) -> str:
    return f"{uid}#{lead}"


def maybe_remind(
    events: list[dict[str, Any]],
    *,
    lead_minutes: list[int],
    dry_run: bool,
    force_uid: str | None,
    force_lead: int | None,
) -> int:
    """按北京时间触发；每节课在 10/5/1 分钟窗口各持续铃响一次。"""
    now = datetime.now(tz=BEIJING)
    leads = sorted({max(1, int(x)) for x in lead_minutes}, reverse=True)
    sent = prune_sent(load_sent(), now=now)
    changed = False
    notified = 0

    upcoming: list[tuple[float, dict[str, Any], datetime]] = []
    for event in events:
        uid = str(event.get("uid") or "").strip()
        class_at = str(event.get("class_at") or "").strip()
        if not uid or not class_at:
            continue
        try:
            start = parse_beijing(class_at)
        except ValueError:
            continue
        seconds_until = (start - now).total_seconds()
        upcoming.append((seconds_until, event, start))

    upcoming.sort(key=lambda item: item[0])

    for seconds_until, event, start in upcoming:
        uid = str(event["uid"]).strip()
        summary = str(event.get("summary") or "上课").strip() or "上课"
        teachers = str(event.get("teachers") or "").strip()
        title_line = str(event.get("title") or "").strip()
        thai_start = beijing_to_thailand_display(start)
        bj_label = format_class_time(start)
        th_label = format_class_time(thai_start)

        for index, lead in enumerate(leads):
            next_lead = leads[index + 1] if index + 1 < len(leads) else 0
            lower = next_lead * 60
            upper = lead * 60
            # 例：lead=10 → (5min, 10min]；lead=5 → (1min, 5min]；lead=1 → (0, 1min]
            in_window = lower < seconds_until <= upper
            forced = (
                force_uid is not None
                and uid == force_uid
                and (force_lead is None or force_lead == lead)
            )
            if not in_window and not forced:
                continue
            key = sent_key(uid, lead)
            if key in sent and not forced:
                continue

            bark_title, body = format_class_remind_push(
                minutes_left=lead,
                summary=summary,
                thailand_class_at_label=th_label,
                beijing_class_at_label=bj_label,
                teachers=teachers,
                lesson_title=title_line,
            )

            print(
                f"{now.strftime('%F %T')} remind@{lead}m: {uid} "
                f"in {seconds_until/60:.1f}m → {summary}"
            )
            if dry_run:
                print(f"  dry-run bark title={bark_title!r}")
                print(f"  dry-run bark body={body!r}")
                notified += 1
                continue

            result = send_bark_push(
                title=bark_title,
                body=body,
                group="上课提醒",
                level="critical",
                call=True,
                icon=resolve_icon_url("class_remind"),
            )
            if result.get("skipped"):
                print("  bark skipped: not configured (BARK_DEVICE_KEY)")
                return notified
            if not result.get("ok"):
                print(f"  bark failed: {result.get('error')}", file=sys.stderr)
                raise SystemExit(1)
            print("  bark ok (critical+call)")
            if in_window:
                sent[key] = now.isoformat(timespec="seconds")
                changed = True
            notified += 1

    if changed and not dry_run:
        save_sent(sent)
    return notified


def main() -> int:
    parser = argparse.ArgumentParser(description="开课前 Bark 提醒（10/5/1 分钟 × 持续铃响）")
    parser.add_argument("--dry-run", action="store_true", help="只打印，不推送、不写已发记录")
    parser.add_argument(
        "--force-uid",
        default="",
        help="强制对指定 uid 推送（忽略时间窗与已发记录，仍受 --dry-run 约束）",
    )
    parser.add_argument(
        "--force-lead",
        type=int,
        default=0,
        help="配合 --force-uid：只推某一档（10/5/1）；0 表示该 uid 的每一档都推",
    )
    parser.add_argument(
        "--list-upcoming",
        type=int,
        default=0,
        metavar="N",
        help="列出未来 N 小时内的课（调试）",
    )
    args = parser.parse_args()

    review_cfg = load_env_file("jp-review-sync.env")
    remind_cfg = load_env_file("schedule-class-bark-remind.env")
    deploy_cfg = load_repo_deploy_env()
    ensure_bark_env(remind_cfg, deploy_cfg)

    token = resolve_token(review_cfg)
    if not token:
        print("缺少 JP_REVIEW_UPLOAD_TOKEN（见 ~/.config/info-quests/jp-review-sync.env）", file=sys.stderr)
        return 1

    api_url = (
        os.environ.get("SCHEDULE_CLASS_BARK_REMIND_URL")
        or remind_cfg.get("SCHEDULE_CLASS_BARK_REMIND_URL")
        or DEFAULT_API_URL
    ).strip()
    lead_raw = (
        os.environ.get("SCHEDULE_CLASS_BARK_LEAD_MINUTES")
        or remind_cfg.get("SCHEDULE_CLASS_BARK_LEAD_MINUTES")
        or "10,5,1"
    )
    lead_minutes = parse_lead_minutes(lead_raw)

    events = fetch_schedule_events(api_url=api_url, token=token)
    print(f"fetched {len(events)} schedule events from {api_url}")

    if args.list_upcoming > 0:
        now = datetime.now(tz=BEIJING)
        horizon = args.list_upcoming * 3600
        rows = []
        for event in events:
            try:
                start = parse_beijing(str(event.get("class_at") or ""))
            except ValueError:
                continue
            sec = (start - now).total_seconds()
            if 0 <= sec <= horizon:
                rows.append((sec, event, start))
        rows.sort(key=lambda x: x[0])
        for sec, event, start in rows:
            thai = beijing_to_thailand_display(start)
            print(
                f"  +{sec/60:6.1f}m  北京 {start.strftime('%F %H:%M')} / "
                f"泰国 {thai.strftime('%H:%M')}  "
                f"{event.get('summary')}  ({event.get('uid')})"
            )
        if not rows:
            print(f"  (未来 {args.list_upcoming} 小时内无课)")

    count = maybe_remind(
        events,
        lead_minutes=lead_minutes,
        dry_run=args.dry_run,
        force_uid=args.force_uid.strip() or None,
        force_lead=args.force_lead if args.force_lead > 0 else None,
    )
    print(f"notified={count} leads={lead_minutes} dry_run={args.dry_run}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
