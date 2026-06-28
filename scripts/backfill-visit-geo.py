#!/usr/bin/env python3
"""回填 visit_logs 的 geo_region / geo_city（针对尚无省市数据的 IP）。"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB = "strategy-compare-db"


def run_wrangler(remote: bool, sql: str) -> list:
    cmd = ["npx", "wrangler", "d1", "execute", DB, "--command", sql, "-y"]
    if remote:
        cmd.append("--remote")
    else:
        cmd.append("--local")
    proc = subprocess.run(cmd, cwd=ROOT, text=True, capture_output=True)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or proc.stdout.strip() or "wrangler failed")
    text = proc.stdout.strip()
    start = text.find("[")
    if start >= 0:
        return json.loads(text[start:])
    return []


def sql_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def column_exists(remote: bool, table: str, column: str) -> bool:
    rows = run_wrangler(remote, f"PRAGMA table_info({table});")
    if isinstance(rows, list) and rows:
        for r in rows[0].get("results") or []:
            if str(r.get("name")) == column:
                return True
    return False


def fetch_ips_without_geo(remote: bool, country: str | None) -> list[str]:
    where = (
        "(geo_region IS NULL AND geo_region_code IS NULL AND geo_city IS NULL)"
    )
    if country:
        where += f" AND country_code = {sql_literal(country.upper())}"
    rows = run_wrangler(
        remote,
        f"SELECT DISTINCT ip FROM visit_logs WHERE {where} ORDER BY ip;",
    )
    ips: list[str] = []
    if isinstance(rows, list) and rows:
        for item in rows[0].get("results") or []:
            ip = str(item.get("ip") or "").strip()
            if ip:
                ips.append(ip)
    return ips


def lookup_ip(ip: str) -> tuple[str | None, str | None]:
    url = (
        "http://ip-api.com/json/"
        f"{urllib.parse.quote(ip, safe=':')}"
        "?lang=zh-CN&fields=status,regionName,city,message"
    )
    req = urllib.request.Request(url, headers={"User-Agent": "strategy-compare-cloud/backfill"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    if data.get("status") != "success":
        raise RuntimeError(data.get("message") or "lookup failed")
    region = str(data.get("regionName") or "").strip() or None
    city = str(data.get("city") or "").strip() or None
    return region, city


def backfill_ip(remote: bool, ip: str, region: str | None, city: str | None) -> int:
    sets: list[str] = []
    if region:
        sets.append(f"geo_region = {sql_literal(region)}")
    if city:
        sets.append(f"geo_city = {sql_literal(city)}")
    if not sets:
        return 0
    sql = (
        f"UPDATE visit_logs SET {', '.join(sets)} "
        f"WHERE ip = {sql_literal(ip)} "
        "AND geo_region IS NULL AND geo_region_code IS NULL AND geo_city IS NULL;"
    )
    run_wrangler(remote, sql)
    count_rows = run_wrangler(
        remote,
        f"SELECT COUNT(*) AS cnt FROM visit_logs WHERE ip = {sql_literal(ip)} "
        f"AND ({' OR '.join([s.split(' = ')[0] + ' IS NOT NULL' for s in sets])});",
    )
    if isinstance(count_rows, list) and count_rows:
        return int((count_rows[0].get("results") or [{}])[0].get("cnt") or 0)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="回填 visit_logs 省/市字段")
    parser.add_argument("--remote", action="store_true")
    parser.add_argument("--local", action="store_true")
    parser.add_argument(
        "--country",
        default="CN",
        help="仅处理指定国家代码（默认 CN；传 * 表示全部国家）",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="只查询 IP 与地理信息，不写数据库",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=1.5,
        help="每次 IP 查询间隔秒数（ip-api 免费额度约 45 次/分钟）",
    )
    args = parser.parse_args()
    if args.remote == args.local:
        print("请指定 --remote 或 --local", file=sys.stderr)
        return 1

    remote = args.remote
    label = "remote" if remote else "local"
    country = None if args.country.strip() == "*" else args.country.strip().upper()
    print(f"[backfill-visit-geo] target={label} country={country or '*'}", flush=True)

    for col in ("geo_region", "geo_region_code", "geo_city"):
        if not column_exists(remote, "visit_logs", col):
            print(
                f"[backfill-visit-geo] 缺少列 {col}，请先执行 geo 迁移 SQL",
                file=sys.stderr,
            )
            return 1

    ips = fetch_ips_without_geo(remote, country)
    print(f"[backfill-visit-geo] distinct IPs to process: {len(ips)}", flush=True)
    if not ips:
        return 0

    updated_rows = 0
    for idx, ip in enumerate(ips, start=1):
        try:
            region, city = lookup_ip(ip)
        except (urllib.error.URLError, RuntimeError, TimeoutError, json.JSONDecodeError) as err:
            print(f"[{idx}/{len(ips)}] {ip} lookup failed: {err}", flush=True)
            continue

        label_text = " ".join(x for x in [region, city] if x) or "(empty)"
        print(f"[{idx}/{len(ips)}] {ip} -> {label_text}", flush=True)

        if args.dry_run:
            if idx < len(ips):
                time.sleep(args.delay)
            continue

        try:
            updated_rows += backfill_ip(remote, ip, region, city)
        except RuntimeError as err:
            print(f"[{idx}/{len(ips)}] {ip} update failed: {err}", flush=True)

        if idx < len(ips):
            time.sleep(args.delay)

    if not args.dry_run:
        print(f"[backfill-visit-geo] done, rows with geo now: {updated_rows}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
