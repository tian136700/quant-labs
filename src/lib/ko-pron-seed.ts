/** 常见教学用 40 个韩语字母（자모）：基本辅音 + 双辅音 + 单元音 + 双元音
 *  只种进 `ko_pron_catalog`（韩语发音勾选）；禁止直接种进抽问表 `ko_pron_letter`。
 */

/** 分类筛选项（与种子 category 字段一致） */
export const KO_PRON_CATEGORIES = [
  "辅音",
  "双辅音",
  "单元音",
  "双元音",
] as const;

export type KoPronCategory = (typeof KO_PRON_CATEGORIES)[number];

export type KoPronSeedLetter = {
  letter: string;
  reading: string;
  meaning: string;
  category: KoPronCategory;
};

export const KO_PRON_SEED_LETTERS: KoPronSeedLetter[] = [
  // 基本辅音 14
  { letter: "ㄱ", reading: "기역 / g·k", meaning: "基本辅音", category: "辅音" },
  { letter: "ㄴ", reading: "니은 / n", meaning: "基本辅音", category: "辅音" },
  { letter: "ㄷ", reading: "디귿 / d·t", meaning: "基本辅音", category: "辅音" },
  { letter: "ㄹ", reading: "리을 / r·l", meaning: "基本辅音", category: "辅音" },
  { letter: "ㅁ", reading: "미음 / m", meaning: "基本辅音", category: "辅音" },
  { letter: "ㅂ", reading: "비읍 / b·p", meaning: "基本辅音", category: "辅音" },
  { letter: "ㅅ", reading: "시옷 / s", meaning: "基本辅音", category: "辅音" },
  { letter: "ㅇ", reading: "이응 / ng·silent", meaning: "基本辅音（词首无声）", category: "辅音" },
  { letter: "ㅈ", reading: "지읒 / j", meaning: "基本辅音", category: "辅音" },
  { letter: "ㅊ", reading: "치읓 / ch", meaning: "基本辅音", category: "辅音" },
  { letter: "ㅋ", reading: "키읔 / k", meaning: "基本辅音", category: "辅音" },
  { letter: "ㅌ", reading: "티읕 / t", meaning: "基本辅音", category: "辅音" },
  { letter: "ㅍ", reading: "피읖 / p", meaning: "基本辅音", category: "辅音" },
  { letter: "ㅎ", reading: "히읗 / h", meaning: "基本辅音", category: "辅音" },
  // 双辅音 5
  { letter: "ㄲ", reading: "쌍기역 / kk", meaning: "双辅音", category: "双辅音" },
  { letter: "ㄸ", reading: "쌍디귿 / tt", meaning: "双辅音", category: "双辅音" },
  { letter: "ㅃ", reading: "쌍비읍 / pp", meaning: "双辅音", category: "双辅音" },
  { letter: "ㅆ", reading: "쌍시옷 / ss", meaning: "双辅音", category: "双辅音" },
  { letter: "ㅉ", reading: "쌍지읒 / jj", meaning: "双辅音", category: "双辅音" },
  // 单元音 10（ㅏㅑㅓㅕㅗㅛㅜㅠㅡㅣ）
  { letter: "ㅏ", reading: "아 / a", meaning: "单元音", category: "单元音" },
  { letter: "ㅑ", reading: "야 / ya", meaning: "单元音", category: "单元音" },
  { letter: "ㅓ", reading: "어 / eo", meaning: "单元音", category: "单元音" },
  { letter: "ㅕ", reading: "여 / yeo", meaning: "单元音", category: "单元音" },
  { letter: "ㅗ", reading: "오 / o", meaning: "单元音", category: "单元音" },
  { letter: "ㅛ", reading: "요 / yo", meaning: "单元音", category: "单元音" },
  { letter: "ㅜ", reading: "우 / u", meaning: "单元音", category: "单元音" },
  { letter: "ㅠ", reading: "유 / yu", meaning: "单元音", category: "单元音" },
  { letter: "ㅡ", reading: "으 / eu", meaning: "单元音", category: "单元音" },
  { letter: "ㅣ", reading: "이 / i", meaning: "单元音", category: "单元音" },
  // 双元音 11
  { letter: "ㅐ", reading: "애 / ae", meaning: "双元音", category: "双元音" },
  { letter: "ㅒ", reading: "얘 / yae", meaning: "双元音", category: "双元音" },
  { letter: "ㅔ", reading: "에 / e", meaning: "双元音", category: "双元音" },
  { letter: "ㅖ", reading: "예 / ye", meaning: "双元音", category: "双元音" },
  { letter: "ㅘ", reading: "와 / wa", meaning: "双元音", category: "双元音" },
  { letter: "ㅙ", reading: "왜 / wae", meaning: "双元音", category: "双元音" },
  { letter: "ㅚ", reading: "외 / oe", meaning: "双元音", category: "双元音" },
  { letter: "ㅝ", reading: "워 / wo", meaning: "双元音", category: "双元音" },
  { letter: "ㅞ", reading: "웨 / we", meaning: "双元音", category: "双元音" },
  { letter: "ㅟ", reading: "위 / wi", meaning: "双元音", category: "双元音" },
  { letter: "ㅢ", reading: "의 / ui", meaning: "双元音", category: "双元音" },
];
