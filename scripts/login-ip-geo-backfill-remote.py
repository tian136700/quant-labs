#!/usr/bin/env python3
"""直接回填线上 D1：登录唯一 IP → ip9 归属地（同一 IP 只查一次，默认间隔 30s）。

不依赖 Worker 新接口；写 etr_ip_geo_cache，历史弹窗读缓存即可展示区县。
用法：
  python3 scripts/login-ip-geo-backfill-remote.py --status
  python3 scripts/login-ip-geo-backfill-remote.py --once
  python3 scripts/login-ip-geo-backfill-remote.py --loop   # 直到 pending=0
  python3 scripts/login-ip-geo-backfill-remote.py --requeue --loop
"""

from __future__ import annotations

import argparse
import json
import ssl
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB = "strategy-compare-db"
IP9_URL = "https://ip9.com.cn/get"
DEFAULT_INTERVAL_SEC = 30
NEGATIVE_CACHE_SEC = 6 * 60 * 60
UA = "strategy-compare-cloud/login-ip-geo-backfill-remote"


def build_ssl_context() -> ssl.SSLContext | None:
    cafile = __import__("os").environ.get("SSL_CERT_FILE", "").strip()
    capath = __import__("os").environ.get("SSL_CERT_DIR", "").strip()
    if cafile or capath:
        return ssl.create_default_context(cafile=cafile or None, capath=capath or None)
    try:
        import certifi  # type: ignore

        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        return None


_SSL_CONTEXT = build_ssl_context()


def sql_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def run_wrangler(sql: str) -> list:
    cmd = [
        "npx",
        "wrangler",
        "d1",
        "execute",
        DB,
        "--remote",
        "--command",
        sql,
        "-y",
    ]
    proc = subprocess.run(cmd, cwd=ROOT, text=True, capture_output=True)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or proc.stdout.strip() or "wrangler failed")
    text = proc.stdout.strip()
    start = text.find("[")
    if start < 0:
        return []
    return json.loads(text[start:])


def results_of(payload: list) -> list[dict]:
    if not payload:
        return []
    first = payload[0] if isinstance(payload[0], dict) else {}
    return list(first.get("results") or [])


def ensure_cache_table() -> None:
    run_wrangler(
        """
CREATE TABLE IF NOT EXISTS etr_ip_geo_cache (
  ip            TEXT NOT NULL PRIMARY KEY,
  country       TEXT,
  country_code  TEXT,
  prov          TEXT,
  city          TEXT,
  area          TEXT,
  isp           TEXT,
  ok            INTEGER NOT NULL DEFAULT 1,
  fetched_at    TEXT NOT NULL
);
""".strip()
    )


def list_distinct_login_ips() -> list[str]:
    rows = results_of(
        run_wrangler(
            """
SELECT ip FROM (
  SELECT DISTINCT TRIM(login_ip) AS ip FROM etr_user_login_history
  WHERE login_ip IS NOT NULL AND TRIM(login_ip) != ''
  UNION
  SELECT DISTINCT TRIM(last_login_ip) AS ip FROM etr_users
  WHERE last_login_ip IS NOT NULL AND TRIM(last_login_ip) != ''
) ORDER BY ip;
""".strip()
        )
    )
    out: list[str] = []
    seen: set[str] = set()
    for row in rows:
        ip = str(row.get("ip") or "").strip()
        if ip and ip not in seen:
            seen.add(ip)
            out.append(ip)
    return out


def list_cached_ok_ips() -> set[str]:
    rows = results_of(
        run_wrangler(
            "SELECT ip FROM etr_ip_geo_cache WHERE ok = 1;"
        )
    )
    return {str(r.get("ip") or "").strip() for r in rows if str(r.get("ip") or "").strip()}


def list_recent_failed_ips() -> set[str]:
    rows = results_of(
        run_wrangler(
            "SELECT ip, fetched_at FROM etr_ip_geo_cache WHERE ok = 0;"
        )
    )
    out: set[str] = set()
    now = time.time()
    for row in rows:
        ip = str(row.get("ip") or "").strip()
        fetched = str(row.get("fetched_at") or "").strip()
        if not ip or not fetched:
            continue
        try:
            # accept ISO with Z
            ts = datetime.fromisoformat(fetched.replace("Z", "+00:00")).timestamp()
        except ValueError:
            continue
        if now - ts < NEGATIVE_CACHE_SEC:
            out.add(ip)
    return out


def pending_ips() -> list[str]:
    all_ips = list_distinct_login_ips()
    done = list_cached_ok_ips()
    failed_recent = list_recent_failed_ips()
    return [ip for ip in all_ips if ip not in done and ip not in failed_recent]


def fetch_ip9(ip: str) -> dict | None:
    url = f"{IP9_URL}?ip={urllib.parse.quote(ip, safe=':')}"
    req = urllib.request.Request(
        url,
        headers={"User-Agent": UA, "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(
            req, timeout=20, context=_SSL_CONTEXT
        ) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        print(f"  ip9 HTTP {err.code} for {ip}", flush=True)
        return None
    except Exception as err:  # noqa: BLE001
        print(f"  ip9 error for {ip}: {err}", flush=True)
        return None
    if data.get("ret") != 200 or not isinstance(data.get("data"), dict):
        return None
    return data["data"]


def upsert_cache(ip: str, geo: dict | None) -> None:
    now = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
    if not geo:
        sql = f"""
INSERT INTO etr_ip_geo_cache
  (ip, country, country_code, prov, city, area, isp, ok, fetched_at)
VALUES (
  {sql_literal(ip)}, NULL, NULL, NULL, NULL, NULL, NULL, 0, {sql_literal(now)}
)
ON CONFLICT(ip) DO UPDATE SET
  ok = 0,
  fetched_at = excluded.fetched_at;
""".strip()
        run_wrangler(sql)
        return

    def lit(key: str) -> str:
        return sql_literal(str(geo.get(key) or "").strip())

    sql = f"""
INSERT INTO etr_ip_geo_cache
  (ip, country, country_code, prov, city, area, isp, ok, fetched_at)
VALUES (
  {sql_literal(ip)}, {lit("country")}, {sql_literal(str(geo.get("country_code") or "").strip().lower())},
  {lit("prov")}, {lit("city")}, {lit("area")}, {lit("isp")}, 1, {sql_literal(now)}
)
ON CONFLICT(ip) DO UPDATE SET
  country = excluded.country,
  country_code = excluded.country_code,
  prov = excluded.prov,
  city = excluded.city,
  area = excluded.area,
  isp = excluded.isp,
  ok = excluded.ok,
  fetched_at = excluded.fetched_at;
""".strip()
    run_wrangler(sql)


def format_label(geo: dict) -> str:
    parts: list[str] = []
    for key in ("prov", "city", "area"):
        val = str(geo.get(key) or "").strip()
        if val and val not in parts:
            parts.append(val)
    if not parts:
        country = str(geo.get("country") or "").strip()
        return country or "—"
    return " ".join(parts)


def requeue() -> int:
    ips = list_distinct_login_ips()
    if not ips:
        print("requeue: no login IPs", flush=True)
        return 0
    # chunk delete
    cleared = 0
    chunk = 40
    for i in range(0, len(ips), chunk):
        part = ips[i : i + chunk]
        placeholders = ", ".join(sql_literal(ip) for ip in part)
        run_wrangler(f"DELETE FROM etr_ip_geo_cache WHERE ip IN ({placeholders});")
        cleared += len(part)
    print(f"requeue: cleared cache for {cleared} login IPs", flush=True)
    return cleared


def print_status() -> list[str]:
    ensure_cache_table()
    all_ips = list_distinct_login_ips()
    done = list_cached_ok_ips()
    failed_recent = list_recent_failed_ips()
    pending = [ip for ip in all_ips if ip not in done and ip not in failed_recent]
    print(
        f"total_unique={len(all_ips)} done={len(done)} pending={len(pending)} "
        f"failed_recent={len(failed_recent)}",
        flush=True,
    )
    if pending:
        sample = ", ".join(pending[:5])
        more = "" if len(pending) <= 5 else f" …(+{len(pending) - 5})"
        print(f"pending_sample: {sample}{more}", flush=True)
    return pending


def step_one(pending: list[str] | None = None) -> bool:
    """Return True if an IP was processed."""
    ensure_cache_table()
    queue = pending if pending is not None else pending_ips()
    if not queue:
        print("idle: no pending IPs", flush=True)
        return False
    ip = queue[0]
    print(f"lookup ip={ip}", flush=True)
    geo = fetch_ip9(ip)
    upsert_cache(ip, geo)
    if geo:
        print(
            f"  ok region={format_label(geo)} area={geo.get('area') or '—'} isp={geo.get('isp') or '—'}",
            flush=True,
        )
        print(f"apply updated=1 ip={ip}", flush=True)
    else:
        print("  failed (negative cache)", flush=True)
        print(f"apply updated=0 ip={ip}", flush=True)
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description="Remote D1 login IP geo backfill via ip9")
    parser.add_argument("--status", action="store_true")
    parser.add_argument("--once", action="store_true", help="Process one pending IP")
    parser.add_argument("--loop", action="store_true", help="Process until pending=0")
    parser.add_argument("--requeue", action="store_true", help="Clear cache for login IPs first")
    parser.add_argument(
        "--interval",
        type=float,
        default=DEFAULT_INTERVAL_SEC,
        help="Seconds between ip9 requests (default 30)",
    )
    args = parser.parse_args()

    if args.requeue:
        ensure_cache_table()
        requeue()

    if args.status and not args.once and not args.loop:
        print_status()
        return 0

    if args.once:
        step_one()
        print_status()
        return 0

    if args.loop or args.requeue:
        first = True
        while True:
            pending = print_status()
            if not pending:
                print("done: all unique login IPs cached", flush=True)
                return 0
            if not first:
                print(f"sleep {args.interval}s …", flush=True)
                time.sleep(args.interval)
            first = False
            step_one(pending)
        return 0

    parser.print_help()
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
