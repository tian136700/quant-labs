#!/usr/bin/env python3
"""回归：线上 batch 例句 normalize 须拒漏标汉字；仍保留合法 JLPT 尾标。"""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile
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
    stub_root = Path(tempfile.mkdtemp(prefix="jp-vocab-so-stub-"))
    so = stub_root / "node_modules" / "server-only"
    so.mkdir(parents=True)
    (so / "index.js").write_text("export {}\n", encoding="utf-8")
    (so / "package.json").write_text(
        '{"name":"server-only","type":"module"}\n', encoding="utf-8"
    )
    env = os.environ.copy()
    extra = str(stub_root / "node_modules")
    env["NODE_PATH"] = (
        extra + (os.pathsep + env["NODE_PATH"] if env.get("NODE_PATH") else "")
    )
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

// 韩文 Hangul 混入日语例句须拒（曾失败 id=618 셔츠、id=480 에）
const hangulBad = [
  "この셔츠を着(き)ます。(N5)",
  "译文：我穿这件衬衫。",
  "毎日(まいにち)、制服(せいふく)を着(き)て学校(がっこう)へ行(い)きます。(N5)",
  "译文：每天穿着校服去学校。",
].join("\\n");
const hangulOk = [
  "このシャツを着(き)ます。(N5)",
  "译文：我穿这件衬衫。",
  "毎日(まいにち)、制服(せいふく)を着(き)て学校(がっこう)へ行(い)きます。(N5)",
  "译文：每天穿着校服去学校。",
].join("\\n");
const hangulInput = { word: "着る", kind: "word", reading: "きる", meaning: "穿；戴" };
const hangulStrict = validateJpVocabExampleSentencesAiOutput(hangulBad, hangulInput);
const hangulOnline = normalizeJpVocabExampleSentencesForOnlineApply(hangulBad, hangulInput);
if (hangulStrict.ok || hangulStrict.reason !== "hangul_in_japanese_line") {
  console.error("FAIL: strict must reject Hangul, got", hangulStrict);
  process.exit(1);
}
if (hangulOnline.ok || hangulOnline.reason !== "hangul_in_japanese_line") {
  console.error("FAIL: online must reject Hangul, got", hangulOnline);
  process.exit(1);
}
const hangulOnlineOk = normalizeJpVocabExampleSentencesForOnlineApply(hangulOk, hangulInput);
if (!hangulOnlineOk.ok) {
  console.error("FAIL: katakana シャツ should pass:", hangulOnlineOk.reason);
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

// なる：活用形なりたい／なって 须算用到（曾 word_not_used id=654）
const naruExamples = [
  "医者(いしゃ)になりたいです。(N5)",
  "译文：我想成为医生。",
  "春(はる)になって、暖(あたた)かくなりました。(N5)",
  "译文：到了春天，变暖了。",
].join("\\n");
const naruInput = { word: "なる", kind: "word", reading: "なる", meaning: "成为；变成" };
const naruOnline = normalizeJpVocabExampleSentencesForOnlineApply(naruExamples, naruInput);
if (!naruOnline.ok) {
  console.error("FAIL: なる conjugations should pass online, got", naruOnline.reason);
  process.exit(1);
}
const naruStrict = validateJpVocabExampleSentencesAiOutput(naruExamples, naruInput);
if (!naruStrict.ok) {
  console.error("FAIL: なる conjugations should pass strict, got", naruStrict.reason);
  process.exit(1);
}

// スケッチする：ます形「スケッチします」须算用到（曾 word_not_used id=704；片假名无汉字兜底）
const sketchExamples = [
  "公園(こうえん)で木(き)をスケッチします。(N5)",
  "译文：在公园里画树的素描。",
  "美術(びじゅつ)の授業(じゅぎょう)で風景(ふうけい)をスケッチしました。(N5)",
  "译文：美术课上画了风景速写。",
].join("\\n");
const sketchInput = {
  word: "スケッチする",
  kind: "word",
  reading: "スケッチする",
  meaning: "画素描；速写",
};
const sketchOnline = normalizeJpVocabExampleSentencesForOnlineApply(
  sketchExamples,
  sketchInput
);
if (!sketchOnline.ok) {
  console.error(
    "FAIL: スケッチします should pass online, got",
    sketchOnline.reason
  );
  process.exit(1);
}
const sketchStrict = validateJpVocabExampleSentencesAiOutput(
  sketchExamples,
  sketchInput
);
if (!sketchStrict.ok) {
  console.error(
    "FAIL: スケッチします should pass strict, got",
    sketchStrict.reason
  );
  process.exit(1);
}

// ～ようにする：ます形不得 grammar_not_used（id=679）
const youni = [
  "早(はや)く起(お)きるようにしています。(N4)",
  "译文：我尽量早起。",
  "静(しず)かに話(はな)すようにしてください。(N4)",
  "译文：请尽量小声说话。",
  "毎日(まいにち)勉強(べんきょう)するようにしています。(N4)",
  "译文：我尽量每天学习。",
].join("\\n");
const youniInput = {
  word: "～ようにする",
  kind: "grammar",
  usage: "1. [口语8|考试8] 表示努力做成某事，相当于「尽量……」。(N4)",
};
const youniStrict = validateJpVocabExampleSentencesAiOutput(youni, youniInput);
if (!youniStrict.ok) {
  console.error("FAIL: ようにします should not be grammar_not_used, got", youniStrict.reason);
  process.exit(1);
}

// ～と会います：勿只认尾假名「います」（曾熔断 id=761）；须认会い＋と
const auInput = {
  word: "～と会います",
  kind: "grammar",
  usage: "1. [口语9|考试8] 和某人见面时，见面对象用助词「と」。(N5)",
};
const auOk = [
  "田中(たなか)さん と 駅(えき) で 会(あ)います。",
  "译文：我在车站和田中见面。",
  "友達(ともだち) と 午後(ごご) 会(あ)いました。",
  "译文：我和朋友下午见了面。",
  "明日(あした)、先生(せんせい) と 会(あ)います。",
  "译文：明天我和老师见面。",
].join("\\n");
const auOkOnline = normalizeJpVocabExampleSentencesForOnlineApply(auOk, auInput);
if (!auOkOnline.ok) {
  console.error("FAIL: ～と会います good examples should pass online, got", auOkOnline.reason);
  process.exit(1);
}
const auOkStrict = validateJpVocabExampleSentencesAiOutput(auOk, auInput);
if (!auOkStrict.ok) {
  console.error("FAIL: ～と会います good examples should pass strict, got", auOkStrict.reason);
  process.exit(1);
}
// 只有「に会います」无「と」→ grammar_not_used
const auNiOnly = [
  "田中(たなか)さん に 駅(えき) で 会(あ)います。",
  "译文：我在车站见田中。",
  "友達(ともだち) に 午後(ごご) 会(あ)いました。",
  "译文：我下午见了朋友。",
  "明日(あした)、先生(せんせい) に 会(あ)います。",
  "译文：明天我见老师。",
].join("\\n");
const auNiOnline = normalizeJpVocabExampleSentencesForOnlineApply(auNiOnly, auInput);
if (auNiOnline.ok || auNiOnline.reason !== "grammar_not_used") {
  console.error("FAIL: ～と会います without と must be grammar_not_used, got", auNiOnline);
  process.exit(1);
}

// 事故：第一句有词、第二句只写「注意」却把「意外」塞进译文 → 须 word_not_used（曾拼文过关 id=408）
const jikoInput = { word: "事故", kind: "word", reading: "じこ", meaning: "事故；意外事件" };
const jikoBad = [
  "昨日(きのう)、友達(ともだち)の自転車(じてんしゃ)が事故(じこ)にあった。",
  "译文：昨天，朋友的自行车出了事故。",
  "公園(こうえん)で子供(こども)たちが遊(あそ)んでいて、注意(ちゅうい)してほしい。",
  "译文：孩子们在公园玩耍，请小心不要发生意外。",
].join("\\n");
const jikoBadOnline = normalizeJpVocabExampleSentencesForOnlineApply(jikoBad, jikoInput);
if (jikoBadOnline.ok || jikoBadOnline.reason !== "word_not_used") {
  console.error("FAIL: 事故 第二句未用词条 must be word_not_used online, got", jikoBadOnline);
  process.exit(1);
}
const jikoBadStrict = validateJpVocabExampleSentencesAiOutput(jikoBad, jikoInput);
if (jikoBadStrict.ok || jikoBadStrict.reason !== "word_not_used") {
  console.error("FAIL: 事故 第二句未用词条 must be word_not_used strict, got", jikoBadStrict);
  process.exit(1);
}
const jikoOk = [
  "昨日(きのう)、友達(ともだち)の自転車(じてんしゃ)が事故(じこ)にあった。",
  "译文：昨天，朋友的自行车出了事故。",
  "公園(こうえん)で子供(こども)たちが遊(あそ)んでいて、事故(じこ)に注意(ちゅうい)してほしい。",
  "译文：孩子们在公园玩耍，请小心别出事故。",
].join("\\n");
const jikoOkOnline = normalizeJpVocabExampleSentencesForOnlineApply(jikoOk, jikoInput);
if (!jikoOkOnline.ok) {
  console.error("FAIL: 事故 both sentences using lemma should pass online, got", jikoOkOnline.reason);
  process.exit(1);
}
const jikoOkStrict = validateJpVocabExampleSentencesAiOutput(jikoOk, jikoInput);
if (!jikoOkStrict.ok) {
  console.error("FAIL: 事故 both sentences using lemma should pass strict, got", jikoOkStrict.reason);
  process.exit(1);
}

// 葉子/はっぱ：写成单字葉(は) 须拒（不是浊化；葉≠葉子）
const happaInput = { word: "葉子", kind: "word", reading: "はっぱ", meaning: "叶子" };
const happaBad = [
  "木(き)の葉(は)が風(かぜ)で落(お)ちました。(N5)",
  "译文：树叶被风吹落了。",
  "秋(あき)になると、葉(は)が黄色(きいろ)くなります。(N5)",
  "译文：到了秋天，叶子会变黄。",
].join("\\n");
const happaBadOnline = normalizeJpVocabExampleSentencesForOnlineApply(happaBad, happaInput);
if (happaBadOnline.ok || happaBadOnline.reason !== "word_not_used") {
  console.error("FAIL: 葉子 written as 葉(は) must be word_not_used online, got", happaBadOnline);
  process.exit(1);
}
const happaOk = [
  "木(き)の葉子(はっぱ)が風(かぜ)で落(お)ちました。(N5)",
  "译文：树上的叶子被风吹落了。",
  "秋(あき)になると、葉子(はっぱ)が黄色(きいろ)くなります。(N5)",
  "译文：到了秋天，叶子会变黄。",
].join("\\n");
const happaOkOnline = normalizeJpVocabExampleSentencesForOnlineApply(happaOk, happaInput);
if (!happaOkOnline.ok) {
  console.error("FAIL: 葉子(はっぱ) examples should pass online, got", happaOkOnline.reason);
  process.exit(1);
}

// こちらこそ：A/B 对话两行日语一条译文 → missing_chinese_gloss（曾失败 id=825）
const kochiraBad = [
  "A：「先日(せんじつ)はありがとうございました。」(N5)",
  "B：「こちらこそ、ありがとうございました。」(N5)",
  "译文：A：「前几天谢谢您。」B…",
].join("\\n");
const kochiraInput = { word: "こちらこそ", kind: "word", reading: "こちらこそ", meaning: "彼此彼此" };
const kochiraBadOnline = normalizeJpVocabExampleSentencesForOnlineApply(kochiraBad, kochiraInput);
if (kochiraBadOnline.ok || kochiraBadOnline.reason !== "missing_chinese_gloss") {
  console.error("FAIL: A/B dialogue one gloss must be missing_chinese_gloss, got", kochiraBadOnline);
  process.exit(1);
}
const kochiraOk = [
  "こちらこそ、よろしくお願(ねが)いします。(N5)",
  "译文：彼此彼此，请多关照。",
  "先日(せんじつ)は、こちらこそありがとうございました。(N5)",
  "译文：前几天，我才要谢谢您。",
].join("\\n");
const kochiraOkOnline = normalizeJpVocabExampleSentencesForOnlineApply(kochiraOk, kochiraInput);
if (!kochiraOkOnline.ok) {
  console.error("FAIL: こちらこそ single-line pairs should pass online, got", kochiraOkOnline.reason);
  process.exit(1);
}

console.log("node smoke ok");
""",
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=120,
        env=env,
    )
    if probe.returncode != 0:
        stderr = (probe.stderr or probe.stdout or "").strip()
        if "Cannot find module" in stderr and "tsx" in stderr.lower():
            print("[check_jp_vocab_example_online_normalize] skip node smoke (tsx unavailable)")
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
    must_contain(ai, "hangul_in_japanese_line", "ai reject Hangul in JP examples")
    must_contain(ai, "jpVocabExampleHasHangul", "ai Hangul helper")
    must_contain(ai, "この셔츠を着", "ai prompt bans Hangul shirt")
    must_contain(
        ROOT / "scripts/jp-vocab-fill-online-batch-api.py",
        "禁止韩文",
        "online batch bans Hangul in examples",
    )
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
    must_contain(ai, "pushSuruVerbSurfaces", "ai recognizes ～する → …します")
    must_contain(
        ai,
        r"/^[\u3040-\u309F]る$/",
        "ai 二字假名る动词须匹配 なる（1假名+る），禁止 {2}る",
    )
    must_contain(
        ai,
        "jpVocabExampleLineUsesLemma",
        "ai must check lemma per example sentence (not joined text)",
    )
    must_contain(
        ai,
        "jpVocabExampleLineUsesLemma(item.text",
        "ai must call lemma check inside each example item",
    )
    must_not_contain(
        ai,
        "kans[0]",
        "ai must not accept first-kanji-only hit (事故≠仕事の事)",
    )
    must_contain(ai, "スケッチする", "ai prompt/regression mentions スケッチする ます形")
    must_contain(ai, "かぶって／つける", "ai prompt allows reading-form examples for 戴")
    must_contain(
        ROOT / "scripts/jp-vocab-fill-online-batch-api.py",
        "かぶる／つける",
        "online batch allows kana reading forms for kanji lemmas",
    )
    must_contain(
        ROOT / "scripts/jp-vocab-fill-online-batch-api.py",
        "每句整词",
        "online batch WORD_SYSTEM requires lemma in every sentence",
    )
    must_contain(
        ROOT / "scripts/jp-vocab-fill-online-batch-api.py",
        "examples_ab_dialogue_missing_per_line_gloss",
        "online batch prechecks A/B dialogue missing gloss",
    )
    must_contain(
        ROOT / "scripts/jp-vocab-fill-online-batch-api.py",
        "こちらこそ、ありがとうございました",
        "online batch WORD_SYSTEM bans A/B dialogue for こちらこそ",
    )
    must_contain(
        ai,
        "禁止 A：／B：",
        "ai UPLOAD_SPEC / prompt bans A/B dialogue one gloss",
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
