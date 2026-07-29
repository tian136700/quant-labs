#!/usr/bin/env python3
"""回归：线上 batch 例句走宽松 normalize（保留 JLPT、sanitize），本地 STT 仍走严格 validate。"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def must_contain(path: Path, needle: str, label: str) -> None:
    text = path.read_text(encoding="utf-8")
    if needle not in text:
        raise SystemExit(f"FAIL {label}: missing {needle!r} in {path.relative_to(ROOT)}")


def run_node_smoke() -> None:
    probe = subprocess.run(
        [
            "npx",
            "--yes",
            "tsx",
            "-e",
            """
import {
  validateJpVocabExampleSentencesAiOutput,
  normalizeJpVocabExampleSentencesForOnlineApply,
} from "./src/lib/jp-vocab-example-sentences-ai.ts";

const raw = [
  "イギリスはヨーロッパにあります。(N5)",
  "译文：英国在欧洲。",
  "イギリス人は紅茶が好きです。(N4)",
  "译文：英国人喜欢红茶。",
].join("\\n");

const input = { word: "イギリス", kind: "word", reading: "イギリス", meaning: "英国" };
const strict = validateJpVocabExampleSentencesAiOutput(raw, input);
const online = normalizeJpVocabExampleSentencesForOnlineApply(raw, input);

if (strict.ok) {
  console.error("FAIL: strict validate should reject incomplete furigana");
  process.exit(1);
}
if (!online.ok) {
  console.error("FAIL: online normalize rejected:", online.reason);
  process.exit(1);
}
if (!online.text.includes("(N5)")) {
  console.error("FAIL: JLPT tail missing after online normalize");
  process.exit(1);
}
console.log("node smoke ok");
""",
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=120,
    )
    if probe.returncode != 0:
        stderr = (probe.stderr or probe.stdout or "").strip()
        if "Cannot find module" in stderr or probe.returncode == 2:
            print("[check_jp_vocab_example_online_normalize] skip node smoke (tsx unavailable)")
            return
        raise SystemExit(f"FAIL node smoke:\\n{stderr}")
    print(probe.stdout.strip())


def main() -> int:
    ai = ROOT / "src/lib/jp-vocab-example-sentences-ai.ts"
    meaning = ROOT / "src/lib/jp-vocab-fill-meaning.ts"
    examples = ROOT / "src/lib/jp-vocab-fill-example-sentences.ts"
    usage = ROOT / "src/lib/jp-vocab-fill-usage.ts"

    must_contain(ai, "normalizeJpVocabExampleSentencesForOnlineApply", "ai")
    must_contain(ai, "不硬拒漏标汉字", "ai comment")
    must_contain(meaning, "normalizeJpVocabExampleSentencesForOnlineApply", "meaning apply")
    must_contain(examples, "normalizeJpVocabExampleSentencesForOnlineApply", "examples apply")
    must_contain(usage, "normalizeJpVocabExampleSentencesForOnlineApply", "usage apply")

    run_node_smoke()
    print("[check_jp_vocab_example_online_normalize] OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
