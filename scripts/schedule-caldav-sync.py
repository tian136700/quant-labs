#!/usr/bin/env python3
"""把统一日程同步到网易邮箱 CalDAV（iPhone 已绑定该日历即可看到）。

个人邮箱公开路径（已验证）:
  https://caldav.163.com/caldav/dav/{email}/calendar/CALENDAR-DEFAULT-TASKS/
网易对库客户端常返回 Forbidden，本脚本用 urllib + Mac 日历 User-Agent 直接 REPORT/PUT/DELETE。
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import re
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

UID_DOMAIN = "info-quests.schedule"
DEFAULT_API_URL = (
    "https://finance.info-quests.com/api/admin/schedule-events"
)
DEFAULT_CALDAV_HOST = "https://caldav.163.com"
DEFAULT_CALENDAR_ID = "CALENDAR-DEFAULT-TASKS"
BEIJING = timezone(timedelta(hours=8))
HTTP_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)
CALDAV_USER_AGENT = "Mac OS X/CalendarAgent"


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


def ical_escape(text: str) -> str:
    return (
        text.replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\n", "\\n")
    )


def fold_ical_line(line: str) -> str:
    if len(line) <= 75:
        return line
    chunks = [line[:75]]
    rest = line[75:]
    while rest:
        chunks.append(" " + rest[:74])
        rest = rest[74:]
    return "\r\n".join(chunks)


def build_vevent(event: dict[str, Any]) -> bytes:
    start = parse_beijing(str(event["class_at"]))
    duration = int(event.get("duration_minutes") or 60)
    end = start + timedelta(minutes=duration)
    uid = str(event["uid"]).strip()
    summary = str(event.get("summary") or "日程").strip() or "日程"
    description = str(event.get("description") or "").strip()
    stamp = datetime.now(tz=timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    # 网易 CalDAV 常忽略 TZID、把本地墙上时间当 UTC，导致 UTC+7 手机整体偏 7 小时。
    # 网站日程是北京墙钟；这里写「浮动本地时间」（无 TZID / 无 Z），网易按原数字显示。
    start_s = start.strftime("%Y%m%dT%H%M%S")
    end_s = end.strftime("%Y%m%dT%H%M%S")

    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//info-quests//schedule-caldav//CN",
        "CALSCALE:GREGORIAN",
        "BEGIN:VEVENT",
        f"UID:{uid}",
        f"DTSTAMP:{stamp}",
        f"DTSTART:{start_s}",
        f"DTEND:{end_s}",
        fold_ical_line(f"SUMMARY:{ical_escape(summary)}"),
    ]
    if description:
        lines.append(fold_ical_line(f"DESCRIPTION:{ical_escape(description)}"))
    lines.extend(
        [
            "CATEGORIES:info-quests-schedule",
            "TRANSP:OPAQUE",
            "END:VEVENT",
            "END:VCALENDAR",
            "",
        ]
    )
    return "\r\n".join(lines).encode("utf-8")


def is_ours(uid: str | None) -> bool:
    if not uid:
        return False
    return uid.strip().endswith(f"@{UID_DOMAIN}")


def resolve_calendar_url(*, host: str, email: str, calendar_id: str) -> str:
    host = host.rstrip("/")
    if host.endswith("/calendar/") or "CALENDAR-" in host:
        return host if host.endswith("/") else host + "/"
    # 网易个人邮箱固定形态
    return f"{host}/caldav/dav/{email}/calendar/{calendar_id}/"


class NetEaseCalDav:
    def __init__(self, *, calendar_url: str, email: str, password: str):
        self.calendar_url = calendar_url if calendar_url.endswith("/") else calendar_url + "/"
        self.auth = base64.b64encode(f"{email}:{password}".encode("utf-8")).decode("ascii")

    def _request(
        self,
        method: str,
        url: str,
        *,
        body: bytes | None = None,
        content_type: str | None = None,
        depth: str | None = None,
    ) -> tuple[int, bytes]:
        headers = {
            "Authorization": f"Basic {self.auth}",
            "User-Agent": CALDAV_USER_AGENT,
        }
        if content_type:
            headers["Content-Type"] = content_type
        if depth is not None:
            headers["Depth"] = depth
        request = urllib.request.Request(url, data=body, method=method, headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=60, context=_SSL_CONTEXT) as response:
                return response.status, response.read()
        except urllib.error.HTTPError as err:
            payload = err.read()
            # DELETE 目标不存在时视为成功；其余 4xx/5xx 抛出
            if err.code == 404 and method == "DELETE":
                return err.code, payload
            raise SystemExit(
                f"CalDAV {method} {url} -> HTTP {err.code}: "
                f"{payload[:300].decode('utf-8', errors='replace')}"
            ) from err

    def list_our_events(self) -> dict[str, str]:
        """uid -> href (absolute or path)."""
        report = """<?xml version="1.0" encoding="utf-8" ?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:getetag/>
    <c:calendar-data/>
  </d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="VEVENT"/>
    </c:comp-filter>
  </c:filter>
</c:calendar-query>
""".encode("utf-8")
        status, payload = self._request(
            "REPORT",
            self.calendar_url,
            body=report,
            content_type="application/xml; charset=utf-8",
            depth="1",
        )
        if status not in (200, 207):
            raise SystemExit(f"CalDAV REPORT unexpected status {status}")

        text = payload.decode("utf-8", errors="replace")
        # 网易混用命名空间前缀，用宽松正则即可
        found: dict[str, str] = {}
        for href, data in re.findall(
            r"<A:href>(.*?)</A:href>.*?<c:calendar-data[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</c:calendar-data>",
            text,
            flags=re.S | re.I,
        ):
            uid_match = re.search(r"^UID:(.+)$", data, flags=re.M)
            if not uid_match:
                continue
            uid = uid_match.group(1).strip()
            if is_ours(uid):
                found[uid] = href.strip()
        # 兜底：ElementTree（若命名空间干净）
        if not found:
            try:
                root = ET.fromstring(payload)
                for response in root.iter():
                    if not response.tag.endswith("response"):
                        continue
                    href_el = None
                    data_el = None
                    for child in response.iter():
                        if child.tag.endswith("href") and href_el is None:
                            href_el = child
                        if child.tag.endswith("calendar-data"):
                            data_el = child
                    if href_el is None or data_el is None or not data_el.text:
                        continue
                    uid_match = re.search(r"^UID:(.+)$", data_el.text, flags=re.M)
                    if not uid_match:
                        continue
                    uid = uid_match.group(1).strip()
                    if is_ours(uid):
                        found[uid] = (href_el.text or "").strip()
            except ET.ParseError:
                pass
        return found

    def event_url(self, uid: str, href: str | None = None) -> str:
        if href:
            if href.startswith("http"):
                return href
            return urllib.parse.urljoin(DEFAULT_CALDAV_HOST, href)
        quoted = urllib.parse.quote(uid, safe="@")
        return f"{self.calendar_url}{quoted}.ics"

    def put_event(self, event: dict[str, Any], href: str | None = None) -> None:
        uid = str(event["uid"]).strip()
        url = self.event_url(uid, href)
        body = build_vevent(event)
        status, _ = self._request(
            "PUT",
            url,
            body=body,
            content_type="text/calendar; charset=utf-8",
        )
        if status not in (200, 201, 204):
            raise SystemExit(f"CalDAV PUT unexpected status {status} for {uid}")

    def delete_event(self, uid: str, href: str | None = None) -> None:
        url = self.event_url(uid, href)
        status, _ = self._request("DELETE", url)
        if status not in (200, 204, 404):
            raise SystemExit(f"CalDAV DELETE unexpected status {status} for {uid}")


def sync_to_caldav(
    *,
    host: str,
    email: str,
    password: str,
    calendar_id: str,
    events: list[dict[str, Any]],
    dry_run: bool,
) -> dict[str, int]:
    desired = {
        str(event["uid"]).strip(): event
        for event in events
        if str(event.get("uid") or "").strip()
    }
    calendar_url = resolve_calendar_url(host=host, email=email, calendar_id=calendar_id)

    if dry_run:
        print(f"dry-run: would sync {len(desired)} events to {calendar_url}")
        for uid, event in sorted(desired.items(), key=lambda x: x[1].get("class_at", "")):
            print(f"  {event.get('class_at')}  {event.get('summary')}  ({uid})")
        return {"upserted": 0, "deleted": 0, "kept": len(desired)}

    client = NetEaseCalDav(calendar_url=calendar_url, email=email, password=password)
    remote = client.list_our_events()
    print(f"remote our events: {len(remote)}")

    upserted = 0
    deleted = 0
    for uid, event in desired.items():
        href = remote.pop(uid, None)
        # 网易对覆盖 PUT 常回 412：先删再写
        if href is not None:
            try:
                client.delete_event(uid, href)
            except SystemExit as err:
                print(f"warning: {err}", file=sys.stderr)
        client.put_event(event, None)
        upserted += 1
        if upserted % 10 == 0:
            print(f"  upserted {upserted}/{len(desired)} ...")

    for uid, href in remote.items():
        try:
            client.delete_event(uid, href)
            deleted += 1
        except SystemExit as err:
            print(f"warning: {err}", file=sys.stderr)

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
    host = (
        os.environ.get("SCHEDULE_CALDAV_URL")
        or cfg.get("SCHEDULE_CALDAV_URL")
        or DEFAULT_CALDAV_HOST
    ).strip()
    # 兼容旧配置写成 https://caldav.163.com/
    if host.rstrip("/").endswith("caldav.163.com"):
        host = DEFAULT_CALDAV_HOST
    email = (
        os.environ.get("SCHEDULE_CALDAV_EMAIL") or cfg.get("SCHEDULE_CALDAV_EMAIL") or ""
    ).strip()
    password = (
        os.environ.get("SCHEDULE_CALDAV_PASSWORD")
        or cfg.get("SCHEDULE_CALDAV_PASSWORD")
        or ""
    ).strip()
    calendar_id = (
        os.environ.get("SCHEDULE_CALDAV_CALENDAR_ID")
        or cfg.get("SCHEDULE_CALDAV_CALENDAR_ID")
        or cfg.get("SCHEDULE_CALDAV_CALENDAR_NAME")
        or DEFAULT_CALENDAR_ID
    ).strip() or DEFAULT_CALENDAR_ID
    # 显示名「默认」映射到网易默认日历 ID
    if calendar_id in ("默认", "default", ""):
        calendar_id = DEFAULT_CALENDAR_ID

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
        host=host,
        email=email or "(dry-run)",
        password=password or "(dry-run)",
        calendar_id=calendar_id,
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
