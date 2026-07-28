#!/usr/bin/env python3
"""Regression: Bark deploy body = 改动 → 项目 → 状态; no files / verify / 维护中心 tag."""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BARK = ROOT / "scripts" / "maintenance_center" / "bark_notify.py"
BARK_TS = ROOT / "src" / "lib" / "bark-push.ts"


def _fail(msg: str) -> int:
    print(f"[check_bark_deploy_notify_format] FAIL: {msg}", file=sys.stderr)
    return 1


def main() -> int:
    if not BARK.is_file():
        return _fail(f"missing {BARK}")
    text = BARK.read_text(encoding="utf-8")

    for name in ("format_deploy_success_push", "format_deploy_failure_push"):
        if f"def {name}" not in text:
            return _fail(f"{name} missing")

    # Order: 改动 first, then 项目, then 状态
    for fn in ("format_deploy_success_push", "format_deploy_failure_push"):
        m = re.search(rf"def {fn}\(.*?\n(    lines.*?return title)", text, re.DOTALL)
        if not m:
            return _fail(f"cannot parse body lines in {fn}")
        block = m.group(1)
        for needle in ('f"改动：', 'f"项目：', 'f"状态：'):
            if needle not in block:
                return _fail(f"{fn} missing {needle}")
        i_change = block.index('f"改动：')
        i_proj = block.index('f"项目：')
        i_status = block.index('f"状态：')
        if not (i_change < i_proj < i_status):
            return _fail(f"{fn} body order must be 改动 → 项目 → 状态")

    banned_literals = (
        'format_changed_files_line(',
        '"请到线上验证',
        "'请到线上验证",
        '"请到线上中心验证',
        '"维护中心：http://',
        "'维护中心：http://",
        'group: str = "维护中心"',
        'group = "维护中心"',
    )
    for b in banned_literals:
        if b in text:
            return _fail(f"forbidden remnant in bark_notify.py: {b!r}")

    if BARK_TS.is_file():
        ts = BARK_TS.read_text(encoding="utf-8")
        if 'group || "维护中心"' in ts or "|| '维护中心'" in ts:
            return _fail('bark-push.ts must not default group to "维护中心"')

    # Runtime smoke (local maintenance_center import)
    sys.path.insert(0, str(ROOT / "scripts"))
    from maintenance_center.bark_notify import (  # noqa: E402
        format_deploy_failure_push,
        format_deploy_success_push,
    )

    _, ok_body = format_deploy_success_push(
        mode="auto", message="发布完成", remark="自动发布：Bark 正文顺序调整"
    )
    ok_lines = ok_body.splitlines()
    if not (
        ok_lines[0].startswith("改动：")
        and ok_lines[1].startswith("项目：")
        and ok_lines[2].startswith("状态：")
    ):
        return _fail(f"success body order wrong: {ok_body!r}")
    if any(
        x in ok_body
        for x in ("文件：", "请到线上", "维护中心", "127.0.0.1:17823")
    ):
        return _fail(f"success body has banned text: {ok_body!r}")

    _, fail_body = format_deploy_failure_push(
        mode="manual",
        message="boom",
        exit_code=1,
        remark="手动发布：测试失败文案",
    )
    fail_lines = fail_body.splitlines()
    if not (
        fail_lines[0].startswith("改动：")
        and fail_lines[1].startswith("项目：")
        and fail_lines[2].startswith("状态：")
    ):
        return _fail(f"failure body order wrong: {fail_body!r}")
    if any(
        x in fail_body
        for x in ("文件：", "请到线上", "维护中心", "127.0.0.1:17823")
    ):
        return _fail(f"failure body has banned text: {fail_body!r}")

    # 失败须有提示音，且与成功铃声不同（勿再 passive 静音）
    fail_fn = re.search(
        r"def notify_deploy_failure\(.*?\n(?P<body>.*?)(?=\ndef |\Z)",
        text,
        re.DOTALL,
    )
    ok_fn = re.search(
        r"def notify_deploy_success\(.*?\n(?P<body>.*?)(?=\ndef |\Z)",
        text,
        re.DOTALL,
    )
    if not fail_fn or not ok_fn:
        return _fail("cannot parse notify_deploy_failure/success")
    fail_body_src = fail_fn.group("body")
    ok_body_src = ok_fn.group("body")
    if 'level="passive"' in fail_body_src:
        return _fail("notify_deploy_failure must not use level=passive (silent)")
    if "BARK_SOUND_DEPLOY_FAIL" not in fail_body_src:
        return _fail("notify_deploy_failure must read BARK_SOUND_DEPLOY_FAIL")
    if 'or "shake"' not in fail_body_src:
        return _fail('notify_deploy_failure default sound must be "shake"')
    if "BARK_SOUND_DEPLOY_OK" not in ok_body_src:
        return _fail("notify_deploy_success must read BARK_SOUND_DEPLOY_OK")
    if 'or "paymentsuccess"' not in ok_body_src:
        return _fail('notify_deploy_success default sound must be "paymentsuccess"')

    mac_path = ROOT / "scripts" / "maintenance_center" / "mac_notify.py"
    if mac_path.is_file():
        mac_text = mac_path.read_text(encoding="utf-8")
        # 电脑端失败可不改音；只强制手机 Bark 成败铃声不同
        if "def notify_mac_deploy_failure" not in mac_text:
            return _fail("notify_mac_deploy_failure missing")

    print("[check_bark_deploy_notify_format] OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
