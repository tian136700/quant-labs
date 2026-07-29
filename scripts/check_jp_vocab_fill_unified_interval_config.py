#!/usr/bin/env python3
"""回归：维护中心可配置日语统一补全间隔（1～30 分钟档）。"""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from maintenance_center import jp_vocab_fill_interval as mod  # noqa: E402


def main() -> int:
    errors: list[str] = []

    if 60 not in mod.ALLOWED_INTERVALS:
        errors.append("ALLOWED_INTERVALS 须含 60（1 分钟）")
    if mod.DEFAULT_INTERVAL != 180:
        errors.append("DEFAULT_INTERVAL 须为 180")
    if mod.format_interval_label(180) != "3 分钟":
        errors.append("format_interval_label(180) 文案不对")

    index = (ROOT / "scripts/maintenance_center/static/index.html").read_text(
        encoding="utf-8"
    )
    app_js = (ROOT / "scripts/maintenance_center/static/app.js").read_text(
        encoding="utf-8"
    )
    server = (ROOT / "scripts/maintenance_center/server.py").read_text(encoding="utf-8")
    if 'id="jp-fill-interval"' not in index:
        errors.append("index.html 缺运行间隔下拉")
    if "saveJpFillInterval" not in app_js:
        errors.append("app.js 缺 saveJpFillInterval")
    if 'path == "/api/jp-vocab-fill/interval"' not in server:
        errors.append("server.py 缺 POST /api/jp-vocab-fill/interval")
    if 'path == "/api/jp-vocab-fill/pause"' not in server:
        errors.append("server.py 缺 POST /api/jp-vocab-fill/pause")
    if 'path == "/api/jp-vocab-fill/resume"' not in server:
        errors.append("server.py 缺 POST /api/jp-vocab-fill/resume")
    if 'id="jp-fill-pause"' not in index:
        errors.append("index.html 缺暂停按钮")
    if 'id="jp-fill-resume"' not in index:
        errors.append("index.html 缺继续按钮")
    if "postJpFillPauseOrResume" not in app_js:
        errors.append("app.js 缺 postJpFillPauseOrResume")

    # 不碰本机真实 launchd：临时 plist + mock reload
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        plist = tmp_path / "com.infoquests.jp-vocab-fill-unified.plist"
        env_file = tmp_path / "jp-vocab-fill.env"
        pause_path = tmp_path / "jp-vocab-fill-unified-PAUSE.switch"
        # 最小合法 plist
        import plistlib

        with plist.open("wb") as fh:
            plistlib.dump(
                {
                    "Label": mod.LABEL,
                    "StartInterval": 180,
                    "ThrottleInterval": 180,
                    "ProgramArguments": ["/bin/true"],
                },
                fh,
            )

        with (
            mock.patch.object(mod, "PLIST_PATH", plist),
            mock.patch.object(mod, "ENV_FILE", env_file),
            mock.patch.object(mod, "PAUSE_PATH", pause_path),
            mock.patch.object(mod, "_is_launchd_loaded", return_value=False),
            mock.patch.object(mod, "_reload_launchd", return_value="loaded") as reload_mock,
            mock.patch.object(mod, "_bootout_agent"),
            mock.patch.object(mod, "_wait_unloaded", return_value=True),
        ):
            try:
                mod.set_unified_interval(30)
                errors.append("应拒绝非白名单间隔 30")
            except ValueError:
                pass
            result = mod.set_unified_interval(60)
            if not result.get("ok") or result.get("interval_seconds") != 60:
                errors.append(f"set_unified_interval(60) 失败: {result}")
            with plist.open("rb") as fh:
                data = plistlib.load(fh)
            if data.get("StartInterval") != 60 or data.get("ThrottleInterval") != 60:
                errors.append(f"plist 未写成 60: {data}")
            if not env_file.is_file() or "JP_VOCAB_FILL_UNIFIED_INTERVAL_SECONDS=60" not in env_file.read_text(
                encoding="utf-8"
            ):
                errors.append("未写入 env 间隔")

            paused = mod.pause_unified()
            if not paused.get("ok") or not paused.get("paused"):
                errors.append(f"pause_unified 失败: {paused}")
            if not pause_path.is_file():
                errors.append("pause 未写 PAUSE switch")
            reload_mock.reset_mock()
            while_paused = mod.set_unified_interval(120)
            if while_paused.get("reload") != "paused_skip_reload":
                errors.append(
                    f"暂停时应跳过 reload，得到: {while_paused.get('reload')}"
                )
            if reload_mock.called:
                errors.append("暂停时改间隔不应调用 _reload_launchd")
            resumed = mod.resume_unified()
            if not resumed.get("ok") or resumed.get("paused"):
                errors.append(f"resume_unified 失败: {resumed}")
            if pause_path.is_file():
                errors.append("resume 未清除 PAUSE switch")

    src = (ROOT / "scripts/maintenance_center/jp_vocab_fill_interval.py").read_text(
        encoding="utf-8"
    )
    if 'bootout", domain, str(PLIST_PATH)' not in src and "bootout\", domain, str(PLIST_PATH)" not in src:
        # allow either quote style
        if '["bootout", domain, str(PLIST_PATH)]' not in src:
            errors.append("须用 bootout domain+plist 路径（避免 Bootstrap Error 5）")
    if "_wait_unloaded" not in src:
        errors.append("须等待 unload 完成再 bootstrap")
    if "paused_skip_reload" not in src:
        errors.append("暂停时改间隔须 paused_skip_reload")
    stage = (ROOT / "scripts/jp-vocab-fill-unified-stage.sh").read_text(encoding="utf-8")
    if "jp-vocab-fill-unified-PAUSE.switch" not in stage:
        errors.append("stage.sh 须检查手动暂停开关")

    if errors:
        for e in errors:
            print(f"FAIL: {e}", file=sys.stderr)
        return 1
    print("[check_jp_vocab_fill_unified_interval_config] OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
