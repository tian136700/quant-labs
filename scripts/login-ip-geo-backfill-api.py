#!/usr/bin/env python3
"""登录 IP 归属地回填（ip9.com.cn）：每次只处理 1 个唯一 IP。

同一 IP 只请求一次，写入 etr_ip_geo_cache；该 IP 的所有登录记录共享归属地。
由 login-ip-geo-backfill.sh / launchd 约每 30 秒调一次 step。

鉴权：Authorization: Bearer $JP_REVIEW_UPLOAD_TOKEN（与日语教案上传共用）。
"""

from __future__ import annotations

import argparse
import json
import os
import ssl
import sys
import urllib.error
import urllib.request
from pathlib import Path

DEFAULT_API_URL = (
    "https://finance.info-quests.com/api/admin/users/ip-geo/backfill"
)
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


def resolve_token(review_cfg: dict[str, str], local_cfg: dict[str, str]) -> str:
    return (
        os.environ.get("JP_REVIEW_UPLOAD_TOKEN")
        or local_cfg.get("JP_REVIEW_UPLOAD_TOKEN", "")
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


def call_api(*, api_url: str, token: str, mode: str, dry_run: bool) -> dict:
    payload = {"mode": mode, "dry_run": dry_run}
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        api_url,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": HTTP_USER_AGENT,
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=90, context=_SSL_CONTEXT) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        detail = err.read().decode("utf-8", errors="replace")
        raise SystemExit(f"API HTTP {err.code}: {detail}") from err


def print_status(payload: dict, prefix: str = "") -> None:
    print(
        f"{prefix}total_unique={payload.get('total_unique')} "
        f"done={payload.get('done_count')} "
        f"pending={payload.get('pending_count')} "
        f"failed_recent={payload.get('failed_recent_count')}",
        flush=True,
    )
    pending = payload.get("pending_ips") or []
    if pending:
        sample = ", ".join(pending[:5])
        more = "" if len(pending) <= 5 else f" …(+{len(pending) - 5})"
        print(f"{prefix}pending_sample: {sample}{more}", flush=True)


def main() -> int:
    review_cfg = load_env_file("jp-review-sync.env")
    cfg = load_env_file("login-ip-geo-backfill.env")
    parser = argparse.ArgumentParser(
        description="Backfill login IP geo via ip9 (one unique IP per call)."
    )
    parser.add_argument(
        "--api-url",
        default=cfg.get("LOGIN_IP_GEO_BACKFILL_URL", DEFAULT_API_URL),
    )
    parser.add_argument("--token", default=resolve_token(review_cfg, cfg))
    parser.add_argument(
        "--mode",
        choices=("status", "step", "requeue"),
        default="step",
        help="status=进度；step=处理 1 个 IP；requeue=清空登录 IP 缓存后整批重跑",
    )
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if not args.token:
        print(
            "请设置 Bearer Token（与日语教案上传共用）：\n"
            "  ~/.config/info-quests/jp-review-sync.env 中 JP_REVIEW_UPLOAD_TOKEN=...",
            file=sys.stderr,
        )
        return 1

    payload = call_api(
        api_url=args.api_url,
        token=args.token,
        mode=args.mode,
        dry_run=args.dry_run,
    )
    if not payload.get("ok"):
        raise SystemExit(f"API error: {payload.get('error', payload)}")

    mode = payload.get("mode") or args.mode
    print(f"[login-ip-geo-backfill] mode={mode} dry_run={bool(payload.get('dry_run'))}", flush=True)

    if mode == "requeue":
        print(
            f"  cleared={payload.get('cleared', payload.get('would_clear'))}",
            flush=True,
        )
        print_status(payload, prefix="  ")
        return 0

    if mode == "status":
        print_status(payload, prefix="  ")
        return 0

    # step
    if payload.get("idle") or (
        payload.get("pending_count") == 0 and not payload.get("ip")
    ):
        print("  idle: no pending IPs (all unique login IPs cached or empty)", flush=True)
        print_status(payload, prefix="  ")
        return 0

    ip = payload.get("ip") or payload.get("next_ip")
    print(f"  ip={ip}", flush=True)
    if not payload.get("dry_run"):
        print(
            f"  region={payload.get('region_label') or '—'} "
            f"area={payload.get('area') or '—'} "
            f"isp={payload.get('isp') or '—'} "
            f"geo_ok={payload.get('geo_ok')}",
            flush=True,
        )
    print_status(payload, prefix="  ")
    # 供维护中心从日志解析结果
    print(
        f"apply updated=1 ip={ip} pending={payload.get('pending_count')} "
        f"done={payload.get('done_count')}",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
