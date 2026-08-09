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
if (onlineBad.reason !== "incomplete_kanji_furigana" && !String(onlineBad.reason || "").startsWith("incomplete_kanji_furigana:")) {
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

// 趣味：只标词条漏标「私」须拒（曾失败 id=502）
const shumiBad = [
  "私の趣味(しゅみ)は音楽(おんがく)を聴(き)くことです。(N5)",
  "译文：我的兴趣是听音乐。",
  "あなたの趣味(しゅみ)は何(なん)ですか。(N5)",
  "译文：你的爱好是什么？",
].join("\\n");
const shumiOk = [
  "私(わたし)の趣味(しゅみ)は音楽(おんがく)を聴(き)くことです。(N5)",
  "译文：我的兴趣是听音乐。",
  "あなたの趣味(しゅみ)は何(なん)ですか。(N5)",
  "译文：你的爱好是什么？",
].join("\\n");
const shumiInput = { word: "趣味", kind: "word", reading: "しゅみ", meaning: "兴趣；爱好" };
const shumiOnlineBad = normalizeJpVocabExampleSentencesForOnlineApply(shumiBad, shumiInput);
if (
  shumiOnlineBad.ok ||
  (shumiOnlineBad.reason !== "incomplete_kanji_furigana" &&
    !String(shumiOnlineBad.reason || "").startsWith("incomplete_kanji_furigana:"))
) {
  console.error("FAIL: 私 without furigana must be incomplete_kanji_furigana", shumiOnlineBad);
  process.exit(1);
}
if (!String(shumiOnlineBad.reason || "").includes("私")) {
  console.error("FAIL: reason should name missing kanji 私, got", shumiOnlineBad.reason);
  process.exit(1);
}
const shumiOnlineOk = normalizeJpVocabExampleSentencesForOnlineApply(shumiOk, shumiInput);
if (!shumiOnlineOk.ok) {
  console.error("FAIL: 趣味 full furigana should pass:", shumiOnlineOk.reason);
  process.exit(1);
}

// 「訳文：」须 online salvage 成「译文：」（曾失败 id=508/512）
const yakuwenRaw = [
  "日常(にちじょう)生活(せいかつ)で日本語(にほんご)をよく使(つか)います。(N4)",
  "訳文：我在日常生活中经常使用日语。",
  "毎日(まいにち)の日常(にちじょう)が忙(いそが)しいです。(N5)",
  "訳文：每天的日常都很忙。",
].join("\\n");
const yakuwenInput = { word: "日常", kind: "word", reading: "にちじょう", meaning: "日常；平时" };
const yakuwenOnline = normalizeJpVocabExampleSentencesForOnlineApply(yakuwenRaw, yakuwenInput);
if (!yakuwenOnline.ok) {
  console.error("FAIL: online should salvage 訳文： label, got", yakuwenOnline.reason);
  process.exit(1);
}
if (yakuwenOnline.text.includes("訳文") || !yakuwenOnline.text.includes("译文：")) {
  console.error("FAIL: 訳文 should become 译文：", yakuwenOnline.text);
  process.exit(1);
}
const yakuwenStrict = validateJpVocabExampleSentencesAiOutput(yakuwenRaw, yakuwenInput);
if (yakuwenStrict.ok || yakuwenStrict.reason !== "gloss_has_yakuwen_label") {
  console.error("FAIL: strict validate must still reject raw 訳文：", yakuwenStrict);
  process.exit(1);
}

// 释义「认真；老实；正经」：；近义不得抬高条数（曾熔断 id=484 真面目）
import { countJpVocabExampleSentenceTargetFromMeaning } from "./src/lib/jp-vocab-meaning-ai.ts";
const synonymMeaning = "认真；老实；正经";
const synonymTarget = countJpVocabExampleSentenceTargetFromMeaning(synonymMeaning, "word");
if (synonymTarget !== 2) {
  console.error("FAIL: ；近义 should target 2 examples, got", synonymTarget);
  process.exit(1);
}
const slashTarget = countJpVocabExampleSentenceTargetFromMeaning("前面；以前/预先", "word");
if (slashTarget !== 2) {
  console.error("FAIL: two major senses via / should target 2, got", slashTarget);
  process.exit(1);
}
const majime = [
  "彼(かれ)は真面目(まじめ)な学生(がくせい)です。(N5)",
  "译文：他是一个认真的学生。",
  "田中(たなか)さんはいつも真面目(まじめ)に仕事(しごと)をします。(N5)",
  "译文：田中总是认真地工作。",
].join("\\n");
const majimeOk = validateJpVocabExampleSentencesAiOutput(majime, {
  word: "真面目",
  kind: "word",
  reading: "まじめ",
  meaning: synonymMeaning,
});
if (!majimeOk.ok) {
  console.error("FAIL: 真面目 2 examples with ； synonyms should pass, got", majimeOk.reason);
  process.exit(1);
}
// 戴：reading 全角／分段；例句用假名活用「かぶって／つける」须过（曾失败 id=613 word_not_used）
const daiExamples = [
  "帽子(ぼうし)をかぶって、外(そと)に出(で)ました。",
  "译文：我戴上帽子出去了。",
  "メガネをつけると、よく見(み)えます。",
  "译文：戴上眼镜就看得清楚。",
].join("\\n");
const daiInput = {
  word: "戴",
  kind: "word",
  reading: "かぶる／つける",
  meaning: "戴（帽子、头盔等）/戴（眼镜、耳环、领带等）",
};
const daiOnline = normalizeJpVocabExampleSentencesForOnlineApply(daiExamples, daiInput);
if (!daiOnline.ok) {
  console.error("FAIL: 戴 fullwidth reading slash + kana conjugation should pass, got", daiOnline.reason);
  process.exit(1);
}
const daiStrict = validateJpVocabExampleSentencesAiOutput(daiExamples, daiInput);
if (!daiStrict.ok) {
  console.error("FAIL: 戴 strict validate should pass kana readings, got", daiStrict.reason);
  process.exit(1);
}
const daiBad = normalizeJpVocabExampleSentencesForOnlineApply(
  [
    "今日(きょう)は晴(は)れです。",
    "译文：今天是晴天。",
    "明日(あした)も晴(は)れです。",
    "译文：明天也是晴天。",
  ].join("\\n"),
  daiInput
);
if (daiBad.ok || daiBad.reason !== "word_not_used") {
  console.error("FAIL: unrelated examples for 戴 must be word_not_used", daiBad);
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
    must_contain(ai, "私の趣味(しゅみ)", "ai prompt warns 私 without furigana")
    must_contain(
        ROOT / "scripts/jp-vocab-fill-online-batch-api.py",
        "私の趣味(しゅみ)",
        "online batch WORD_SYSTEM warns 私 without furigana",
    )
    must_contain(
        ROOT / "scripts/jp-vocab-fill-online-batch-api.py",
        "format_example_gloss_line",
        "online batch must strip 訳文 before apply",
    )
    must_contain(
        ROOT / "scripts/jp-vocab-fill-online-batch-api.py",
        '"validate_format": False',
        "online batch examples apply must use online normalize",
    )
    must_contain(ai, "splitJpVocabLemmaSlashParts", "ai splits fullwidth reading slash")
    must_contain(ai, "[/／]", "ai lemma hit must split ／")
    must_contain(ai, "かぶって／つける", "ai prompt allows reading-form examples for 戴")
    must_contain(
        ROOT / "scripts/jp-vocab-fill-online-batch-api.py",
        "かぶる／つける",
        "online batch allows kana reading forms for kanji lemmas",
    )
    must_contain(ai, "bad_furigana_paren", "ai online reject bad paren")
    must_contain(ai, "gloss_not_chinese", "ai reject Japanese-in-gloss")
    must_contain(ai, "jpVocabExampleGlossLooksNonChinese", "ai gloss chinese helper")
    must_not_contain(ai, "不硬拒漏标汉字", "ai must not keep lenient furigana comment")
    must_not_contain(
        ROOT / "src/lib/jp-vocab-meaning-ai.ts",
        "Math.max(2, sub.length)",
        "example count must not use ； synonym count",
    )
    must_contain(
        ROOT / "src/lib/jp-vocab-meaning-ai.ts",
        "只是近义罗列",
        "example count documents ； ≠ sentence count",
    )
    must_contain(meaning, "normalizeJpVocabExampleSentencesForOnlineApply", "meaning apply")
    must_contain(examples, "normalizeJpVocabExampleSentencesForOnlineApply", "examples apply")
    must_contain(usage, "normalizeJpVocabExampleSentencesForOnlineApply", "usage apply")
    must_contain(scan, "listJpVocabWordsIncompleteExampleFurigana", "furigana scan")
    must_contain(examples, "scanJpVocabWordsIncompleteExampleFurigana", "fill scan export")
    must_contain(route, "scan_incomplete_furigana", "route scan mode")

    notes = ROOT / "src/lib/jp-vocab-db/notes_fields.ts"
    must_contain(notes, "validateJpVocabExampleSentencesAiOutput", "edit must validate examples")

    run_node_smoke()
    print("[check_jp_vocab_example_online_normalize] OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
