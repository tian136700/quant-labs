/**
 * 熟语假名：须整词标注（出発(しゅっぱつ)），禁止训读拆字（出(で)発(ぱつ)）；
 * 且读音须正确（含连浊：入口(いりぐち) 非 いりくち）。
 * apply / 线上 normalize 拒 wrong_jukugo_furigana。
 */

/** N5～N4 常见熟语 → 正确整词读音（平假名；含须连浊者） */
export const JP_VOCAB_JUKUGO_READING: Record<string, string> = {
  出発: "しゅっぱつ",
  到着: "とうちゃく",
  入学: "にゅうがく",
  卒業: "そつぎょう",
  食事: "しょくじ",
  会社: "かいしゃ",
  電車: "でんしゃ",
  時間: "じかん",
  // 「何時ですか」问几点：なんじ（じ＝时）；禁止古文/误读 なんどき
  何時: "なんじ",
  日本語: "にほんご",
  日本人: "にほんじん",
  図書館: "としょかん",
  国旗: "こっき",
  火事: "かじ",
  消防車: "しょうぼうしゃ",
  消防士: "しょうぼうし",
  右側: "みぎがわ",
  左側: "ひだりがわ",
  右手: "みぎて",
  左手: "ひだりて",
  自転車: "じてんしゃ",
  土曜日: "どようび",
  日曜日: "にちようび",
  月曜日: "げつようび",
  火曜日: "かようび",
  水曜日: "すいようび",
  木曜日: "もくようび",
  金曜日: "きんようび",
  説明: "せつめい",
  練習: "れんしゅう",
  勉強: "べんきょう",
  旅行: "りょこう",
  宿題: "しゅくだい",
  試験: "しけん",
  新聞: "しんぶん",
  映画: "えいが",
  写真: "しゃしん",
  電話: "でんわ",
  電気: "でんき",
  家族: "かぞく",
  先生: "せんせい",
  学生: "がくせい",
  学校: "がっこう",
  病院: "びょういん",
  銀行: "ぎんこう",
  空港: "くうこう",
  心配: "しんぱい",
  大切: "たいせつ",
  有名: "ゆうめい",
  便利: "べんり",
  簡単: "かんたん",
  必要: "ひつよう",
  理由: "りゆう",
  準備: "じゅんび",
  約束: "やくそく",
  // 连浊（浊化）：后字清音 → 浊音；禁止把 くち 硬标成无浊
  入口: "いりぐち",
  入り口: "いりぐち",
  出口: "でぐち",
  悪口: "わるぐち",
  窓口: "まどぐち",
  山口: "やまぐち",
  手紙: "てがみ",
  花火: "はなび",
  金魚: "きんぎょ",
  鼻血: "はなぢ",
  川岸: "かわぎし",
  人々: "ひとびと",
  時々: "ときどき",
  国々: "くにぐに",
};

const SINGLE_KANJI_FURI_CHUNK_RE =
  /([\u4E00-\u9FFF々])[（(]([ぁ-んァ-ンヴヵヶー]+)[）)]/g;

const CONSEC_SINGLE_KANJI_RUN_RE =
  /(?:[\u4E00-\u9FFF々][（(][ぁ-んァ-ンヴヵヶー]+[）)]){2,}/g;

/** 整词括注：入口(いりくち) / 入口（いりくち） */
const WHOLE_JUKUGO_FURI_RE =
  /([\u4E00-\u9FFF々]{2,4})[（(]([ぁ-んァ-ンヴヵヶー]+)[）)]/g;

function toHiragana(text: string): string {
  return String(text || "")
    .replace(/[ァ-ン]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .replace(/[^ぁ-んー]/g, "");
}

/**
 * 检测例句日语行是否把熟语错拆成单字假名，或整词标错读（含漏连浊）。
 * 例：出(で)発(ぱつ) → でぱつ ≠ しゅっぱつ
 * 例：入口(いりくち) ≠ いりぐち
 */
export function jpVocabExampleHasWrongJukugoFurigana(text: string): boolean {
  const s = String(text || "");
  if (!s) return false;

  for (const runMatch of s.matchAll(CONSEC_SINGLE_KANJI_RUN_RE)) {
    const run = runMatch[0]!;
    const parts: Array<{ kanji: string; reading: string }> = [];
    SINGLE_KANJI_FURI_CHUNK_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    const re = new RegExp(
      SINGLE_KANJI_FURI_CHUNK_RE.source,
      SINGLE_KANJI_FURI_CHUNK_RE.flags
    );
    while ((m = re.exec(run)) !== null) {
      parts.push({ kanji: m[1]!, reading: toHiragana(m[2]!) });
    }
    if (parts.length < 2) continue;

    for (let len = 2; len <= Math.min(parts.length, 4); len++) {
      for (let i = 0; i <= parts.length - len; i++) {
        const surface = parts
          .slice(i, i + len)
          .map((p) => p.kanji)
          .join("");
        const expected = JP_VOCAB_JUKUGO_READING[surface];
        if (!expected) continue;
        const split = parts
          .slice(i, i + len)
          .map((p) => p.reading)
          .join("");
        if (split !== expected) return true;
      }
    }
  }

  // 整词标错：入口(いりくち)、手紙(てかみ)
  WHOLE_JUKUGO_FURI_RE.lastIndex = 0;
  for (const wm of s.matchAll(WHOLE_JUKUGO_FURI_RE)) {
    const surface = wm[1]!;
    const reading = toHiragana(wm[2]!);
    const expected = JP_VOCAB_JUKUGO_READING[surface];
    if (!expected) continue;
    if (reading !== expected) return true;
  }

  // 消防(しょうぼう)車(しょうぼうしゃ)：后字括注吞掉整词读音
  for (const [surface, reading] of Object.entries(JP_VOCAB_JUKUGO_READING)) {
    if (surface.length < 2) continue;
    const head = surface.slice(0, -1);
    const tail = surface.slice(-1);
    const swallow = new RegExp(
      `${escapeRegExp(head)}[（(][^）)]*[）)]${escapeRegExp(tail)}[（(]${escapeRegExp(reading)}[）)]`
    );
    if (swallow.test(s)) return true;
  }

  return false;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** prompt / 规则用的短示例 */
export const JP_VOCAB_JUKUGO_FURIGANA_PROMPT_HINT = `熟语必须整词标假名，禁止按训读拆开；读音须正确（该连浊的必须浊化）：
   - ✅「出発(しゅっぱつ)」「日本語(にほんご)」「土曜日(どようび)」「図書館(としょかん)」
   - ❌「出(で)発(ぱつ)」（しゅっぱつ 被拆成 で+ぱつ）
   - ❌「日本(にっぽん)語(ご)」「土曜(どよう)日(ひ)」「消防(しょうぼう)車(しょうぼうしゃ)」
   - 连浊：✅「入口(いりぐち)」「出口(でぐち)」「手紙(てがみ)」；❌「入口(いりくち)」「出口(でくち)」「手紙(てかみ)」（该浊却标成清音，会误导学生）
   - 问几点：✅「何時(なんじ)ですか」；❌「何時(なんどき)」（时＝じ，不是どき）`;
