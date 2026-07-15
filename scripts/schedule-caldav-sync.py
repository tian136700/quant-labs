#!/usr/bin/env python3
"""把统一日程同步到网易邮箱 CalDAV（iPhone 已绑定该日历即可看到）。

公开服务器：https://caldav.163.com/ （个人 163/126/yeah.net，端口 443）
邮箱地址与客户端授权码从 ~/.config/info-quests/schedule-caldav.env 读取。
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

UID_DOMAIN = "info-quests.schedule"
DEFAULT_API_URL = (
    "https://finance.info-quests.com/api/admin/schedule-events"
)
DEFAULT_CALDAV_URL = "https://caldav.163.com/"
BEIJING = timezone(timedelta(hours=8))
HTTP_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)


def load_env_file(name: str) -> dict[str, str]:
    cfg_path = Path.home() / ".config" / "info-quests" / name
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


def resolve_token(review_cfg: dict[str, str]) -> str:
    return (
        os.environ.get("JP_REVIEW_UPLOAD_TOKEN")
        or review_cfg.get("JP_REVIEW_UPLOAD_TOKEN", "")
    ).strip()


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
        with urllib.request.urlopen(request, timeout=120, context=_SSL_CONTEXT) as response:
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


def build_vevent(event: dict[str, Any]) -> str:
    from icalendar import Calendar, Event, vText

    start = parse_beijing(str(event["class_at"]))
    duration = int(event.get("duration_minutes") or 60)
    end = start + timedelta(minutes=duration)
    uid = str(event["uid"]).strip()
    summary = str(event.get("summary") or "日程").strip() or "日程"
    description = str(event.get("description") or "").strip()

    cal = Calendar()
    cal.add("prodid", "-//info-quests//schedule-caldav//CN")
    cal.add("version", "2.0")
    cal.add("calscale", "GREGORIAN")

    vevent = Event()
    vevent.add("uid", uid)
    vevent.add("summary", summary)
    if description:
        vevent.add("description", description)
    vevent.add("dtstart", start)
    vevent.add("dtend", end)
    vevent.add("dtstamp", datetime.now(tz=timezone.utc))
    vevent.add("categories", vText("info-quests-schedule"))
    vevent.add("transp", "OPAQUE")
    cal.add_component(vevent)
    return cal.to_ical().decode("utf-8")


def is_ours(uid: str | None) -> bool:
    if not uid:
        return False
    return uid.strip().endswith(f"@{UID_DOMAIN}")


def pick_calendar(calendars: list[Any], preferred_name: str) -> Any:
    if not calendars:
        raise SystemExit("CalDAV: 账号下没有可用日历")
    name = preferred_name.strip()
    if name:
        for calendar in calendars:
            display = str(getattr(calendar, "name", "") or "").strip()
            if display == name:
                return calendar
        names = ", ".join(
            str(getattr(c, "name", "") or "(unnamed)") for c in calendars
        )
        raise SystemExit(
            f"CalDAV: 未找到名为「{name}」的日历。可用: {names}"
        )
    return calendars[0]


def existing_our_events(calendar: Any) -> dict[str, Any]:
    found: dict[str, Any] = {}
    try:
        items = calendar.events()
    except Exception:
        items = []
    for item in items:
        try:
            ical = item.icalendar_instance
            for component in ical.walk():
                if component.name != "VEVENT":
                    continue
                uid = str(component.get("uid") or "").strip()
                if is_ours(uid):
                    found[uid] = item
        except Exception:
            continue
    return found


def sync_to_caldav(
    *,
    url: str,
    email: str,
    password: str,
    calendar_name: str,
    events: list[dict[str, Any]],
    dry_run: bool,
) -> dict[str, int]:
    try:
        import caldav
    except ImportError as err:
        raise SystemExit(
            "缺少 caldav 依赖。请先运行: bash scripts/setup-schedule-caldav-mac.sh"
        ) from err

    desired = {
        str(event["uid"]).strip(): event
        for event in events
        if str(event.get("uid") or "").strip()
    }

    if dry_run:
        print(f"dry-run: would sync {len(desired)} events to {url} as {email}")
        for uid, event in sorted(desired.items(), key=lambda x: x[1].get("class_at", "")):
            print(
                f"  {event.get('class_at')}  {event.get('summary')}  ({uid})"
            )
        return {"upserted": 0, "deleted": 0, "kept": len(desired)}

    client = caldav.DAVClient(url=url, username=email, password=password)
    principal = client.principal()
    calendar = pick_calendar(principal.calendars(), calendar_name)
    remote = existing_our_events(calendar)

    upserted = 0
    deleted = 0

    # 网易 CalDAV 对 PATCH 支持不稳定：有则先删再写，保证更新落地
    for uid, event in desired.items():
        ical_text = build_vevent(event)
        existing = remote.pop(uid, None)
        if existing is not None:
            try:
                existing.delete()
            except Exception as err:
                print(f"warning: delete before upsert failed for {uid}: {err}", file=sys.stderr)
        calendar.save_event(ical_text)
        upserted += 1

    for uid, existing in remote.items():
        try:
            existing.delete()
            deleted += 1
        except Exception as err:
            print(f"warning: delete orphan failed for {uid}: {err}", file=sys.stderr)

    return {"upserted": upserted, "deleted": deleted, "kept": len(desired)}


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync schedule to NetEase CalDAV")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="只拉取并打印，不写入网易日历",
    )
    args = parser.parse_args()

    review_cfg = load_env_file("jp-review-sync.env")
    cfg = load_env_file("schedule-caldav.env")

    token = resolve_token(review_cfg)
    if not token:
        print(
            "缺少 JP_REVIEW_UPLOAD_TOKEN（写在 ~/.config/info-quests/jp-review-sync.env）",
            file=sys.stderr,
        )
        return 1

    api_url = (
        os.environ.get("SCHEDULE_EVENTS_API_URL")
        or cfg.get("SCHEDULE_EVENTS_API_URL")
        or DEFAULT_API_URL
    ).strip()
    caldav_url = (
        os.environ.get("SCHEDULE_CALDAV_URL")
        or cfg.get("SCHEDULE_CALDAV_URL")
        or DEFAULT_CALDAV_URL
    ).strip()
    email = (
        os.environ.get("SCHEDULE_CALDAV_EMAIL") or cfg.get("SCHEDULE_CALDAV_EMAIL") or ""
    ).strip()
    password = (
        os.environ.get("SCHEDULE_CALDAV_PASSWORD")
        or cfg.get("SCHEDULE_CALDAV_PASSWORD")
        or ""
    ).strip()
    calendar_name = (
        os.environ.get("SCHEDULE_CALDAV_CALENDAR_NAME")
        or cfg.get("SCHEDULE_CALDAV_CALENDAR_NAME")
        or ""
    ).strip()

    if not args.dry_run and (not email or not password):
        print(
            "请在 ~/.config/info-quests/schedule-caldav.env 填写 "
            "SCHEDULE_CALDAV_EMAIL 与 SCHEDULE_CALDAV_PASSWORD（授权码）",
            file=sys.stderr,
        )
        return 1

    print(f"fetching schedule events from {api_url} ...")
    events = fetch_schedule_events(api_url=api_url, token=token)
    print(f"got {len(events)} events")

    stats = sync_to_caldav(
        url=caldav_url,
        email=email or "(dry-run)",
        password=password or "(dry-run)",
        calendar_name=calendar_name,
        events=events,
        dry_run=args.dry_run,
    )
    print(
        f"done: upserted={stats['upserted']} deleted={stats['deleted']} "
        f"desired={stats['kept']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
