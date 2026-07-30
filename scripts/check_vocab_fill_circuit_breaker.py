#!/usr/bin/env python3
"""回归：同一词 3 次未搞定 → 熔断停掉全部 JP/EN fill launchd。"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    errors: list[str] = []
    br = (ROOT / "scripts/lib/vocab_fill_circuit_breaker.py").read_text(
        encoding="utf-8"
    )
    sh = (ROOT / "scripts/lib/vocab_fill_circuit_breaker.sh").read_text(
        encoding="utf-8"
    )
    grammar = (
        ROOT / "scripts/jp-vocab-fill-grammar-usage-examples-api.py"
    ).read_text(encoding="utf-8")
    gstage = (ROOT / "scripts/jp-vocab-fill-grammar-stage.sh").read_text(
        encoding="utf-8"
    )
    jstage = (ROOT / "scripts/jp-vocab-fill-stage.sh").read_text(encoding="utf-8")
    estage = (ROOT / "scripts/en-vocab-fill-stage.sh").read_text(encoding="utf-8")
    jread = (ROOT / "scripts/jp-vocab-fill-reading-nightly.sh").read_text(
        encoding="utf-8"
    )
    rule = (
        ROOT / ".cursor/rules/vocab-fill-circuit-breaker.mdc"
    ).read_text(encoding="utf-8")

    if "DEFAULT_MAX_ATTEMPTS = 3" not in br:
        errors.append("熔断默认须 3 次")
    if "bootout_all_fill_launchd" not in br:
        errors.append("须 bootout 全部 JP/EN fill launchd")
    if '"history"' not in br and "history" not in br:
        errors.append("须记录每次失败 history（第几次+原因）")
    if "format_attempt_report" not in br:
        errors.append("须有三次失败人读报告")
    if "KILL_REPORT_PATH" not in br:
        errors.append("须写 vocab-fill-KILL-report.txt")
    if "TASK_STATUS_LOG_PATH" not in br:
        errors.append("须有任务状态日志 vocab-fill-task-status.log")
    if "write_task_status_snapshot" not in br:
        errors.append("熔断须写任务状态快照（某某任务已暂停）")
    if "public_circuit_snapshot" not in br:
        errors.append("须有维护中心用 public_circuit_snapshot")
    mc = (ROOT / "scripts/maintenance_center/cron_tasks/circuit_breaker.py").read_text(
        encoding="utf-8"
    )
    if "circuit_breaker_snapshot" not in mc:
        errors.append("维护中心缺 circuit_breaker 包装")
    server = (ROOT / "scripts/maintenance_center/server.py").read_text(encoding="utf-8")
    if "/api/vocab-fill-circuit" not in server:
        errors.append("server 须暴露 /api/vocab-fill-circuit")
    html = (ROOT / "scripts/maintenance_center/static/index.html").read_text(
        encoding="utf-8"
    )
    if "vocab-fill-circuit-card" not in html:
        errors.append("维护中心 UI 须有熔断状态日志卡片")
    if 'id="vocab-fill-circuit-alert"' not in html:
        errors.append("词条补全页须有熔断红字提示 #vocab-fill-circuit-alert")
    if 'id="circuit-killed-banner"' not in html:
        errors.append("定时任务熔断卡须有 #circuit-killed-banner 红字条")
    appjs = (ROOT / "scripts/maintenance_center/static/app.js").read_text(encoding="utf-8")
    if "refreshCircuitBreaker" not in appjs:
        errors.append("app.js 须刷新熔断状态")
    if "renderVocabFillCircuitAlert" not in appjs:
        errors.append("app.js 须渲染词条补全熔断红字提示")
    if "熔断已停" not in appjs and "因熔断停机" not in appjs:
        errors.append("熔断时定时状态须写明「熔断已停」")
    if "buildCircuitDiagText" not in appjs or "copyCircuitDiag" not in appjs:
        errors.append("熔断须提供复制诊断信息（buildCircuitDiagText / copyCircuitDiag）")
    if 'id="vocab-fill-circuit-copy"' not in html:
        errors.append("词条补全熔断条须有「复制诊断信息」按钮")
    if 'id="circuit-killed-copy"' not in html:
        errors.append("定时任务熔断条须有「复制诊断信息」按钮")
    css = (ROOT / "scripts/maintenance_center/static/app.css").read_text(encoding="utf-8")
    if ".vocab-fill-circuit-alert" not in css:
        errors.append("app.css 须有熔断红字样式 .vocab-fill-circuit-alert")
    if "var(--err)" not in css or "vocab-fill-circuit-alert" not in css:
        errors.append("熔断提示须用 --err 红色")
    if "com.infoquests.jp-vocab-fill-grammar" not in br:
        errors.append("KILL 列表须含 jp-vocab-fill-grammar")
    if "com.infoquests.jp-vocab-fill-unified" not in br:
        errors.append("KILL 列表须含 jp-vocab-fill-unified（线上统一补全）")
    if "com.infoquests.jp-vocab-fill-pos-online" not in br:
        errors.append("KILL 列表须含 jp-vocab-fill-pos-online（临时词性）")
    if "com.infoquests.en-vocab-fill" not in br:
        errors.append("KILL 列表须含 en-vocab-fill")

    online = (ROOT / "scripts/jp-vocab-fill-online-batch-api.py").read_text(
        encoding="utf-8"
    )
    if "EXAMPLES_URL" not in online or 'done.append("example_sentences")' not in online:
        errors.append("线上统一补全须单独 apply 例句到 fill-example-sentences")
    if "examples_not_applied" not in online and "example_sentences" not in online:
        errors.append("线上统一补全须在例句未写回时 fixed=False")
    if 'fixed=True' in online and "example_sentences" in online:
        # 假成功清零：禁止仅凭 word_bundle/reading 就算 fixed
        if "examples_ok" not in online and "examples_not_applied" not in online:
            errors.append("线上统一补全禁止 reading/word_bundle 假成功清零熔断")
    if "vocab_fill_circuit_assert_not_killed" not in sh:
        errors.append("缺 bash 熔断门禁")
    if "after_attempt" not in grammar or "assert_not_killed" not in grammar:
        errors.append("语法付费脚本须接线 after_attempt / assert_not_killed")
    for name, text in (
        ("grammar-stage", gstage),
        ("jp-stage", jstage),
        ("en-stage", estage),
        ("jp-reading", jread),
    ):
        if "vocab_fill_circuit_assert_not_killed" not in text:
            errors.append(f"{name} 入口须检查 KILL 开关")
    if "3 次" not in rule and "三次" not in rule:
        errors.append("规则须写明 3 次熔断")
    if "vocab-fill-circuit-resume" not in rule:
        errors.append("规则须写恢复命令")
    if "原因" not in rule and "history" not in rule:
        errors.append("规则须写明记录每次失败原因")
    if "付费" not in rule and "Cloud" not in rule and "tokken" not in rule:
        errors.append("规则须写明适用于付费/Cloud 定时")

    hooks_json = (ROOT / ".cursor/hooks.json").read_text(encoding="utf-8")
    pre_hook = ROOT / ".cursor/hooks/remind-vocab-fill-circuit-breaker.py"
    after_hook = (
        ROOT / ".cursor/hooks/remind-vocab-fill-circuit-breaker-after-edit.py"
    )
    if not pre_hook.is_file():
        errors.append("缺前置钩子 remind-vocab-fill-circuit-breaker.py")
    elif "remind-vocab-fill-circuit-breaker.py" not in hooks_json:
        errors.append("hooks.json 须注册 preToolUse 熔断提醒钩子")
    if "preToolUse" not in hooks_json:
        errors.append("hooks.json 须有 preToolUse（付费三次熔断前置提醒）")
    if not after_hook.is_file():
        errors.append("缺 afterFileEdit 熔断提醒钩子")
    elif "remind-vocab-fill-circuit-breaker-after-edit.py" not in hooks_json:
        errors.append("hooks.json 须注册 afterFileEdit 熔断提醒钩子")
    if pre_hook.is_file():
        pre_src = pre_hook.read_text(encoding="utf-8")
        if "3 次" not in pre_src and "三次" not in pre_src:
            errors.append("前置钩子文案须写明 3 次熔断")
        if "after_attempt" not in pre_src:
            errors.append("前置钩子须点名 after_attempt")
        if "Bark" not in pre_src and "bark" not in pre_src:
            errors.append("前置钩子须写明熔断后 Bark 通知")
    if "_try_bark" not in br:
        errors.append("熔断须调用 _try_bark 推手机")
    if "补全熔断" not in br:
        errors.append("Bark 标题须含「补全熔断」")
    if 'level": "active"' not in br and "level=active" not in br:
        errors.append("熔断 Bark 须 level=active（勿 silent/critical）")

    if errors:
        print("check_vocab_fill_circuit_breaker: FAIL", file=sys.stderr)
        for e in errors:
            print(f"  - {e}", file=sys.stderr)
        return 1
    print("check_vocab_fill_circuit_breaker: OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
