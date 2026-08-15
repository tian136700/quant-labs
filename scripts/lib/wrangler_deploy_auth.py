#!/usr/bin/env python3
"""Wrangler 本机登录是否还能用于非交互部署（维护中心）。

access token 约 1 小时过期，toml 里仍有 oauth_token。过期后先探测 refresh：
能刷新则放行；refresh 400 才视为未登录。禁止把「文件里有 oauth_token」当成已登录
去烧 OpenNext，最后才报 CLOUDFLARE_API_TOKEN / non-interactive。
"""

from __future__ import annotations

import os
import re
import subprocess
from collections.abc import Callable
from datetime import datetime, timedelta, timezone
from pathlib import Path

_EXPIRATION_RE = re.compile(
    r"expiration_time\s*=\s*\"([^\"]+)\"",
    re.IGNORECASE,
)


def parse_wrangler_oauth_expiration(text: str) -> datetime | None:
    match = _EXPIRATION_RE.search(text or "")
    if not match:
        return None
    raw = match.group(1).strip()
    if not raw:
        return None
    if raw.endswith("Z"):
        raw = raw[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(raw)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def wrangler_oauth_config_usable(
    text: str,
    *,
    now: datetime | None = None,
    skew: timedelta | None = None,
) -> bool:
    """OAuth/api_token 配置现在能否给非交互 wrangler deploy 用。"""
    blob = text or ""
    if "oauth_token" not in blob and "api_token" not in blob:
        return False
    if "oauth_token" not in blob:
        return True
    expiry = parse_wrangler_oauth_expiration(blob)
    if expiry is None:
        # 无过期字段时让 wrangler 自己试刷新
        return True
    current = now or datetime.now(timezone.utc)
    if current.tzinfo is None:
        current = current.replace(tzinfo=timezone.utc)
    else:
        current = current.astimezone(timezone.utc)
    grace = skew if skew is not None else timedelta(minutes=2)
    return expiry > current + grace


def wrangler_oauth_expired_hint(text: str) -> str:
    expiry = parse_wrangler_oauth_expiration(text or "")
    when = expiry.isoformat() if expiry else "unknown"
    return (
        f"Wrangler 登录已过期且无法刷新（expiration_time={when}）。"
        "维护中心不能弹浏览器。请在本机交互终端执行：npx wrangler login；"
        "点「允许」时该命令必须仍在运行（localhost 回调端口要在听），"
        "不要刷新已经失败的 /oauth/callback 旧页。"
    )


def probe_wrangler_oauth_refresh(
    *,
    cwd: Path | None = None,
    timeout: float = 25.0,
) -> bool:
    """access token 过期时让 wrangler 用 refresh_token 续期。成功会写回 toml。"""
    env = os.environ.copy()
    env.pop("CI", None)
    try:
        proc = subprocess.run(
            ["npx", "wrangler", "whoami"],
            cwd=cwd,
            env=env,
            text=True,
            capture_output=True,
            timeout=timeout,
        )
    except (OSError, subprocess.TimeoutExpired):
        return False
    return proc.returncode == 0


def wrangler_oauth_config_paths() -> list[Path]:
    home = Path.home()
    return [
        home / ".wrangler" / "config" / "default.toml",
        home / ".config" / ".wrangler" / "config" / "default.toml",
        home / "Library" / "Preferences" / ".wrangler" / "config" / "default.toml",
    ]


def env_file_has_cloudflare_api_token(text: str) -> bool:
    """未注释的 CLOUDFLARE_API_TOKEN= 且有值。不返回 token 本身。"""
    for line in (text or "").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        key, sep, value = stripped.partition("=")
        if not sep or key.strip() != "CLOUDFLARE_API_TOKEN":
            continue
        token = value.strip().strip('"').strip("'")
        return bool(token)
    return False


def is_wrangler_noninteractive_auth_failure(output: str) -> bool:
    """缺 token / OAuth 过期：不是 CF 502，禁止当瞬时失败重发。"""
    text = output or ""
    lower = text.lower()
    if "non-interactive" in lower and "cloudflare_api_token" in lower:
        return True
    if "your auth token has expired" in lower or "could not be refreshed" in lower:
        return True
    if "not logged in" in lower and "wrangler login" in lower:
        return True
    return False


def local_deploy_auth_ready(
    *,
    env_token: str | None = None,
    env_file: Path | None = None,
    probe: Callable[[], bool] | None = None,
    probe_cwd: Path | None = None,
    config_paths: list[Path] | None = None,
) -> tuple[bool, str]:
    """本机能否非交互 wrangler deploy。第二项是来源或过期提示（无密钥）。"""
    token = (env_token if env_token is not None else os.environ.get("CLOUDFLARE_API_TOKEN", "")).strip()
    if token:
        return True, "CLOUDFLARE_API_TOKEN"
    if env_file is not None and env_file.is_file():
        try:
            blob = env_file.read_text(encoding="utf-8")
        except OSError:
            blob = ""
        if env_file_has_cloudflare_api_token(blob):
            return True, "CLOUDFLARE_API_TOKEN"
    expired_hint = ""
    expired_path: Path | None = None
    for path in config_paths if config_paths is not None else wrangler_oauth_config_paths():
        if not path.is_file():
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except OSError:
            continue
        if wrangler_oauth_config_usable(text):
            return True, f"wrangler login ({path})"
        if "oauth_token" in text:
            expired_hint = wrangler_oauth_expired_hint(text)
            expired_path = path
    if expired_hint:
        do_probe = probe if probe is not None else (
            lambda: probe_wrangler_oauth_refresh(cwd=probe_cwd)
        )
        if do_probe():
            return True, f"wrangler login refreshed ({expired_path})"
        return False, expired_hint
    return (
        False,
        "未配置部署凭据：复制 .env.deploy.local.example → .env.deploy.local 填入 "
        "CLOUDFLARE_API_TOKEN，或在本机执行 npx wrangler login",
    )
