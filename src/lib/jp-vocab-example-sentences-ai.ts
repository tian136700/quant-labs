import "server-only";

import {
  formatJpVocabExampleGlossLine,
  isJpVocabExampleGlossLine,
  isJpVocabExampleJapaneseLine,
  JP_VOCAB_PAREN_FURIGANA_RE,
  jpVocabExampleHasInvalidFuriganaParen,
  jpVocabExampleHasUnannotatedKanji,
  jpVocabExampleLooksLikeChineseTeachingProse,
  listJpVocabUnannotatedKanji,
  parseJpVocabExampleSentenceItems,
  sanitizeJpVocabExampleJapaneseLine,
  serializeJpVocabExampleSentenceItems,
  stripAllJpVocabParenBlocks,
} from "@/lib/jp-vocab-example-sentences";
import {
  JP_VOCAB_JUKUGO_FURIGANA_PROMPT_HINT,
  jpVocabExampleHasWrongJukugoFurigana,
} from "@/lib/jp-vocab-jukugo-furigana";
import {
  jpVocabExampleLemmaSurfaces,
  jpVocabNaAdjParts,
  jpVocabNaAdjReadingForStem,
} from "@/lib/jp-vocab-na-adj";
import {
  countJpVocabExampleSentenceTargetFromMeaning,
  splitJpVocabMeaningMajorSenses,
} from "@/lib/jp-vocab-meaning-ai";
import { countJpVocabUsagePoints, isJpVocabConjugationGrammar } from "@/lib/jp-vocab-usage-ai";
import {
  jpVocabConnectionPromptAppendix,
  splitJpVocabAiOutputConnectionSection,
} from "@/lib/jp-vocab-connection-ai";
import { validateJpVocabUsageExamplePairAlignment } from "@/lib/jp-vocab-usage-example-pair-align";
import { jpVerbMasuToDictionaryForm } from "@/lib/jp-verb-masu-to-dictionary";
import { jpVocabExampleHasHidoiKowaiGlossMismatch } from "@/lib/jp-vocab-example-hidoi-gloss";

/** 读音/词条多写：半角 `/` 与全角 `／` 均分段（戴 reading=かぶる／つける）。 */
function splitJpVocabLemmaSlashParts(raw: string): string[] {
  return String(raw || "")
    .split(/[/／]/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** ～する サ变动词：します／した／しない 不含完整「する」，须认词干与「…し」。 */
function pushSuruVerbSurfaces(push: (s: string) => void, part: string): void {
  if (!part.endsWith("する") || part.length < 4) return;
  const stem = part.slice(0, -2);
  if (!stem) return;
  push(stem);
  push(`${stem}し`);
}

/** 例句「是否用到词条」：汉字写法 + 读音假名（貰う / もらう / もらっ… 都算用到）。 */
function lemmaSurfacesForExampleHit(
  word: string,
  reading?: string | null
): string[] {
  const out = [...jpVocabExampleLemmaSurfaces(word)];
  const seen = new Set(out);
  const push = (s: string) => {
    const t = s.trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };
  for (const part of splitJpVocabLemmaSlashParts(String(reading || ""))) {
    push(part);
    // 活用：もらった 不含完整「もらう」，但含词干「もら」；かぶって 含「かぶ」
    if (part.length >= 3) {
      push(part.slice(0, -1));
    }
    // 二字假名五段る动词（なる＝な+る）：なりたい／なって／なります 都不含完整「なる」
    // 勿只推词干「な」（会误匹配 など／なに）。须「1 个假名 + る」，不是 {2}る（那是 3 拍，永远匹配不到「なる」）。
    if (/^[\u3040-\u309F]る$/.test(part)) {
      const stem = part.slice(0, -1);
      push(`${stem}り`);
      push(`${stem}っ`);
      push(`${stem}れ`);
      push(`${stem}ろ`);
    }
    // スケッチする → スケッチします（片假名无汉字兜底，曾误拒 word_not_used id=704）
    pushSuruVerbSurfaces(push, part);
  }
  // 词条本身亦为二字假名る动词时（reading 空）同样认活用
  for (const part of splitJpVocabLemmaSlashParts(word)) {
    if (/^[\u3040-\u309F]る$/.test(part)) {
      const stem = part.slice(0, -1);
      push(`${stem}り`);
      push(`${stem}っ`);
      push(`${stem}れ`);
      push(`${stem}ろ`);
    }
    pushSuruVerbSurfaces(push, part);
  }
  return out;
}

/** 上传/本地模型须遵守的例句契约（与 compose 规则一致；list_missing 会原样返回） */
export const JP_VOCAB_EXAMPLE_SENTENCES_UPLOAD_SPEC = {
  version: 6,
  count_rule:
    "单词：释义含 / 时条数=斜杠段数；无斜杠固定 2（；近义不是条数）。语法：多用法→条数=用法点数（1:1）；仅 1 种用法→固定 3 句，按接续不同类型各造（一类／二类／名词等）；须先有 usage。同一次输出末尾须有【接序】",
  format_example:
    "電車(でんしゃ)に間(ま)に合(あ)いました。\n译文：我赶上电车了。\nもう少(すこ)し早(はや)く来(き)てください。\n译文：请再早一点来。\n【接序】\n一类动词／辞书形（动词原形）：「書く」；ます形：「書きます」；て形：「書いて」",
  rules: [
    "存库不要写行首序号（展示层会加 1、2、3…）",
    "每条：日语一行，下一行必须以「译文：」开头的中文（「译文：」后直接中文，禁止「译文：/ …」「译文：訳文：…」或日文「訳文：」标签）",
    "禁止 A：／B：或「—」分行对话只配一条译文（会 missing_chinese_gloss）；感叹词／寒暄（こちらこそ、ううん）写成独立「日语+译文」单句",
    "中文译文必须自然通顺（口语）；禁止逐词硬译（如「について話す」→「关于…说话」；应作「谈谈…」或「聊聊…」；「静かに話す」→「请小声说话」，禁止「请安静地说话」；「酷い／ひどい」禁止译成「可怕…」，可怕≈怖い，应作过分／糟糕／残酷）",
    "「間／あいだ」须体现「AとB的之间」或「某段时间期间」：❌忙しい間です／我现在很忙；✅本とノートの間に…／会議の間…；「の間に」是之内／期间，禁止译成「……后」",
    "「注意する」小心某事须接「に」：❌約束を注意 → ✅車に注意／約束に注意",
    "「好き／嫌い／大好き／大嫌い」对象须接「が」：❌魚は嫌いです → ✅魚が嫌いです（は表对比，初学卡片勿用）",
    "「相談する」：人に＝向/找某人商量；人と＝和某人一起商量；译文勿与助词对调",
    "释义栏的「关于……」等只是义项提示，不要每句译文都机械套同一套壳",
    "句中每一个汉字都必须立刻半角括号假名（不能只标词条本身）：如 今日(きょう)は気分(きぶん)がいいです；词尾假名如 静か(しずか)、落(お)ち着(つ)き；括号内只能是假名、不要空格、不要整句读音尾注；禁止句末语法说明括号；页面展示会转成汉字下方小字",
    "N5～N4、口语、短句；必须自然用到该词条 / 语法点（词条汉字或其读音假名活用皆可：戴＋reading かぶる／つける → 例「かぶって／つける」算用到；词条全假名（バーゲンかいじょう）→ 例句 バーゲン会場(かいじょう) 算用到；接头辞 お～／ご～ → 例句 お名前／お水 算用到；～する 动词可用ます形「…します／…しました」，如 スケッチする→スケッチします、一緒にお願いする→一緒にお願いします；校验会忽略助词空格；勿只写无关句）",
    "单词：每一句日语都必须出现该词条整词或读音（禁止只靠第一句带过）。禁止只写词条里一个字或近义词：葉子/はっぱ ≠ 葉(は)；事故 ≠ 第二句只写「注意」却把「意外」塞进译文",
    "语法例句：多用法时第 N 句对应第 N 条用法；仅 1 种用法时造 3 句，分别覆盖接续里不同词类/形态（如一类形容词／二类形容词／名词），不要三句同一接续；只用简单词、不要叠更难的语法（避免多焦点）；有课数时勿超纲（标日初级勿写中级/N2 词）",
    "例句须场景自洽、有头有尾：条件/前提与后半结果或建议要能自然连上，读起来像一整句日常对话，禁止无厘头硬凑（如「来るなら、どうぞ入ってください」／「来的话请进」缺语境）",
    "初学者友好：一句尽量只用一个话题助词「は」；时间/场景已用「今は」等时，主语改用「が」或省略，不要叠「今は傘は…」这类双は（语法虽对但 N5 易误判）",
    "助词左右与相邻词不要粘成一块：❌「給料はいつ」✅「給料 は いつ」；❌「料金はいくら」✅「料金 は いくら」；❌「は高い」✅「は 高い」（は/が/を/の…两侧留半角空格，避免看成一个单词）",
    "一类形容词过去式后接「です／ですね」，禁止再叠「でした」（双过去）：❌面白かったでしたね → ✅面白かったですね；名词／二类形容词才用「でした／でしたね」",
    "语法词条里的「～」「〜」是占位符，禁止原样写进例句；要用具体词：天气预报によると／彼によると…",
    "语法助词（～が / ～は / ～を…）：句中必须出现该助词本身；教「が」时不要写成只有「は」的例句",
    "な形容词辞书形以「だ」结尾时（重要だ/得意だ/下手だ）：造句用词干（重要/得意/下手），例句里不必出现「だ」；假名标在词干汉字上",
    "多用法时一句对应一种用法，不要两句挤同一义项",
    "释义已含 / 时：按斜杠分段，每段造 1 句，且须体现该段读音（如 前 的 まえ/ぜん）",
    "从句连接后要加顿号「、」：❌「食べながらテレビを見る」✅「食べながら、テレビを見る」；「によると」同理（❌「によると今日は…」✅「によると、今日は…」）",
    "每条日语须以「。」「！」「？」或「…」结尾，禁止无句末标点或只写单词",
    "日语例句禁止韩文 Hangul（한글）：❌「この셔츠を着ます」✅「このシャツを着ます」；❌助词「에」✅「に」；外来语用片假名",
    "敬语接头辞お／ご已写在汉字前时，括注只标汉字读音：✅「お辞儀(じぎ)」「お金(かね)」「ご飯(はん)」；❌「お辞儀(おじぎ)」「ご飯(ごはん)」（勿在假名里再写お／ご）",
    "单词例句：句末标点后可标 JLPT 等级半角括号 (N5)/(N4)/(N3)，如「…しました。(N5)」；尽量 N5～N4 简单句",
    "同一次输出末尾必须有【接序】段（词类与活用／语法接续）；禁止另开定时任务只补接序；写回可另传 connection 字段",
    "写回时请传 source，建议「模型名/版本 本地|线上」，如「gemma4:26b 本地」；人手填写为「手动」",
  ],
  reject_reasons: [
    "empty",
    "need_four_lines",
    "need_more_lines",
    "need_two_japanese_lines",
    "need_more_japanese_lines",
    "invalid_japanese_line",
    "chinese_prose_in_japanese_line",
    "incomplete_kanji_furigana",
    "wrong_jukugo_furigana",
    "bad_furigana_paren",
    "missing_chinese_gloss",
    "literal_chinese_gloss",
    "gloss_not_chinese",
    "gloss_has_yakuwen_label",
    "aida_fake_state_predicate",
    "gloss_aida_ni_as_after",
    "chuui_suru_wo_particle",
    "suki_kirai_wa_particle",
    "soudan_particle_gloss_mismatch",
    "hidoi_kowai_gloss",
    "lemma_placeholder_in_sentence",
    "hangul_in_japanese_line",
    "grammar_not_used",
    "word_not_used",
    "double_wa_topic",
    "i_adj_past_deshita",
    "missing_clause_touten",
    "missing_sentence_final_punct",
    "usage_required",
    "pair_semantic_mismatch",
    "connection_required",
    "connection_invalid",
  ],
} as const;

/** 已知死译壳：关于X说话（「について話す」应为谈谈/聊聊） */
const LITERAL_NI_TSUITE_HANASU_GLOSS_RE = /关于.+说话/;

/**
 * 「静かに話す」死译成「安静地说话／讲话」——中文听着像「安静」与「说话」打架。
 * 自然说法：小声说话／轻声说。
 */
const LITERAL_SHIZUKA_NI_HANASU_GLOSS_RE = /安静地[说讲]话/;

/** 译文是否命中已知死译壳（apply / 编辑写回拒 literal_chinese_gloss） */
export function jpVocabExampleHasLiteralChineseGloss(glossBody: string): boolean {
  const g = String(glossBody || "");
  return (
    LITERAL_NI_TSUITE_HANASU_GLOSS_RE.test(g) ||
    LITERAL_SHIZUKA_NI_HANASU_GLOSS_RE.test(g)
  );
}

/**
 * 「注意する」教「小心／注意某事」须接「に」：車に注意。
 * ❌約束を注意してください（物／事误用を）；✅約束に注意してください。
 * 「注意を払う」另论；「人を注意する」（提醒某人）本条不拦——仅拦词条为注意する且出现「を注意」。
 */
export function jpVocabExampleHasChuuiSuruWoParticle(
  japaneseLine: string,
  word: string
): boolean {
  const lemma = String(word || "")
    .replace(/[～~〜]/g, "")
    .trim();
  if (lemma !== "注意する" && lemma !== "注意") return false;
  const compact = stripAllJpVocabParenBlocks(String(japaneseLine || "")).replace(
    /\s+/g,
    ""
  );
  if (/注意を払/.test(compact)) return false;
  return /を注意/.test(compact);
}

const SUKI_KIRAI_STEMS = new Set(["好き", "嫌い", "大好き", "大嫌い"]);

/**
 * 「好き／嫌い」对象用「が」：❌魚は嫌いです → ✅魚が嫌いです。
 * 只在教这些词条时拒；「は嫌いな」（定语）不拒；「私は魚が嫌いです」不拒。
 */
export function jpVocabExampleHasSukiKiraiWaParticle(
  japaneseLine: string,
  word: string
): boolean {
  const lemma = String(word || "")
    .replace(/[～~〜]/g, "")
    .trim()
    .replace(/だ$/, "");
  if (!SUKI_KIRAI_STEMS.has(lemma)) return false;
  const compact = stripAllJpVocabParenBlocks(String(japaneseLine || "")).replace(
    /\s+/g,
    ""
  );
  return /は(?:あまり|全然|とても|ちょっと|少し|まだ|もう|そんなに|すごく|本当に)*(?:大)?(?:好き|嫌い)(?!な)/.test(
    compact
  );
}

/** 造句 prompt：仅当本词是喜欢/讨厌时钉在「词条：」旁（总规则 9e 易被长清单淹没）。 */
export function jpVocabSukiKiraiParticlePromptHint(word: string): string | null {
  const lemma = String(word || "")
    .replace(/[～~〜]/g, "")
    .trim()
    .replace(/だ$/, "");
  if (!SUKI_KIRAI_STEMS.has(lemma)) return null;
  return (
    `接续必守：本词对象用「が」，两句都用が。` +
    `❌「魚は${lemma}です」（换场景时不要把が改成は）→ ✅「魚が${lemma}です」。` +
    `可以说「私は魚が${lemma}です」；禁止对象上用は。`
  );
}

/**
 * 「相談する」：に＝向某人请教／找某人商量；と＝和某人一起商量。
 * 拒译文与助词对调：に却写「和…谈」；と却写「咨询了…」。
 */
export function jpVocabExampleHasSoudanParticleGlossMismatch(
  japaneseLine: string,
  glossBody: string,
  word: string
): boolean {
  const lemma = String(word || "")
    .replace(/[～~〜]/g, "")
    .trim();
  if (lemma !== "相談する" && lemma !== "相談") return false;
  const compact = stripAllJpVocabParenBlocks(String(japaneseLine || "")).replace(
    /\s+/g,
    ""
  );
  const gloss = String(glossBody || "");
  // に相談 → 勿译成单纯「和…谈／和…商量」（缺向/找/请教/咨询）
  if (/に相談/.test(compact)) {
    if (/(向|找|请教|咨询)/.test(gloss)) return false;
    if (/和.+谈|和.+商量/.test(gloss)) return true;
  }
  // と相談 → 勿译成「咨询了某人」（像に）
  if (/と相談/.test(compact)) {
    if (/一起|和.+商量|跟.+商量/.test(gloss)) return false;
    if (/咨询了/.test(gloss) || /^我咨询/.test(gloss)) return true;
  }
  return false;
}

/**
 * 「忙しい間です」——把あいだ当成「忙的状态」谓语。
 * 教「之间／中间」应是 AとBの間 / ～の間；「長い間です」寒暄另放行。
 */
export function jpVocabExampleHasAidaFakeStatePredicate(
  japaneseLine: string,
  glossBody: string
): boolean {
  const compact = stripAllJpVocabParenBlocks(String(japaneseLine || "")).replace(
    /\s+/g,
    ""
  );
  // い形容词＋間です（忙しい間です／短い間です…）
  if (!/(?:しい|い)間です/.test(compact)) return false;
  if (/長い間です/.test(compact)) return false;
  const gloss = String(glossBody || "");
  if (/(之间|中间|期间|时候|其间)/.test(gloss)) return false;
  return true;
}

/**
 * 「の間に／間に」= 在……之内／期间；禁止译成「……后」。
 * ❌一時間の間に… → 一小时后就…；✅一小时内／开会期间…
 */
export function jpVocabExampleGlossTreatsAidaNiAsAfter(
  japaneseLine: string,
  glossBody: string
): boolean {
  const compact = stripAllJpVocabParenBlocks(String(japaneseLine || "")).replace(
    /\s+/g,
    ""
  );
  if (!/間に|あいだに/.test(compact)) return false;
  const gloss = String(glossBody || "");
  if (/(之内|以内|期间|之间|时候)/.test(gloss)) return false;
  // 去掉方位「后面／后方…」后再看是否剩时间「后」
  const cleaned = gloss
    .replace(/后面|后方|后边|後麵|後边|后半|後頭|后头/g, "")
    .replace(/之後|以后/g, "后");
  return /后/.test(cleaned);
}

/** 词典占位符波浪号，禁止出现在例句正文 */
const LEMMA_PLACEHOLDER_WAVE_RE = /[～〜]/;

/**
 * 韩文 Hangul（音节 / 字母 / 兼容字母）。
 * 模型偶把「シャツ」写成「셔츠」、把「に」写成「에」混进日语例句。
 */
const HANGUL_IN_JP_EXAMPLE_RE = /[\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F]/;

/** 日语例句行是否含韩文（apply / 编辑写回须拒 hangul_in_japanese_line） */
export function jpVocabExampleHasHangul(text: string): boolean {
  return HANGUL_IN_JP_EXAMPLE_RE.test(String(text || ""));
}

/**
 * 译文行不得夹日语假名 / 整句日语（曾出现「译文：雨なら傘を忘れた。(あいなら…)」）。
 * 允许极少量拉丁数字；假名 ≥2 即拒。
 */
export function jpVocabExampleGlossLooksNonChinese(glossBody: string): boolean {
  const body = String(glossBody || "").trim();
  if (!body) return true;
  const kana = body.match(/[\u3040-\u30FFー]/g) || [];
  if (kana.length >= 2) return true;
  // 「译文：」后直接是日语助词句（无汉字假名括注时的纯假名已在上一档）
  // 含「なら／です／ます」等常见日语尾巴且汉字较多 → 当把日语塞进译文
  if (
    /[\u4E00-\u9FFF]{2,}/.test(body) &&
    /(?:なら|です|ます|した|して|から|ので|ください)/.test(body)
  ) {
    return true;
  }
  return false;
}

/** 模型常叠写日文标签「訳文：」→「译文：訳文：…」；写回须拒，展示层另有 strip */
export function jpVocabExampleGlossHasYakuwenLabel(glossLine: string): boolean {
  const t = String(glossLine || "").trim();
  if (!t) return false;
  if (/訳文\s*[:：]/.test(t)) return true;
  if (/译文\s*[:：]\s*訳文/.test(t)) return true;
  if (/^(訳|譯)\s*[:：]/.test(t) && !/^译文\s*[:：]/.test(t)) return true;
  return false;
}

/**
 * 「ながら／によると」后还有内容却未加読点「、」
 * （初学者例句须断开从句，避免「食べながらテレビ」粘成一团）
 */
const CLAUSE_CONNECTOR_MISSING_TOUTEN_RE =
  /(?:ながら|によると)(?=[^\s、。\n])/;

/** 句末须为 。！？… */
const SENTENCE_FINAL_PUNCT_RE = /[。！？…]$/;

/** 句中话题助词「は」个数（剥括号假名后；不含 早(はや) 等括号内は） */
export function countJpVocabExampleWaTopicMarkers(line: string): number {
  const plain = stripAllJpVocabParenBlocks(line);
  return (plain.match(/[\u3040-\u9FFF\u4E00-\u9FFF]は/g) || []).length;
}

/** 「ながら／によると」后接续内容时缺読点「、」 */
export function jpVocabExampleMissingClauseTouten(line: string): boolean {
  return CLAUSE_CONNECTOR_MISSING_TOUTEN_RE.test(line);
}

/** 日语例句缺句末标点（。！？…） */
export function jpVocabExampleMissingSentenceFinalPunct(line: string): boolean {
  const plain = stripAllJpVocabParenBlocks(line).trim();
  if (!plain) return false;
  return !SENTENCE_FINAL_PUNCT_RE.test(plain);
}

/**
 * 一类形容词过去式后再叠「でした」（双过去）。
 * ✅面白かったです／面白かったですね　❌面白かったでしたね
 * （名词／二类形容词才用「でした」；かった已含过去，后面只能接です）
 */
const I_ADJ_PAST_DESHITA_RE = /かったでした/;

export function jpVocabExampleHasIAdjPastDeshita(line: string): boolean {
  return I_ADJ_PAST_DESHITA_RE.test(stripAllJpVocabParenBlocks(line));
}

export type JpVocabExampleSentencesAiInput = {
  word: string;
  kind: string;
  reading?: string | null;
  meaning?: string | null;
  /** 语法条：编号用法；驱动例句条数（单用法→3；多用法→1:1） */
  usage?: string | null;
  /** 教材课次（如「标日初级上册第23课」）；例句勿超纲 */
  course_label?: string | null;
  /** 接序：单用法时按不同接续类型各造一例 */
  connection?: string | null;
};

/** 例句目标条数：语法看 usage；单用法→3 句（覆盖不同接续类型）；多用法→1:1；变形课无 usage 时固定 2 */
export function expectedJpVocabExampleSentenceCount(
  input: Pick<
    JpVocabExampleSentencesAiInput,
    "kind" | "meaning" | "usage" | "word"
  >
): number {
  if (input.kind === "grammar") {
    const n = countJpVocabUsagePoints(input.usage);
    if (n === 1) return 3;
    if (n >= 2) return n;
    if (isJpVocabConjugationGrammar(input.word)) return 2;
    return 3;
  }
  return countJpVocabExampleSentenceTargetFromMeaning(input.meaning, input.kind);
}

export function buildJpVocabExampleSentencesAiPrompt(
  input: JpVocabExampleSentencesAiInput
): string {
  const kindLabel = input.kind === "grammar" ? "语法" : "单词";
  const reading = input.reading?.trim();
  const meaning = input.meaning?.trim();
  const usage = input.usage?.trim();
  const connection = input.connection?.trim();
  const courseLabel = input.course_label?.trim();
  const { stem, hasDa } = jpVocabNaAdjParts(input.word);
  const stemReading = jpVocabNaAdjReadingForStem(reading || "", hasDa);
  const grammarCore = input.word
    .trim()
    .replace(/^[～~〜]+/, "")
    .replace(/[～~〜]+$/, "");
  const usagePointCount = countJpVocabUsagePoints(usage);
  const meta = [
    `词条：${input.word.trim()}`,
    input.kind === "grammar" && grammarCore
      ? `语法点：句中必须出现「${grammarCore}」（教助词时不要换成别的助词；例如「～が」不要写成只有「は」的句子）。词条里的「～」「〜」是占位符，禁止写进例句；请换成具体内容，如「天気予報によると…」「彼によると…」。若语法核是假名（如「あたり」「ところ」），优先写假名；写「辺り／所」亦可，但假名读音须正确（あたり≠へん）。`
      : null,
    jpVocabSukiKiraiParticlePromptHint(input.word),
    hasDa
      ? `造句用词干：${stem}（「だ」是な形容词辞书形词尾，例句里用「${stem}」即可，不必带「だ」）`
      : null,
    reading ? `读音：${reading}` : null,
    hasDa && stemReading
      ? `词干假名：${stemReading}（标在「${stem}」上，写成 ${stem}(${stemReading})）`
      : null,
    courseLabel
      ? `教材课次：${courseLabel}（例句难度对齐本课附近，禁止明显超纲：初级勿用中级专词／N2 难词）`
      : null,
    input.kind === "grammar" && usage ? `用法：\n${usage}` : null,
    input.kind === "grammar" && connection
      ? `接序（造句须覆盖不同接续类型）：\n${connection}`
      : null,
    input.kind !== "grammar" && meaning ? `释义：${meaning}` : null,
    `类型：${kindLabel}`,
  ]
    .filter(Boolean)
    .join("\n");

  const targetCount = expectedJpVocabExampleSentenceCount(input);
  const majorSenses = splitJpVocabMeaningMajorSenses(meaning || "");
  const countRuleHint =
    input.kind === "grammar"
      ? usagePointCount === 1
        ? `须造恰好 ${targetCount} 句：本语法只有 1 种用法，按接序里不同词类/形态各造一例（如一类形容词、二类形容词、名词等）；不足 3 种接续时仍造 3 句，换场景/词类，禁止三句同一接续`
        : `须造 ${targetCount} 句：与上方「用法」一一对应（第 1 句对应用法 1，第 2 句对应用法 2…）`
      : majorSenses.length >= 2
        ? `释义含 ${majorSenses.length} 个斜杠段 → 须造 ${targetCount} 句（每段 1 句，例句须体现对应读音）`
        : `须造 ${targetCount} 句（无斜杠时固定 2；释义里的 ； 只是近义，不要按近义数加句）`;

  const grammarSimplicity =
    input.kind === "grammar"
      ? `
简单句（语法必守，防多焦点）：
- 只用简单单词（N5～N4）；不要再塞另一个更难的语法点。
- 若需前后两句（如「あとで」），前后都用短句、简单词；不要后句突然变难。
- 焦点只有「本语法」本身；其余内容越短越好。
场景自洽（有头有尾，禁止无厘头）：
- 每条例句必须像一句完整的日常话：前提/条件与后半的结果、建议或判断能自然接上。
- ❌「来(く)るなら、どうぞ入(はい)ってください。」（「来的话请进」缺谁来、为何请进，听着别扭）
- ✅「雨(あめ)なら、傘(かさ)を持(も)っていってください。」（下雨→带伞，场景清楚）
- ✅「彼(かれ)が来(こ)ないなら、先(さき)に始(はじ)めましょう。」（既然不来→先开始）
- 不要为「塞进语法点」硬拼两个半截；学生读完应立刻明白在什么情况下说这句话。`
      : "";

  return `${meta}

请为上述日语${kindLabel}写例句，供 N5/N4 初学者复习朗读。

条数规则（必须遵守）：
- ${countRuleHint}
${
  input.kind === "grammar"
    ? "- 多用法时一句对应一种用法，不要两句都挤同一义项。"
    : `- 先读「释义」：含半角斜杠 / 时，斜杠分隔不同读音/大义项，每段造 1 句。
- 无斜杠时：先判断有几种常用用法；每种用法 1 句；仅 1 种用法则造 2 句（换场景）。
- 多用法时一句对应一种用法，不要两句都挤同一义项。
- 例：词条 前，读音 まえ/ぜん，释义 前面；以前/前面的；预先的 → 2 句：第 1 句用 まえ（駅の前），第 2 句用 ぜん（前日）。
- 例：词条 中，读音 なか/ちゅう，释义 中间；里面/正在进行 → 2 句：第 1 句 なか（箱の中），第 2 句 ちゅう（会議中）。`
}${grammarSimplicity}

格式要求：
1. JLPT N5～N4，日常口语，句子短（每句约 8～18 字）；优先简单、顺口的句式，避免初学者看了会怀疑写错的结构。
1b. **句中其它词也必须是最常见初级词**（人／家／駅／今日／いす／ドア／本 等）。禁止为了「讲清楚词义」硬塞科学/百科难词（地球・太陽・宇宙・政治・経済…），学生会看不懂整句。
   - ❌「地球(ちきゅう)は太陽(たいよう)の周(まわ)りを回(まわ)ります。」（地球・太陽对 N5 过难）
   - ✅「このいすは よく回(まわ)ります。」／「時計(とけい)の針(はり)が回(まわ)っています。」
2. 每条必须使用该词条（语法条须自然出现该语法点）。な形容词「〜だ」用词干，不要硬塞「だ」。
   单词：**每一句**日语都必须出现词条整词或读音假名，禁止只写更短的相关字、也禁止只在译文里写中文近义。
   - ❌词条「葉子／はっぱ」写成「葉(は)」（那是另一个词，读「は」不是「はっぱ」）→ ✅「葉子(はっぱ)」
   - ❌词条「事故」第二句只写「注意してほしい」、译文才写「意外」→ ✅句中出现「事故」
3. 一句尽量只用一个话题助词「は」。时间/场景已用「今は」「今日は」等时，主语用「が」或省略，不要叠两个「は」。
   - ❌「今(いま)は傘(かさ)は不要(ふよう)だ。」（语法虽对，N5 易误判）→ ✅「今(いま)は傘(かさ)が不要(ふよう)です。」或「傘(かさ)は要(い)りません。」
3a. 助词左右与相邻词之间留半角空格（初学者易把「はいくら」「は高い」看成一个词）：
   - ❌「給料(きゅうりょう)はいつ出(で)ますか。」→ ✅「給料(きゅうりょう) は いつ出(で)ますか。」
   - ❌「料金(りょうきん)はいくらですか。」→ ✅「料金(りょうきん) は いくらですか。」
   - ❌「料金(りょうきん)は高(たか)いです。」→ ✅「料金(りょうきん) は 高(たか)いです。」
   - ❌「先生(せんせい)はいつも丁寧(ていねい)です。」→ ✅「先生(せんせい) は いつも丁寧(ていねい)です。」
   - 适用：は/が/を/に/で/と/も/へ/の/や 后接 いつ・いつも・どこ・だれ・なに・とても・もう・まだ・すぐ・よく・ください 等
3b. 一类形容词过去式后接「です／ですね」，禁止再叠「でした」（双过去）：
   - ❌「面白(おもしろ)かったでしたね。」→ ✅「面白(おもしろ)かったですね。」
   - ✅名词／二类形容词：「出張(しゅっちょう)でしたね。」「静(しず)かでしたね。」
   - 教「～でしたね」时，一类形容词例句必须写「かったですね」，不要为了贴词条硬写成「かったでしたね」。
4. 语法词条的「～」「〜」禁止出现在例句里（那是词典占位符）。❌「～によると天気は晴れです」✅「天気予報(てんきよほう)によると、今日(きょう)は晴(は)れです」。
4b. **禁止韩文 Hangul（한글）**：日语例句只能是日语（汉字／假名／片假名）+ 必要标点；外来语用片假名。
   - ❌「この셔츠を着(き)ます。」（셔츠＝韩语）→ ✅「このシャツを着(き)ます。」
   - ❌「駅(えき)の近(ちか)く에 スーパーがあります。」（에＝韩语助词）→ ✅「駅(えき)の近(ちか)くに スーパーがあります。」
5. 假名标注必须全覆盖：句中**每一个汉字**后立刻半角括号假名，不能只标词条本身。
   - ❌「今日は気分(きぶん)がいいです。」（「今日」漏标，页面下方无假名）
   - ✅「今日(きょう)は気分(きぶん)がいいです。」
   - ❌「友達と話すと、気分(きぶん)が良くなります。」（友達/話/良 漏标）
   - ✅「友達(ともだち)と話(はな)すと、気分(きぶん)が良(よ)くなります。」
   - ❌「私の趣味(しゅみ)は音楽(おんがく)を聴(き)くことです。」（「私」漏标 → incomplete_kanji_furigana）
   - ✅「私(わたし)の趣味(しゅみ)は音楽(おんがく)を聴(き)くことです。」
   - 常见易漏汉字也要标：私(わたし)、今日(きょう)、何(なん)/何(なに)、人(ひと)、時(とき)
   - 词尾假名也算 base：静か(しずか)、落(お)ち着(つ)きます
   - 禁止整句尾注如「です。(たなかさん げんき です。)」；禁止句末语法说明括号
5b. ${JP_VOCAB_JUKUGO_FURIGANA_PROMPT_HINT}
6. 从句连接后必须加顿号「、」：
   - ❌「食(た)べながらテレビを見(み)る。」→ ✅「食(た)べながら、テレビを見(み)る。」
   - ❌「天気予報(てんきよほう)によると今日(きょう)は晴(は)れです。」→ ✅「…によると、今日(きょう)は…」
7. 每条日语必须以「。」「！」「？」或「…」结尾；可在句末标 JLPT 等级半角括号 (N5)/(N4)/(N3)，紧贴句末标点之后，如「…しました。(N5)」；不要写「JLPT」「能力考」字样。
8. 每条日语下一行写中文译义，必须以「译文：」开头。
8b. 禁止 A：／B：或「—」分行对话只配一条译文（会 missing_chinese_gloss）；感叹词／寒暄（こちらこそ、ううん）写成独立「日语+译文」单句：
   - ✅「こちらこそ、ありがとうございました。(N5)」下一行「译文：我才要谢谢您。」
   - ❌「A：「先日は…」(N5)\\nB：「こちらこそ」(N5)\\n译文：A：…B：…」
9. 中文必须是自然通顺的口语，禁止逐词硬译。
   - 「～について話す」→「我来谈谈学校」或「聊聊这个话题」，禁止「关于学校说话」。
   - 「～について知りたい」→「想了解一下…」，不要「关于…想知道」。
   - 「静かに話す」→「请小声说话／请轻声说」，禁止「请安静地说话」（中文听着像矛盾）。
   - 释义里的「关于……」只是语法义项提示，不要每句都机械套「关于…」。
9b. 「間／あいだ」（之间；中间）：须造「AとBの間」「～の間」类场景。
   - ❌「今、忙しい間です。」／译文「我现在很忙。」（把間当成状态，且没用到「之间／期间」）
   - ✅「本とノートの間に、ペンがあります。」／「会議の間、静かにしてください。」
   - 「の間に」= 在……之内／期间，禁止译成「……后」（❌一小时后 → ✅一小时内／开会期间）。
   9c. 「注意する」（小心／注意某事）接「に」：❌「約束を注意してください」→ ✅「約束に注意してください」／「車に注意します」。
   9d. 「相談する」：人に相談＝向/找某人商量；人と相談＝和某人一起商量。译文须对齐助词，勿对调。
   9e. 「好き／嫌い／大好き／大嫌い」对象接「が」，禁止用「は」：❌「魚は嫌いです」→ ✅「魚が嫌いです」。对比的「は」初学卡片不要写。
   9f. 「酷い／ひどい」禁止译成「可怕…」（可怕≈怖い）；应作「过分／糟糕／残酷」：❌「那是一个可怕的故事」→ ✅「这事也太过分了」。
10. 只输出「日语」行与下一行「译文：」+中文交替；「译文：」后直接写中文，禁止「译文：/ …」、日文「訳文：」叠标签或行首斜杠；不要行首编号、不要 markdown、不要解释、不要额外语法说明。
${
  input.kind === "grammar"
    ? ""
    : `11. 相关构词（助记，与例句等同一次输出，勿另开请求）：没有自然相关词就不要写（填空/省略即可，禁止硬凑）；只有 1～2 个就写 1～2；多则最多 4～5 行「漢字(かな)：中文｜词性」；【词性·必填】行末全角「｜」接名词/他动词/自动词/动词/い形容词/な形容词/副词等（例：迎え(むかえ)：迎接｜名词；出迎える(でむかえる)：出去迎接｜他动词）；须含本词汉字；单汉字须同读（允许连浊くち→ぐち、こと→ごと；禁止不同音读，如事=こと勿写食事/大事的「じ」）；多字词先拆部件再举同旁词（会社員→会社(かいしゃ)：公司｜名词、店員(てんいん)：店员｜名词）；【禁止本词】不要把词条本身再写进相关构词（研修生≠再写研修生）；一词多义用中文逗号「，」（目上：上级，长辈｜名词），释义里禁止用「；」；优先 N5～N4（口→入口(いりぐち)：入口｜名词）；假名须正确；禁止商务难词。`
}
${jpVocabConnectionPromptAppendix(input.kind === "grammar" ? "grammar" : "word")}`;
}

/**
 * 语法假名核是否在例句中出现（含词干截断 + 常见汉字表记）。
 * 例：あたり ↔ 辺り；ところ ↔ 所（避免模型写汉字却被 grammar_not_used 误拒）。
 */
const JP_VOCAB_GRAMMAR_KANA_KANJI_ALIASES: Record<string, readonly string[]> = {
  あたり: ["辺り"],
  ところ: ["所", "処"],
};

/** 语法核前导格助词（～と会います → と）；须在例句里出现。 */
const JP_VOCAB_GRAMMAR_LEADING_PARTICLE_RE = /^([とにをがでへもや])/;

/**
 * ～と会います 等「汉字＋ます」语法核：勿只抽尾假名「います」（会误拒 会いました／会いに）。
 * 返回可命中的表面形（会います／会い／会う／会っ…）。
 */
export function jpVocabGrammarKanjiMasuSurfaces(core: string): string[] {
  const c = String(core || "").trim();
  if (!c || !/[\u4E00-\u9FFF]/.test(c)) return [];
  const m = c.match(
    /[\u4E00-\u9FFF々][\u4E00-\u9FFF々\u3040-\u309Fー]*ます/
  );
  if (!m) return [];
  const masu = m[0];
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (s: string) => {
    const t = s.trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };
  push(masu);
  push(masu.slice(0, -2)); // 会い（ます词干；亦覆盖 会いに／会いました）
  const { dictionary, wasMasu } = jpVerbMasuToDictionaryForm(masu);
  if (!wasMasu || !dictionary) return out;
  push(dictionary);
  if (dictionary.endsWith("う") && dictionary.length >= 2) {
    const base = dictionary.slice(0, -1);
    push(`${base}っ`);
    push(`${base}わ`);
    push(`${base}え`);
    push(`${base}お`);
  } else if (dictionary.endsWith("る") && dictionary.length >= 2) {
    push(dictionary.slice(0, -1));
  } else if (/[くぐ]$/.test(dictionary) && dictionary.length >= 2) {
    push(`${dictionary.slice(0, -1)}い`);
  } else if (dictionary.endsWith("す") && dictionary.length >= 2) {
    push(`${dictionary.slice(0, -1)}し`);
  } else if (dictionary.endsWith("つ") && dictionary.length >= 2) {
    push(`${dictionary.slice(0, -1)}っ`);
  } else if (/[ぬぶむ]$/.test(dictionary) && dictionary.length >= 2) {
    push(`${dictionary.slice(0, -1)}ん`);
  }
  return out;
}

export function jpVocabGrammarLemmaAppearsInExamples(
  kanaRun: string,
  combinedPlain: string,
  combinedRaw: string
): boolean {
  const n = String(kanaRun || "").trim();
  if (!n) return false;
  const variants = [n];
  if (n.length >= 3) variants.push(n.slice(0, -1));
  // ～ようにする／～ようにします：辞书形核在ます形里变成「…し」
  if (n.endsWith("する") && n.length >= 4) {
    variants.push(`${n.slice(0, -2)}し`);
  }
  // ～ことができる／できます
  if (n.endsWith("できる") && n.length >= 5) {
    variants.push(`${n.slice(0, -3)}でき`);
  }
  // ～ています → ている／てる（辞书形叙述）
  if (n.endsWith("ています") && n.length >= 4) {
    variants.push(`${n.slice(0, -3)}いる`);
    variants.push(`${n.slice(0, -3)}る`);
  }
  for (const v of variants) {
    if (combinedPlain.includes(v) || combinedRaw.includes(v)) return true;
    const aliases = JP_VOCAB_GRAMMAR_KANA_KANJI_ALIASES[v];
    if (aliases?.some((a) => combinedPlain.includes(a) || combinedRaw.includes(a))) {
      return true;
    }
  }
  // のあたり → 核末段 あたり 也认汉字表记
  for (const [kana, aliases] of Object.entries(JP_VOCAB_GRAMMAR_KANA_KANJI_ALIASES)) {
    if (n.endsWith(kana) && aliases.some((a) => combinedPlain.includes(a))) {
      return true;
    }
  }
  return false;
}

/** 例句按假名括注展成全假名串（会場(かいじょう)→かいじょう），供假名词条与汉字例句互认。 */
function jpVocabExampleLineKanaPlain(line: string): string {
  let s = String(line || "");
  s = s.replace(
    new RegExp(
      JP_VOCAB_PAREN_FURIGANA_RE.source,
      JP_VOCAB_PAREN_FURIGANA_RE.flags
    ),
    "$2"
  );
  s = stripAllJpVocabParenBlocks(s);
  s = s.replace(/[\u4E00-\u9FFF々]/g, "");
  return s.replace(/\s+/g, "").replace(/\(N[1-5]\)/gi, "");
}

/** 敬语接头辞词条（お～／ご～）：例句里 お名前・ご飯 等算用到。 */
function jpVocabLemmaHonorificPrefix(word: string): "お" | "ご" | null {
  const core = String(word || "")
    .replace(/[～~〜]/g, "")
    .trim();
  if (!core) return null;
  if (core === "お" || word.startsWith("お")) return "お";
  if (core === "ご" || word.startsWith("ご")) return "ご";
  return null;
}

function jpVocabExampleLineUsesHonorificPrefix(
  line: string,
  prefix: "お" | "ご"
): boolean {
  const plain = stripAllJpVocabParenBlocks(String(line || ""));
  return new RegExp(
    `${prefix}[\\u4E00-\\u9FFF\\u3040-\\u309F\\u30A0-\\u30FF]`
  ).test(plain);
}

/**
 * 单条例句是否用到词条。单词须每句单独命中（禁止第一句写「事故」、第二句只写「注意／意外」靠拼文过关）。
 * 多字词须整词或读音活用，禁止只靠首字（事故≠仕事里的「事」）。
 */
export function jpVocabExampleLineUsesLemma(
  japaneseLine: string,
  input: Pick<JpVocabExampleSentencesAiInput, "word" | "kind" | "reading">
): boolean {
  const target = String(input.word || "").trim();
  const combined = String(japaneseLine || "");
  const combinedPlain = stripAllJpVocabParenBlocks(combined);
  if (!target || !combinedPlain) return false;

  if (input.kind === "grammar") {
    const core = target.replace(/^[～~〜]+/, "").replace(/[～~〜]+$/, "");
    // ～と会います：汉字ます核优先（勿只认尾假名「います」）
    const kanjiMasu = jpVocabGrammarKanjiMasuSurfaces(core);
    if (kanjiMasu.length > 0) {
      const hit = kanjiMasu.some(
        (s) => combinedPlain.includes(s) || combined.includes(s)
      );
      if (!hit) return false;
      const lead = core.match(JP_VOCAB_GRAMMAR_LEADING_PARTICLE_RE);
      if (lead && !combinedPlain.includes(lead[1])) return false;
      return true;
    }
    const allKana = core.match(/[\u3040-\u30FFー]+/g) || [];
    const longKana = allKana
      .filter((run) => run.length >= 2)
      .sort((a, b) => b.length - a.length);
    if (longKana.length > 0) {
      return longKana.some((n) =>
        jpVocabGrammarLemmaAppearsInExamples(n, combinedPlain, combined)
      );
    }
    if (core && !/[\u4E00-\u9FFF]/.test(core)) {
      return combinedPlain.includes(core) || combinedPlain.includes(target);
    }
    // 「て形变形」等中文教学标题：不硬卡
    return true;
  }

  const surfaces = lemmaSurfacesForExampleHit(target, input.reading);
  // sanitize 会在助词左右插空格（一緒 に…），比对须去空白，否则「一緒にお願いし」整词误拒 word_not_used（id=118）
  const compactPlain = combinedPlain.replace(/\s+/g, "");
  const compactRaw = combined.replace(/\s+/g, "");
  if (
    surfaces.some((s) => {
      const needle = s.replace(/\s+/g, "");
      return (
        Boolean(needle) &&
        (compactPlain.includes(needle) ||
          compactRaw.includes(needle) ||
          combinedPlain.includes(s) ||
          combined.includes(s))
      );
    })
  ) {
    return true;
  }
  const honorific = jpVocabLemmaHonorificPrefix(target);
  if (honorific && jpVocabExampleLineUsesHonorificPrefix(combined, honorific)) {
    return true;
  }
  const kanaPlain = jpVocabExampleLineKanaPlain(combined);
  if (kanaPlain) {
    const compactKana = kanaPlain.replace(/\s+/g, "");
    for (const part of [
      ...splitJpVocabLemmaSlashParts(target),
      ...splitJpVocabLemmaSlashParts(input.reading || ""),
    ]) {
      const norm = part.replace(/\s+/g, "");
      if (norm.length >= 2 && (compactKana.includes(norm) || kanaPlain.includes(norm))) {
        return true;
      }
    }
    // ～する 读音活用：いっしょにおねがいし ⊂ いっしょうにおねがいします（去空白后）
    for (const s of surfaces) {
      const needle = s.replace(/\s+/g, "");
      if (needle.length >= 2 && compactKana.includes(needle)) return true;
    }
  }
  const { stem } = jpVocabNaAdjParts(target);
  const kans = (stem.match(/[\u4E00-\u9FFF]/g) || []).join("");
  return Boolean(
    kans &&
      (compactPlain.includes(kans) ||
        compactRaw.includes(kans) ||
        combinedPlain.includes(kans) ||
        combined.includes(kans))
  );
}

/** 校验 AI 返回的例句块是否可用 */
export function validateJpVocabExampleSentencesAiOutput(
  raw: string,
  input: JpVocabExampleSentencesAiInput
): { ok: true; text: string } | { ok: false; reason: string } {
  // 接序段不参与例句行数校验；调用方应先 split 出 connection
  const split = splitJpVocabAiOutputConnectionSection(String(raw ?? ""));
  const text = split.body.trim();
  if (!text) return { ok: false, reason: "empty" };

  if (input.kind === "grammar" && countJpVocabUsagePoints(input.usage) < 1) {
    if (!isJpVocabConjugationGrammar(input.word)) {
      return { ok: false, reason: "usage_required" };
    }
  }

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const targetCount = expectedJpVocabExampleSentenceCount(input);
  const isConj =
    input.kind === "grammar" && isJpVocabConjugationGrammar(input.word);
  const minLines = isConj
    ? 4
    : input.kind === "grammar"
      ? Math.max(2, targetCount * 2)
      : Math.max(4, targetCount * 2);
  if (lines.length < minLines) {
    // 历史原因码 need_four_lines（单词下限 4 行=2 句）；条数>2 时用更准的名字
    return {
      ok: false,
      reason: minLines <= 4 ? "need_four_lines" : "need_more_lines",
    };
  }

  const items = parseJpVocabExampleSentenceItems(lines.join("\n"));
  if (items.length < targetCount) {
    return { ok: false, reason: "need_more_japanese_lines" };
  }
  const cappedItems =
    isConj && items.length > 3 ? items.slice(0, 3) : items;
  if (input.kind !== "grammar" && cappedItems.length < 2) {
    return { ok: false, reason: "need_two_japanese_lines" };
  }

  const cleanedItems = cappedItems.map((item) => ({
    ...item,
    text: sanitizeJpVocabExampleJapaneseLine(item.text),
  }));

  for (const item of cleanedItems) {
    if (!item.text || !isJpVocabExampleJapaneseLine(item.text)) {
      return {
        ok: false,
        reason: jpVocabExampleLooksLikeChineseTeachingProse(item.text)
          ? "chinese_prose_in_japanese_line"
          : "invalid_japanese_line",
      };
    }
    if (LEMMA_PLACEHOLDER_WAVE_RE.test(stripAllJpVocabParenBlocks(item.text))) {
      return { ok: false, reason: "lemma_placeholder_in_sentence" };
    }
    if (jpVocabExampleHasHangul(item.text)) {
      return { ok: false, reason: "hangul_in_japanese_line" };
    }
    if (jpVocabExampleHasInvalidFuriganaParen(item.text)) {
      return { ok: false, reason: "bad_furigana_paren" };
    }
    if (jpVocabExampleHasUnannotatedKanji(item.text)) {
      const missing = listJpVocabUnannotatedKanji(item.text);
      const suffix = missing.length > 0 ? `:${missing.join("")}` : "";
      return { ok: false, reason: `incomplete_kanji_furigana${suffix}` };
    }
    if (jpVocabExampleHasWrongJukugoFurigana(item.text)) {
      return { ok: false, reason: "wrong_jukugo_furigana" };
    }
    if (item.glossLines.length === 0 || !isJpVocabExampleGlossLine(item.glossLines[0])) {
      return { ok: false, reason: "missing_chinese_gloss" };
    }
    if (jpVocabExampleGlossHasYakuwenLabel(item.glossLines[0])) {
      return { ok: false, reason: "gloss_has_yakuwen_label" };
    }
    const glossBody = item.glossLines[0].replace(/^(译文|翻譯|翻译|译|譯)\s*[:：]\s*/, "");
    if (jpVocabExampleHasLiteralChineseGloss(glossBody)) {
      return { ok: false, reason: "literal_chinese_gloss" };
    }
    if (jpVocabExampleGlossLooksNonChinese(glossBody)) {
      return { ok: false, reason: "gloss_not_chinese" };
    }
    if (jpVocabExampleHasAidaFakeStatePredicate(item.text, glossBody)) {
      return { ok: false, reason: "aida_fake_state_predicate" };
    }
    if (jpVocabExampleGlossTreatsAidaNiAsAfter(item.text, glossBody)) {
      return { ok: false, reason: "gloss_aida_ni_as_after" };
    }
    if (jpVocabExampleHasChuuiSuruWoParticle(item.text, input.word)) {
      return { ok: false, reason: "chuui_suru_wo_particle" };
    }
    if (jpVocabExampleHasSukiKiraiWaParticle(item.text, input.word)) {
      return { ok: false, reason: "suki_kirai_wa_particle" };
    }
    if (
      jpVocabExampleHasSoudanParticleGlossMismatch(
        item.text,
        glossBody,
        input.word
      )
    ) {
      return { ok: false, reason: "soudan_particle_gloss_mismatch" };
    }
    if (jpVocabExampleHasHidoiKowaiGlossMismatch(glossBody, input.word)) {
      return { ok: false, reason: "hidoi_kowai_gloss" };
    }
    if (
      input.kind !== "grammar" &&
      countJpVocabExampleWaTopicMarkers(item.text) >= 2
    ) {
      return { ok: false, reason: "double_wa_topic" };
    }
    if (jpVocabExampleHasIAdjPastDeshita(item.text)) {
      return { ok: false, reason: "i_adj_past_deshita" };
    }
    if (jpVocabExampleMissingClauseTouten(item.text)) {
      return { ok: false, reason: "missing_clause_touten" };
    }
    if (jpVocabExampleMissingSentenceFinalPunct(item.text)) {
      return { ok: false, reason: "missing_sentence_final_punct" };
    }
    if (!jpVocabExampleLineUsesLemma(item.text, input)) {
      return {
        ok: false,
        reason: input.kind === "grammar" ? "grammar_not_used" : "word_not_used",
      };
    }
  }

  if (input.kind === "grammar" && !isConj) {
    const align = validateJpVocabUsageExamplePairAlignment({
      word: input.word.trim(),
      kind: "grammar",
      usage: input.usage,
      example_sentences: serializeJpVocabExampleSentenceItems(cleanedItems),
    });
    if (!align.ok) return { ok: false, reason: align.reason };
  }

  return {
    ok: true,
    text: serializeJpVocabExampleSentenceItems(cleanedItems),
  };
}

/**
 * 线上付费 batch 写回：sanitize + 保留 JLPT (N5) 尾标。
 * **必须**拒漏标汉字 / 非法括注（与本地 STT 同级）；曾因放行导致页面汉字无下方假名。
 * 缺顿号等其它本地细则仍可略宽；完整校验走 validateJpVocabExampleSentencesAiOutput。
 */
export function normalizeJpVocabExampleSentencesForOnlineApply(
  raw: string,
  input: JpVocabExampleSentencesAiInput
): { ok: true; text: string } | { ok: false; reason: string } {
  const split = splitJpVocabAiOutputConnectionSection(String(raw ?? ""));
  const text = split.body.trim();
  if (!text) return { ok: false, reason: "empty" };

  const items = parseJpVocabExampleSentenceItems(text)
    .map((item) => ({
      text: sanitizeJpVocabExampleJapaneseLine(item.text),
      glossLines: item.glossLines
        .map((g) => formatJpVocabExampleGlossLine(g))
        .filter(Boolean),
    }))
    .filter((item) => item.text.trim());

  if (items.length < 1) {
    return { ok: false, reason: "need_japanese_lines" };
  }
  if (input.kind !== "grammar" && items.length < 2) {
    return { ok: false, reason: "need_two_japanese_lines" };
  }

  // 「訳文：」已由 formatJpVocabExampleGlossLine 剥成「译文：」；
  // 付费 batch 写库前 salvage，勿因标签字面拒掉可用例句（Mac 脚本亦会先 normalize）。
  // 严格 validate 路径仍拒原始「訳文：」，逼本地模型别叠日文标签。

  for (const item of items) {
    if (!item.text || !isJpVocabExampleJapaneseLine(item.text)) {
      return { ok: false, reason: "invalid_japanese_line" };
    }
    if (
      LEMMA_PLACEHOLDER_WAVE_RE.test(stripAllJpVocabParenBlocks(item.text))
    ) {
      return { ok: false, reason: "lemma_placeholder_in_sentence" };
    }
    if (jpVocabExampleHasHangul(item.text)) {
      return { ok: false, reason: "hangul_in_japanese_line" };
    }
    if (jpVocabExampleHasInvalidFuriganaParen(item.text)) {
      return { ok: false, reason: "bad_furigana_paren" };
    }
    if (jpVocabExampleHasUnannotatedKanji(item.text)) {
      const missing = listJpVocabUnannotatedKanji(item.text);
      const suffix = missing.length > 0 ? `:${missing.join("")}` : "";
      return { ok: false, reason: `incomplete_kanji_furigana${suffix}` };
    }
    if (jpVocabExampleHasWrongJukugoFurigana(item.text)) {
      return { ok: false, reason: "wrong_jukugo_furigana" };
    }
    if (item.glossLines.length === 0) {
      return { ok: false, reason: "missing_chinese_gloss" };
    }
    // format 后应为「译文：…」；若仍检出日文标签则异常
    if (jpVocabExampleGlossHasYakuwenLabel(item.glossLines[0])) {
      return { ok: false, reason: "gloss_has_yakuwen_label" };
    }
    const glossBody = item.glossLines[0].replace(
      /^(译文|翻譯|翻译|译|譯)\s*[:：]\s*/,
      ""
    );
    if (jpVocabExampleHasLiteralChineseGloss(glossBody)) {
      return { ok: false, reason: "literal_chinese_gloss" };
    }
    if (jpVocabExampleGlossLooksNonChinese(glossBody)) {
      return { ok: false, reason: "gloss_not_chinese" };
    }
    if (jpVocabExampleHasAidaFakeStatePredicate(item.text, glossBody)) {
      return { ok: false, reason: "aida_fake_state_predicate" };
    }
    if (jpVocabExampleGlossTreatsAidaNiAsAfter(item.text, glossBody)) {
      return { ok: false, reason: "gloss_aida_ni_as_after" };
    }
    if (jpVocabExampleHasChuuiSuruWoParticle(item.text, input.word)) {
      return { ok: false, reason: "chuui_suru_wo_particle" };
    }
    if (jpVocabExampleHasSukiKiraiWaParticle(item.text, input.word)) {
      return { ok: false, reason: "suki_kirai_wa_particle" };
    }
    if (
      jpVocabExampleHasSoudanParticleGlossMismatch(
        item.text,
        glossBody,
        input.word
      )
    ) {
      return { ok: false, reason: "soudan_particle_gloss_mismatch" };
    }
    if (jpVocabExampleHasHidoiKowaiGlossMismatch(glossBody, input.word)) {
      return { ok: false, reason: "hidoi_kowai_gloss" };
    }
    if (jpVocabExampleHasIAdjPastDeshita(item.text)) {
      return { ok: false, reason: "i_adj_past_deshita" };
    }
    if (!jpVocabExampleLineUsesLemma(item.text, input)) {
      return {
        ok: false,
        reason: input.kind === "grammar" ? "grammar_not_used" : "word_not_used",
      };
    }
  }

  return {
    ok: true,
    text: serializeJpVocabExampleSentenceItems(items),
  };
}
