#!/usr/bin/env python3
"""回归：线上 batch 例句 normalize 须拒漏标汉字；仍保留合法 JLPT 尾标。"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def must_contain(path: Path, needle: str, label: str) -> None:
    text = path.read_text(encoding="utf-8")
    if needle not in text:
        raise SystemExit(f"FAIL {label}: missing {needle!r} in {path.relative_to(ROOT)}")


def must_not_contain(path: Path, needle: str, label: str) -> None:
    text = path.read_text(encoding="utf-8")
    if needle in text:
        raise SystemExit(f"FAIL {label}: must not contain {needle!r} in {path.relative_to(ROOT)}")


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

const incomplete = [
  "イギリス人は紅茶が好きです。(N5)",
  "译文：英国人喜欢红茶。",
  "イギリスはヨーロッパにあります。(N4)",
  "译文：英国在欧洲。",
].join("\\n");

const complete = [
  "イギリス人(じん)は紅茶(こうちゃ)が好(す)きです。(N5)",
  "译文：英国人喜欢红茶。",
  "イギリスはヨーロッパにあります。(N4)",
  "译文：英国在欧洲。",
].join("\\n");

const input = { word: "イギリス", kind: "word", reading: "イギリス", meaning: "英国" };

const strictBad = validateJpVocabExampleSentencesAiOutput(incomplete, input);
const onlineBad = normalizeJpVocabExampleSentencesForOnlineApply(incomplete, input);
if (strictBad.ok) {
  console.error("FAIL: strict validate should reject incomplete furigana");
  process.exit(1);
}
if (onlineBad.ok) {
  console.error("FAIL: online normalize should reject incomplete furigana, got ok");
  process.exit(1);
}
if (onlineBad.reason !== "incomplete_kanji_furigana") {
  console.error("FAIL: online reason want incomplete_kanji_furigana got", onlineBad.reason);
  process.exit(1);
}

const onlineOk = normalizeJpVocabExampleSentencesForOnlineApply(complete, input);
if (!onlineOk.ok) {
  console.error("FAIL: online normalize rejected good furigana:", onlineOk.reason);
  process.exit(1);
}
if (!onlineOk.text.includes("(N5)")) {
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
        if "Cannot find module" in stderr or "server-only" in stderr or probe.returncode == 2:
            print("[check_jp_vocab_example_online_normalize] skip node smoke (tsx/server-only unavailable)")
            return
        raise SystemExit(f"FAIL node smoke:\n{stderr}")
    print(probe.stdout.strip())


def main() -> int:
    ai = ROOT / "src/lib/jp-vocab-example-sentences-ai.ts"
    meaning = ROOT / "src/lib/jp-vocab-fill-meaning.ts"
    examples = ROOT / "src/lib/jp-vocab-fill-example-sentences.ts"
    usage = ROOT / "src/lib/jp-vocab-fill-usage.ts"
    route = ROOT / "src/app/api/jp-vocab/fill-example-sentences/route.ts"
    scan = ROOT / "src/lib/jp-vocab-example-furigana-scan.ts"

    must_contain(ai, "normalizeJpVocabExampleSentencesForOnlineApply", "ai")
    must_contain(ai, "incomplete_kanji_furigana", "ai online reject bare kanji")
    must_contain(ai, "wrong_jukugo_furigana", "ai online reject wrong jukugo")
    must_contain(ai, "bad_furigana_paren", "ai online reject bad paren")
    must_not_contain(ai, "不硬拒漏标汉字", "ai must not keep lenient furigana comment")
    must_contain(meaning, "normalizeJpVocabExampleSentencesForOnlineApply", "meaning apply")
    must_contain(examples, "normalizeJpVocabExampleSentencesForOnlineApply", "examples apply")
    must_contain(usage, "normalizeJpVocabExampleSentencesForOnlineApply", "usage apply")
    must_contain(scan, "listJpVocabWordsIncompleteExampleFurigana", "furigana scan")
    must_contain(examples, "scanJpVocabWordsIncompleteExampleFurigana", "fill scan export")
    must_contain(route, "scan_incomplete_furigana", "route scan mode")

    run_node_smoke()
    print("[check_jp_vocab_example_online_normalize] OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
