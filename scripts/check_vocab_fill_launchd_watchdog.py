#!/usr/bin/env python3
"""回归：英语/日语补全 launchd 被卸掉须看门狗自愈 + Bark，禁止静默停几天。"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    errors: list[str] = []

    wd = (ROOT / "scripts/lib/vocab_fill_launchd_watchdog.py").read_text(
        encoding="utf-8"
    )
    if "WATCH_TARGETS" not in wd:
        errors.append("watchdog 须声明 WATCH_TARGETS")
    if "com.infoquests.en-vocab-fill" not in wd:
        errors.append("watchdog 须盯英语整词补全")
    if "com.infoquests.jp-vocab-fill-unified" not in wd:
        errors.append("watchdog 须盯日语统一补全")
    if "en-vocab-fill-PAUSE.switch" not in wd:
        errors.append("须尊重英语手动暂停开关")
    if "jp-vocab-fill-unified-PAUSE.switch" not in wd:
        errors.append("须尊重日语手动暂停开关")
    if "vocab-fill-KILL.switch" not in wd:
        errors.append("熔断中禁止自动挂回")
    if "run_watchdog" not in wd or "_bootstrap_agent" not in wd:
        errors.append("须有 run_watchdog / _bootstrap_agent")
    if "补全定时异常" not in wd:
        errors.append("自愈/发现须 Bark「补全定时异常」")

    jstage = (ROOT / "scripts/jp-vocab-fill-unified-stage.sh").read_text(
        encoding="utf-8"
    )
    estage = (ROOT / "scripts/en-vocab-fill-stage.sh").read_text(encoding="utf-8")
    for name, text in (
        ("jp-vocab-fill-unified-stage.sh", jstage),
        ("en-vocab-fill-stage.sh", estage),
    ):
        if "vocab_fill_launchd_watchdog.py" not in text:
            errors.append(f"{name} 须调用 launchd watchdog")
        # 须在 quiz gate 之前（抽查中也要能发现姐妹任务被卸）
        wi = text.find("vocab_fill_launchd_watchdog.py")
        qi = text.find("vocab_fill_assert_quiz_gate_ok")
        if wi < 0 or qi < 0 or wi > qi:
            errors.append(f"{name}：watchdog 须在 quiz gate 之前")

    en_feed = (
        ROOT / "scripts/maintenance_center/en_vocab_fill_feed.py"
    ).read_text(encoding="utf-8")
    if "vocab_fill_launchd_watchdog" not in en_feed:
        errors.append("en_vocab_fill_feed 轮询须顺带跑 watchdog")

    for rel in (
        "scripts/maintenance_center/en_vocab_fill_interval.py",
        "scripts/maintenance_center/jp_vocab_fill_interval.py",
    ):
        text = (ROOT / rel).read_text(encoding="utf-8")
        if "_notify_bootstrap_failed" not in text:
            errors.append(f"{rel} 改间隔 bootstrap 失败须 Bark")
        if "reloaded_by_watchdog" not in text:
            errors.append(f"{rel} bootstrap 失败后须再试 watchdog")

    rule = ROOT / ".cursor/rules/vocab-fill-launchd-watchdog.mdc"
    if not rule.is_file():
        errors.append("缺规则 vocab-fill-launchd-watchdog.mdc")
    else:
        rt = rule.read_text(encoding="utf-8")
        if "裸 bootout" not in rt and "bootout" not in rt:
            errors.append("规则须禁止裸 bootout 不挂回")
        if "PAUSE" not in rt:
            errors.append("规则须区分手动暂停 vs 事故卸载")

    # 运行时：当前应已加载（本机开发机）
    sys.path.insert(0, str(ROOT / "scripts" / "lib"))
    from vocab_fill_launchd_watchdog import run_watchdog  # noqa: WPS433

    snap = run_watchdog(dry_run=True, quiet=True, auto_heal=False)
    for row in snap.get("results") or []:
        if row.get("action") == "no_plist":
            continue
        if row.get("action") not in {
            "loaded",
            "skip_paused",
            "skip_killed",
        }:
            # dry_run 下 unloaded 只报警不失败（CI/无 LaunchAgent 环境）
            if row.get("action") == "unloaded":
                print(
                    f"WARN: {row.get('label')} currently unloaded "
                    f"(dry-run; heal not asserted here)"
                )

    if errors:
        print("check_vocab_fill_launchd_watchdog: FAIL")
        for e in errors:
            print(f"  - {e}")
        return 1
    print("check_vocab_fill_launchd_watchdog: OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
