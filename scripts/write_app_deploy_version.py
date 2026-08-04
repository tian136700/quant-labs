#!/usr/bin/env python3
"""Write src/lib/app-deploy-version.generated.ts before production build.

Each deploy gets a unique stamp (git SHA + unix time) baked into the Worker
bundle. Open tabs poll GET /api/app-deploy-version and hard-reload when the
server version differs from the page's baked-in stamp.
"""

from __future__ import annotations

import subprocess
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src" / "lib" / "app-deploy-version.generated.ts"


def _git_sha() -> str:
    try:
        out = subprocess.check_output(
            ["git", "rev-parse", "--short=12", "HEAD"],
            cwd=str(ROOT),
            text=True,
            stderr=subprocess.DEVNULL,
        )
        sha = (out or "").strip()
        if sha:
            return sha
    except (subprocess.CalledProcessError, FileNotFoundError, OSError):
        pass
    return "nogit"


def write_version(*, label: str | None = None) -> str:
    sha = _git_sha()
    ts = int(time.time())
    version = label or f"{sha}-{ts}"
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        "/** 由 scripts/write_app_deploy_version.py 自动生成；勿手改。 */\n"
        f'export const APP_DEPLOY_VERSION = "{version}";\n',
        encoding="utf-8",
    )
    print(f"[app-deploy-version] wrote {OUT.relative_to(ROOT)} = {version}", flush=True)
    return version


def main() -> int:
    write_version()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
