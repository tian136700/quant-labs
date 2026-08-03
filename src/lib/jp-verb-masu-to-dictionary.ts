/**
 * 日语动词ます形 → 辞书形（原形）。
 * 新课入库抽问时用；非ます形原样返回。
 *
 * 例：食べます→食べる、行きます→行く、勉強します→勉強する、話します→話す
 */

/** 常见例外（含看起来像一类却是二类、或特殊词） */
const MASU_TO_DICTIONARY_EXCEPTIONS: Record<string, string> = {
  します: "する",
  来ます: "来る",
  きます: "くる",
  あります: "ある",
  います: "いる",
  見ます: "見る",
  みます: "みる",
  着ます: "着る",
  借ります: "借りる",
  降ります: "降りる",
  足ります: "足りる",
  浴びます: "浴びる",
  できます: "できる",
  寝ます: "寝る",
  ねます: "ねる",
  出ます: "出る",
  でます: "でる",
  愛します: "愛する",
};

/** い段假名 → 辞书形う段 */
const I_ROW_TO_U_ROW: Record<string, string> = {
  い: "う",
  き: "く",
  ぎ: "ぐ",
  し: "す",
  ち: "つ",
  に: "ぬ",
  び: "ぶ",
  み: "む",
  り: "る",
};

/** え段假名（二类：词干+る） */
const E_ROW = new Set(
  Array.from("えけげせぜてでねへべぺめれエケゲセゼテデネヘベペメレ")
);

export type JpVerbMasuToDictionaryResult = {
  /** 写入抽问用的词形 */
  dictionary: string;
  /** 原文是否以ます结尾并完成转换 */
  wasMasu: boolean;
};

/**
 * ます形 → 辞书形。
 * - 食べます → 食べる
 * - 行きます → 行く
 * - 勉強します → 勉強する
 * - 話します → 話す
 * - 非ます形 / 语法条目：原样
 */
export function jpVerbMasuToDictionaryForm(
  raw: string
): JpVerbMasuToDictionaryResult {
  const word = (raw || "").trim();
  if (!word) return { dictionary: "", wasMasu: false };
  if (!/ます$/u.test(word)) {
    return { dictionary: word, wasMasu: false };
  }

  const hit = MASU_TO_DICTIONARY_EXCEPTIONS[word];
  if (hit) return { dictionary: hit, wasMasu: true };

  // 二字以上汉字/片名词干 + します → 三类（勉強します→勉強する）
  // 单字汉字 + します 多为一类す动词（話します→話す），走后面い段规则
  if (word.endsWith("します") && word.length > 3) {
    const before = word.slice(0, -3);
    if (/^[\u4E00-\u9FFF々ァ-ヶー]{2,}$/u.test(before)) {
      return { dictionary: `${before}する`, wasMasu: true };
    }
  }

  if (word.endsWith("来ます") && word.length > 3) {
    const before = word.slice(0, -3);
    return { dictionary: `${before}来る`, wasMasu: true };
  }

  const stem = word.slice(0, -2); // 去掉「ます」
  if (!stem) return { dictionary: word, wasMasu: false };

  const last = stem.charAt(stem.length - 1);
  if (E_ROW.has(last)) {
    return { dictionary: `${stem}る`, wasMasu: true };
  }

  const uRow = I_ROW_TO_U_ROW[last];
  if (uRow) {
    return { dictionary: `${stem.slice(0, -1)}${uRow}`, wasMasu: true };
  }

  // 词干末字无法归类时按二类处理
  return { dictionary: `${stem}る`, wasMasu: true };
}

/** 新课跳过入库备注正文（含辞书形）；用于幂等检测 */
export const JP_LESSON_VOCAB_SKIP_NOTE_MARK = "本条已跳过，未重复入库";

export function buildJpLessonVocabSkipNoteBody(dictionaryForm: string): string {
  const form = (dictionaryForm || "").trim() || "该词";
  return `日语抽问已有「${form}」，${JP_LESSON_VOCAB_SKIP_NOTE_MARK}。`;
}
