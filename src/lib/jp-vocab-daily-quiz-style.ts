export type JpVocabDailyQuizStyle = {
  /** 是否显示「当前排序前 20 条」标记背景 */
  enabled: boolean;
  /** 统一背景色 */
  bgColor: string;
  /** 背景透明度 0–100 */
  bgOpacity: number;
};

export const JP_VOCAB_DAILY_QUIZ_STYLE_STORAGE_KEY = "jp-vocab-daily-quiz-style-v2";

export const JP_VOCAB_DAILY_QUIZ_STYLE_DEFAULT: JpVocabDailyQuizStyle = {
  enabled: true,
  bgColor: "#ffc457",
  bgOpacity: 18,
};

const LEGACY_STORAGE_KEY = "jp-vocab-daily-quiz-style-v1";

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const raw = hex.replace(/^#/, "").trim();
  const normalized =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw.slice(0, 6);
  const n = Number.parseInt(normalized, 16);
  if (!Number.isFinite(n)) return { r: 255, g: 196, b: 87 };
  return {
    r: (n >> 16) & 255,
    g: (n >> 8) & 255,
    b: n & 255,
  };
}

function normalizeHexColor(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const v = value.trim();
  if (/^#[0-9a-fA-F]{3}$/.test(v) || /^#[0-9a-fA-F]{6}$/.test(v)) return v;
  return fallback;
}

export function normalizeJpVocabDailyQuizStyle(
  raw: Partial<JpVocabDailyQuizStyle & { colorPrimary?: string }> | null | undefined
): JpVocabDailyQuizStyle {
  const d = JP_VOCAB_DAILY_QUIZ_STYLE_DEFAULT;
  const bgColor = normalizeHexColor(raw?.bgColor ?? raw?.colorPrimary, d.bgColor);
  return {
    enabled: raw?.enabled !== false,
    bgColor,
    bgOpacity: clamp(Number(raw?.bgOpacity ?? d.bgOpacity), 0, 80),
  };
}

function readLegacyStyle(): JpVocabDailyQuizStyle | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return null;
    return normalizeJpVocabDailyQuizStyle(JSON.parse(raw) as Partial<JpVocabDailyQuizStyle>);
  } catch {
    return null;
  }
}

export function readJpVocabDailyQuizStyle(): JpVocabDailyQuizStyle {
  if (typeof window === "undefined") return JP_VOCAB_DAILY_QUIZ_STYLE_DEFAULT;
  try {
    const raw = localStorage.getItem(JP_VOCAB_DAILY_QUIZ_STYLE_STORAGE_KEY);
    if (raw) {
      return normalizeJpVocabDailyQuizStyle(JSON.parse(raw) as Partial<JpVocabDailyQuizStyle>);
    }
    const legacy = readLegacyStyle();
    if (legacy) {
      writeJpVocabDailyQuizStyle(legacy);
      return legacy;
    }
    return JP_VOCAB_DAILY_QUIZ_STYLE_DEFAULT;
  } catch {
    return JP_VOCAB_DAILY_QUIZ_STYLE_DEFAULT;
  }
}

export function writeJpVocabDailyQuizStyle(style: JpVocabDailyQuizStyle): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    JP_VOCAB_DAILY_QUIZ_STYLE_STORAGE_KEY,
    JSON.stringify(normalizeJpVocabDailyQuizStyle(style))
  );
}

/** 供表格容器注入 CSS 变量，实时预览行背景 */
export function jpVocabDailyQuizStyleVars(
  style: JpVocabDailyQuizStyle
): Record<string, string> {
  const s = normalizeJpVocabDailyQuizStyle(style);
  const rgb = hexToRgb(s.bgColor);
  const bgO = s.bgOpacity / 100;
  const hoverO = Math.min(1, bgO + 0.06);

  return {
    "--jq-bg-rgb": `${rgb.r}, ${rgb.g}, ${rgb.b}`,
    "--jq-bg-o": String(bgO),
    "--jq-bg-hover-o": String(hoverO),
  };
}
