#!/usr/bin/env python3
"""回归：用法/接续/例句/译文防复发钩子与门禁须接线。"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def main() -> int:
    hooks_json = ROOT / ".cursor/hooks.json"
    data = json.loads(hooks_json.read_text(encoding="utf-8"))
    hooks = data.get("hooks") or {}

    def commands(event: str) -> list[str]:
        return [h.get("command", "") for h in hooks.get(event, []) if isinstance(h, dict)]

    need = {
        "sessionStart": ".cursor/hooks/jp-vocab-content-quality-session.py",
        "preToolUse": ".cursor/hooks/remind-jp-vocab-content-quality.py",
        "afterFileEdit": ".cursor/hooks/remind-jp-vocab-content-quality-after-edit.py",
    }
    for event, cmd in need.items():
        if cmd not in commands(event):
            fail(f"hooks.json {event} 须含 {cmd}")

    for rel in need.values():
        p = ROOT / rel
        if not p.is_file():
            fail(f"missing hook script {rel}")
        if not p.stat().st_mode & 0o111:
            fail(f"hook not executable: {rel}")

    rule = ROOT / ".cursor/rules/jp-vocab-content-quality-guard.mdc"
    if not rule.is_file():
        fail("missing jp-vocab-content-quality-guard.mdc")
    rule_text = rule.read_text(encoding="utf-8")
    for needle in (
        "只改库不够",
        "bare_numbered_lines",
        "gloss_not_chinese",
        "gloss_has_yakuwen_label",
        "訳文",
        "usage_missing_level",
        "lemma_placeholder",
        "contrast_missing_distinction",
        "なに／なん",
        "no_plus_formula",
        "しかし",
        "usage_not_chinese",
        "用(も)",
    ):
        if needle not in rule_text:
            fail(f"rule missing {needle!r}")

    contrast = ROOT / "src/lib/jp-vocab-contrast-usage-ai.ts"
    if not contrast.is_file():
        fail("missing jp-vocab-contrast-usage-ai.ts")
    if "isJpVocabContrastGrammar" not in contrast.read_text(encoding="utf-8"):
        fail("contrast module 须含 isJpVocabContrastGrammar")

    # 核心门禁仍在源码里
    gloss = (ROOT / "src/lib/jp-vocab-example-sentences.ts").read_text(encoding="utf-8")
    if "訳文" not in gloss:
        fail("GLOSS_LABEL_RE 须剥 訳文")

    ai = (ROOT / "src/lib/jp-vocab-example-sentences-ai.ts").read_text(encoding="utf-8")
    if "gloss_has_yakuwen_label" not in ai:
        fail("apply 须拒 gloss_has_yakuwen_label")
    if "jpVocabGrammarLemmaAppearsInExamples" not in ai:
        fail("example-sentences-ai 须有假名核汉字表记 jpVocabGrammarLemmaAppearsInExamples")
    if "あたり" not in ai or "辺り" not in ai:
        fail("example-sentences-ai 假名核表记须含 あたり↔辺り")
    if "grammar_not_used" not in ai:
        fail("example-sentences-ai 须拒 grammar_not_used")

    conn = (ROOT / "src/lib/jp-vocab-connection-ai.ts").read_text(encoding="utf-8")
    if "bare_numbered_lines" not in conn:
        fail("connection 须拒 bare_numbered_lines")
    if "connection_has_usage" not in conn:
        fail("connection 须拒 connection_has_usage")
    if "no_plus_formula" not in conn:
        fail("connection 须拒 no_plus_formula（しかし等句首接续）")
    if "connectionHasFormulaShape" not in conn:
        fail("connection 须有 connectionHasFormulaShape")
    if "rewriteJpVocabConnectionPosToSimplifiedChinese" not in conn:
        fail("connection 须有词类简体/剥假名 rewrite")
    if "rejoinJpVocabConnectionMorphologySlashChunks" not in conn:
        fail("connection 须保护 动词原形／た形／ている形＋X 不被 strip 拆丢")
    if "CONNECTION_TABLE_NOTE_SEP_RE" not in conn:
        fail("connection 须支持｜说明列")

    slash_check = ROOT / "scripts/check_jp_vocab_connection_slash_morphology.py"
    if not slash_check.is_file():
        fail("missing check_jp_vocab_connection_slash_morphology.py")
    slash_run = subprocess.run(
        [sys.executable, str(slash_check)],
        capture_output=True,
        text=True,
        timeout=20,
        cwd=ROOT,
    )
    if slash_run.returncode != 0:
        fail(
            f"slash morphology check failed: {slash_run.stderr or slash_run.stdout}"
        )

    sent_conn = ROOT / "scripts/check_jp_vocab_connection_sentence_connector.py"
    if not sent_conn.is_file():
        fail("missing check_jp_vocab_connection_sentence_connector.py")
    sent_run = subprocess.run(
        [sys.executable, str(sent_conn)],
        capture_output=True,
        text=True,
        timeout=20,
        cwd=ROOT,
    )
    if sent_run.returncode != 0:
        fail(
            "sentence-connector check failed: "
            f"{sent_run.stderr or sent_run.stdout}"
        )

    usage_cn = ROOT / "scripts/check_jp_vocab_usage_not_chinese_guard.py"
    if not usage_cn.is_file():
        fail("missing check_jp_vocab_usage_not_chinese_guard.py")
    usage_run = subprocess.run(
        [sys.executable, str(usage_cn)],
        capture_output=True,
        text=True,
        timeout=20,
        cwd=ROOT,
    )
    if usage_run.returncode != 0:
        fail(
            "usage_not_chinese guard check failed: "
            f"{usage_run.stderr or usage_run.stdout}"
        )

    notes = (ROOT / "src/lib/jp-vocab-db/notes_fields.ts").read_text(encoding="utf-8")
    if "validateJpVocabExampleSentencesAiOutput" not in notes:
        fail("编辑写回须校验例句")
    if "validateJpVocabUsageAiOutput" not in notes:
        fail("编辑写回须校验用法")
    if "validateJpVocabConnectionAiOutput" not in notes:
        fail("编辑写回须校验接序")

    # smoke: preToolUse hit
    smoke = subprocess.run(
        [sys.executable, str(ROOT / need["preToolUse"])],
        input=json.dumps({"file_path": "src/lib/jp-vocab-example-sentences-ai.ts"}),
        capture_output=True,
        text=True,
        timeout=10,
        cwd=ROOT,
    )
    if smoke.returncode != 0:
        fail(f"preToolUse hook exit {smoke.returncode}: {smoke.stderr}")
    out = json.loads(smoke.stdout or "{}")
    if out.get("permission") != "allow":
        fail("preToolUse must allow")
    if "防复发" not in str(out.get("agent_message", "")):
        fail("preToolUse should inject agent_message on hit")

    print("OK: jp-vocab content-quality guard hooks + gates")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
