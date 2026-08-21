/** 英语用法上传契约：编号中文说明 + 口语/考试双频次 1～10（对齐日语；选题按分类语境；正文禁考试标签） */

import { normalizeEnVocabCategory } from "@/lib/en-vocab-category";

/**
 * 展示/存库正文禁止的考试品牌与标签。
 * 选题仍可按「学术英语考试写作/阅读/听力高频」来做，但字面不得出现这些词。
 */
export const EN_VOCAB_USAGE_EXAM_LABEL_RE =
  /雅思|托福|四六级|考研|专四|专八|IELTS|TOEFL|ielts|toefl|\bCET\b|\bGRE\b|\bGMAT\b|\bSAT\b/i;

/** 存库标记短名；展示用完整「口语频率／考试频率」 */
export const EN_VOCAB_USAGE_ORAL_FREQ_LABEL = "口语频率";
export const EN_VOCAB_USAGE_EXAM_FREQ_LABEL = "考试频率";

/**
 * 编号后双频次：`[口语7|考试8]`（对齐日语语法用法）。
 * 兼容旧单分 `[8]`（只认考试分，口语缺 → 不算齐全）。
 */
export const EN_VOCAB_USAGE_DUAL_FREQUENCY_PREFIX_RE =
  /^\[\s*口语\s*[：:]?\s*(\d{1,2})\s*[|｜]\s*考试\s*[：:]?\s*(\d{1,2})\s*\]\s*(.+)$/u;

/** @deprecated 旧单分标记；解析仍认，写回一律双分 */
export const EN_VOCAB_USAGE_FREQUENCY_PREFIX_RE = /^\[(\d{1,2})\]\s*(.+)$/;

export const EN_VOCAB_USAGE_UPLOAD_SPEC = {
  version: 5,
  count_rule:
    "组数=该词真实不同核心义项数（按分类语境选题，托业偏职场商务）；只有 1 种就 1 条，有几种写几条；同词性且意思差不多必须合并为 1 条；禁止按对象/场景硬拆同一义",
  format_example:
    "1. [口语7|考试8] 介词：表示「在……之上」；常用于描述位置关系。\n2. [口语4|考试5] 副词：表示「在上方；在上文中」。",
  frequency_rule:
    "每条用法编号后必须带 [口语n|考试m]（各 1～10；口语=日常会话常用度；考试=该分类考试语境常用度；可打不同分）",
  rules: [
    "每行必须以「1.」「2.」… 编号开头（半角点号）",
    "编号后紧跟 [口语n|考试m]（各 1～10），再接中文说明，例如：1. [口语6|考试9] 动词：表示「期待」",
    "说明用中文；可在引号内保留英文术语（如「look forward to」）",
    "选题按该词分类语境的高频用法（托业→职场邮件/会议/客户；雅思托福→读写听）",
    "上传接口自动屏蔽考试名称/标签（雅思、托福、IELTS、TOEFL、四六级、考研等）——直接去掉该词，不拒整段",
    "组数按实需：1 种→1 条，2 种→2 条，3 种→3 条；勿为凑数硬拆/硬凑",
    "硬规则：两条都是同一词性（如都是动词）且中文意思差不多 → 必须合并为 1 条；可在一条里顺带点出常见对象/场景",
    "同一核心义换对象/场景不算新用法（如 attractive「对客户有吸引力」与「外表好看」须合并为 1 条）",
    "同一动词按对象硬拆不算新用法（如 fail「计划/设备失败」与「考试不及格」；freeze「冻结薪资」与「冻结账户」——须合并为 1 条动词义）",
    "同一副词/形容词的近义改写不算新用法（如 carefully「仔细地完成工作」与「谨慎地避免出错」须合并为 1 条）",
    "自检：两条候选用法若造出的例句几乎可互换，说明仍是同一核心义，必须合并",
    "每条用法必须只标一种词性（动词 / 名词 / 形容词…）；禁止「动词/名词」「形容词/名词」等含糊写法——例句是哪种词性就标哪种；若名词与动词义都常用，拆成两条并各配例句",
    "名词作定语（quality service / business trip）仍标「名词：作定语…」，禁止标成「形容词」——学生会误以为该词可当形容词",
    "不要 markdown、不要整段散文、不要造例句（例句另有 fill 阶段）",
    "写回时请传 source，建议「本地 gemma4:26b」；人手为「手动」",
  ],
  reject_reasons: [
    "empty",
    "need_one_point",
    "invalid_numbering",
    "missing_frequency",
    "invalid_frequency",
    "ambiguous_pos",
    "noun_attrib_as_adj",
    "phrase_labeled_as_adj_adv",
  ],
} as const;

/** 用法行开头禁止「动词/名词」这类含糊词性（须单一词性，或拆成两条） */
export const EN_VOCAB_USAGE_AMBIGUOUS_POS_RE =
  /^(?:\[\s*口语\s*[：:]?\s*\d{1,2}\s*[|｜]\s*考试\s*[：:]?\s*\d{1,2}\s*\]\s*|\[\d{1,2}\]\s*)?(?:动词|名词|形容词|副词|介词|连词|代词|数词|感叹词|动词短语|名词短语|形容词短语|系动词|及物动词|不及物动词)\s*[\/／]\s*(?:动词|名词|形容词|副词|介词|连词|代词|数词|感叹词|动词短语|名词短语|形容词短语|系动词|及物动词|不及物动词)/u;

/** 用法正文以「形容词：」开头（频次括号后） */
export const EN_VOCAB_USAGE_ADJ_LABEL_RE = /^形容词\s*[：:]/u;

/** 多词搭配误把整条标成「形容词：/副词：」（应写「短语：作定语/状语用」） */
export const EN_VOCAB_USAGE_BARE_ADJ_ADV_LABEL_RE = /^(?:形容词|副词)\s*[：:]/u;

export function enVocabLemmaHasMultipleWords(raw?: string | null): boolean {
  return /\s/.test(String(raw || "").trim());
}

/**
 * 词性栏仅名词（n / noun / 名词），不含 adj。
 * 用于挡住「名词作定语」被误标成形容词（quality service 等）。
 */
export function enVocabPosLooksNounOnly(pos?: string | null): boolean {
  const raw = String(pos ?? "").trim();
  if (!raw) return false;
  const parts = raw
    .split(/[/／|,，\s]+/)
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  if (parts.length === 0) return false;
  const isAdj = (p: string) =>
    p === "a" ||
    p === "a." ||
    p === "adj" ||
    p === "adj." ||
    p === "adjective" ||
    p === "形容词";
  const isNoun = (p: string) =>
    p === "n" || p === "n." || p === "noun" || p === "名词";
  if (parts.some(isAdj)) return false;
  return parts.every(isNoun);
}

export type EnVocabUsagePoint = {
  n: number;
  text: string;
  /** 口语频率 1～10；旧单分或人手未填时为 null */
  oralFrequency: number | null;
  /** 考试频率 1～10（托业/雅思等选题语境）；旧单分 `[n]` 会落到此字段 */
  examFrequency: number | null;
  /**
   * @deprecated 旧「出现频次」= 考试分；请用 examFrequency。
   * 保留便于过渡期读旧字段名。
   */
  frequency: number | null;
};

export type EnVocabUsageAiInput = {
  word: string;
  kind: string;
  reading?: string | null;
  meaning?: string | null;
  pos?: string | null;
  category?: string | null;
};

const NUMBERED_LINE_RE = /^\s*(\d+)\s*[.、．)\]]\s*(.+)$/;
const HAN_RE = /[\u4E00-\u9FFF]/;
const FENCE_RE = /^```(?:\w+)?\s*$/;

function buildEnVocabUsageCategoryFocusLine(categoryRaw?: string | null): string {
  const category = normalizeEnVocabCategory(categoryRaw);
  if (category === "雅思托福") {
    return "选材（仅供你选题，禁止写进正文）：优先该词在雅思、托福这类学术英语考试的写作、阅读、听力中的高频用法与搭配。";
  }
  if (category.includes("托业") || category.toUpperCase().includes("TOEIC")) {
    return "选材（仅供你选题，禁止写进正文）：优先该词在托业这类职场/商务英语考试中的高频用法与搭配，如邮件、会议、办公室、客户沟通、日常工作场景。";
  }
  if (
    category.includes("IT面试") ||
    category.includes("面试") ||
    category.toLowerCase().includes("interview")
  ) {
    return "选材（仅供你选题，禁止写进正文）：优先该词在 IT / 软件工程技术面试中的高频用法与搭配，如系统设计、架构、算法数据结构、微服务、缓存、并发、CI/CD、线上排障、代码评审；释义与例句也偏技术面试口语。";
  }
  return `选材（仅供你选题，禁止写进正文）：优先该词在「${category}」这一分类对应语境中的高频用法与搭配。`;
}

export function buildEnVocabUsageAiPrompt(input: EnVocabUsageAiInput): string {
  const kindLabel = input.kind === "grammar" ? "语法" : "单词";
  const reading = input.reading?.trim();
  const meaning = input.meaning?.trim();
  const pos = input.pos?.trim();
  const category = normalizeEnVocabCategory(input.category);
  const meta = [
    `词条：${input.word.trim()}`,
    reading ? `音标：${reading}` : null,
    meaning ? `释义：${meaning}` : null,
    pos ? `词性：${pos}` : null,
    category ? `分类：${category}` : null,
    `类型：${kindLabel}`,
  ]
    .filter(Boolean)
    .join("\n");

  return `${meta}

请为上述英语${kindLabel}列出常用用法说明，并为每种用法分别打「口语频率」与「考试频率」。

${buildEnVocabUsageCategoryFocusLine(category)}

条数与内容（最重要——先判断「几个真正不同的核心义」，再写条数）：
- 组数 = 该词真实不同的核心义项数：只有 1 种就写 1 条；确有 2 种才写 2 条；确有 3 种才写 3 条。禁止为了凑数硬拆，也禁止无关冷僻义硬凑。
- 「一条用法」= 一个词典级核心义 / 词性 / 固定结构（换了对象或场景意思不变，仍算同一条）。
- 硬规则（先过这一关）：若两条候选用法**词性相同**（如都是「动词：」）且中文意思差不多 → **必须合并为 1 条**；可在这一条里用分号顺带写出常见对象/场景，不要拆成 1. 2.。
- ❌ 禁止按修饰对象、应用场景硬拆同一形容词/动词义。例如 attractive：不要拆成「价格/方案对客户有吸引力」和「外表好看」——二者都是「有吸引力；讨人喜欢」，必须合并成 1 条，可在一条里顺带点出可指方案、价格、外表等。
- ❌ 禁止同一动词按对象/场景硬拆。例如 fail：不要拆成「（计划、设备等）失败」和「（考试、检查等）不及格」——须合并为 1 条动词义；freeze：不要拆成「冻结薪资」和「冻结账户」——二者都是「冻结；使无法变动或使用」，必须合并成 1 条（可顺带写可用于薪资、账户、价格等）；若还有名词「冻结令」义，再另开一条名词。
- ❌ 禁止把同一副词/形容词拆成近义微调。例如 carefully：不要拆成「仔细地、认真地完成工作」和「谨慎地、小心地避免出错」——二者都是「仔细地；小心地」，必须合并成 1 条（可顺带写可用于检查、阅读、核对等）。
- ❌ 禁止把同一义项的近义改写、语气微调、缩小场景、换主语/宾语当两条（如都在解释同一个「有吸引力」、同一个「仔细地」、同一个「失败/未通过」、同一个「冻结薪资/账户」，或同一个介词「在……之中」）。
- 自检：若两条候选用法同词性、意思差不多，或造出的例句几乎可互换（carefully 读合同 / 核对数；system failed / failed the check；freeze salaries / freeze an account），说明仍是同一核心义 → 必须合并成 1 条，只留 1 条例句。
- ✅ 只有核心意思真不同时才拆：不同词性（介词 vs 副词；动词 vs 名词）、不同词典义（issue「问题」vs「发行」）、或不同固定结构且意思不同（expect that vs be expected to；would rather vs rather = 相当）。同词性但只是换对象/场景 → 不拆。
- 聚焦该分类语境下的高频用法；托业词优先职场/商务；IT面试词优先系统设计/架构/算法等技术面试口语；不要堆冷僻义。
- 用中文解释；可在引号内保留英文短语或术语。
- 每条用法开头必须只标一种词性（如「动词：」「名词：」）。❌ 禁止「动词/名词」「形容词/名词」「名词/动词」等含糊写法。例句实际是哪种词性就标哪种（如 file a claim → 名词；claimed that → 动词）。若名词义与动词义都常用且意思不同，拆成两条，各写清词性并稍后各配例句。
- ❌ 禁止把「名词作定语」误标成「形容词」。例如 quality service、business trip、stone wall：前置的 quality / business / stone 仍是名词，须写「名词：作定语，表示……」，不要写「形容词：……」——学生会误以为该词可以当形容词用。
- ✅ 只有真正的形容词才标「形容词：」（可单独作表语，如 The service is good / This plan is attractive）。词性栏若只有 n，用法里禁止出现「形容词：」。
- 词条含空格的固定搭配（unbearably tough、in time）且词性栏是 phrase 时，用法开头写「短语：」，可注明「作定语/状语/形容词用」；不要只写「形容词：」「副词：」让人以为词条本身是单个形容词或副词。

口语频率 / 考试频率（必须，对齐日语）：
- 每条用法都必须打两个 1～10 分：口语频率=日常会话/口语里该义常用度；考试频率=该分类考试语境（托业职场 / 雅思托福读写听 / IT技术面试等）常用度。
- 10=最常见/最核心；1=极少见。两条可打不同分（口语高考试低、或反过来都行）。
- 多条时按相对常用度区分，不要全部打同一分。
- 分值写在编号后的方括号里，形如 [口语7|考试8]（禁止只写旧式单分 [8]）。

格式要求（必须严格遵守）：
- 只输出编号行；半角「数字.」+ 空格 + [口语n|考试m] + 空格 + 中文正文；编号从 1 连续递增。
- 仅 1 种常用用法时只输出一行，例如：
1. [口语8|考试9] 形容词：表示「有吸引力；讨人喜欢」；可形容方案、价格、外表等。
- 多种真正不同的词性/义项时再继续 2. 3. …，例如：
1. [口语7|考试8] 介词：表示「在……之上」；常用于描述位置关系。
2. [口语4|考试5] 副词：表示「在上方；在上文中」。
- 正文中绝对禁止出现任何考试名称或标签（不要写：雅思、托福、IELTS、TOEFL、四六级、考研、专四、专八、GRE、GMAT、SAT、CET、托业、TOEIC 等）。
- 不要 markdown、不要标题、不要例句、不要额外解释。`;
}

export type EnVocabUsageLineFrequency = {
  oralFrequency: number | null;
  examFrequency: number | null;
  text: string;
  /** @deprecated = examFrequency */
  frequency: number | null;
};

/** 从编号行正文提取口语/考试双分；兼容旧单分 `[8]` / `[频次8]` / 简写 `[7|8]` */
export function extractEnVocabUsageFrequency(
  body: string
): EnVocabUsageLineFrequency {
  const raw = String(body ?? "").trim();
  if (!raw) {
    return {
      oralFrequency: null,
      examFrequency: null,
      frequency: null,
      text: "",
    };
  }

  const dual = EN_VOCAB_USAGE_DUAL_FREQUENCY_PREFIX_RE.exec(raw);
  if (dual) {
    const oral = clampEnVocabUsageFrequency(dual[1]);
    const exam = clampEnVocabUsageFrequency(dual[2]);
    const text = dual[3].trim();
    if (oral != null && exam != null && text) {
      return {
        oralFrequency: oral,
        examFrequency: exam,
        frequency: exam,
        text,
      };
    }
  }

  // 简写 `[7|8]`（口语|考试）
  const short = /^\[\s*(\d{1,2})\s*[|｜]\s*(\d{1,2})\s*\]\s*(.+)$/u.exec(raw);
  if (short) {
    const oral = clampEnVocabUsageFrequency(short[1]);
    const exam = clampEnVocabUsageFrequency(short[2]);
    const text = short[3].trim();
    if (oral != null && exam != null && text) {
      return {
        oralFrequency: oral,
        examFrequency: exam,
        frequency: exam,
        text,
      };
    }
  }

  // 旧单分 `[8]` → 只认考试分（口语缺，不算齐全）
  const bracket = EN_VOCAB_USAGE_FREQUENCY_PREFIX_RE.exec(raw);
  if (bracket) {
    const exam = clampEnVocabUsageFrequency(bracket[1]);
    const text = bracket[2].trim();
    if (exam != null && text) {
      return {
        oralFrequency: null,
        examFrequency: exam,
        frequency: exam,
        text,
      };
    }
  }

  const freqLabel = /^\[频次\s*(\d{1,2})\]\s*(.+)$/u.exec(raw);
  if (freqLabel) {
    const exam = clampEnVocabUsageFrequency(freqLabel[1]);
    const text = freqLabel[2].trim();
    if (exam != null && text) {
      return {
        oralFrequency: null,
        examFrequency: exam,
        frequency: exam,
        text,
      };
    }
  }

  const trailingFull =
    /^(.+?)\s*[【\[]\s*(?:频次\s*[:：]?\s*)?(\d{1,2})\s*[】\]]\s*$/u.exec(raw);
  if (trailingFull) {
    const exam = clampEnVocabUsageFrequency(trailingFull[2]);
    const text = trailingFull[1].trim();
    if (exam != null && text) {
      return {
        oralFrequency: null,
        examFrequency: exam,
        frequency: exam,
        text,
      };
    }
  }

  return {
    oralFrequency: null,
    examFrequency: null,
    frequency: null,
    text: raw,
  };
}

export function clampEnVocabUsageFrequency(
  value: unknown
): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 10) return null;
  return n;
}

export function formatEnVocabUsageFrequencyMarker(
  oral: number,
  exam: number
): string {
  const o = clampEnVocabUsageFrequency(oral);
  const e = clampEnVocabUsageFrequency(exam);
  if (o == null || e == null) return "";
  return `[口语${o}|考试${e}]`;
}

/** 展示文案：口语频率 7/10 · 考试频率 8/10（缺一边则只显示有的） */
export function formatEnVocabUsageFrequencyLabel(
  oralOrLegacy: number | null | undefined,
  exam?: number | null | undefined
): string | null {
  // 兼容旧调用 formatEnVocabUsageFrequencyLabel(frequency) → 只显示考试分
  if (arguments.length < 2) {
    const examOnly = clampEnVocabUsageFrequency(oralOrLegacy);
    if (examOnly == null) return null;
    return `${EN_VOCAB_USAGE_EXAM_FREQ_LABEL} ${examOnly}/10`;
  }
  const o = clampEnVocabUsageFrequency(oralOrLegacy);
  const e = clampEnVocabUsageFrequency(exam);
  const parts: string[] = [];
  if (o != null) parts.push(`${EN_VOCAB_USAGE_ORAL_FREQ_LABEL} ${o}/10`);
  if (e != null) parts.push(`${EN_VOCAB_USAGE_EXAM_FREQ_LABEL} ${e}/10`);
  return parts.length ? parts.join(" · ") : null;
}

export function enVocabUsagePointHasCompleteFrequency(
  oral: number | null | undefined,
  exam: number | null | undefined
): boolean {
  return (
    clampEnVocabUsageFrequency(oral) != null &&
    clampEnVocabUsageFrequency(exam) != null
  );
}

/**
 * 编号用法是否每条都有口语+考试双分（1～10）。
 * 无编号点 / 空正文 / 旧单分缺口语 → false。
 */
export function enVocabUsageHasCompleteFrequency(
  raw: string | null | undefined
): boolean {
  const points = parseEnVocabUsagePoints(String(raw ?? ""));
  if (!points || points.length < 1) return false;
  return points.every((p) =>
    enVocabUsagePointHasCompleteFrequency(p.oralFrequency, p.examFrequency)
  );
}

/** 已有用法缺双分时：只补口语/考试频次，尽量保留原中文说明 */
export function buildEnVocabUsageFrequencyBackfillPrompt(input: {
  word: string;
  kind: string;
  usage: string;
  reading?: string | null;
  meaning?: string | null;
  pos?: string | null;
  category?: string | null;
}): string {
  const kindLabel = input.kind === "grammar" ? "语法" : "单词";
  const reading = input.reading?.trim();
  const meaning = input.meaning?.trim();
  const pos = input.pos?.trim();
  const category = normalizeEnVocabCategory(input.category);
  const meta = [
    `词条：${input.word.trim()}`,
    reading ? `音标：${reading}` : null,
    meaning ? `释义：${meaning}` : null,
    pos ? `词性：${pos}` : null,
    category ? `分类：${category}` : null,
    `类型：${kindLabel}`,
  ]
    .filter(Boolean)
    .join("\n");

  return `${meta}

已有用法（请保留每条中文说明的含义与顺序，不要删条、不要新造义项）：
${String(input.usage || "").trim()}

任务：仅为每条用法补上「口语频率」与「考试频率」各 1～10（口语=日常会话常用度；考试=该分类考试语境常用度；可打不同分；多条时按相对常用度区分，不要全打同一分）。
若原行已有旧式单分 [n]，把它当作考试分参考，并补上口语分；输出必须一律写成 [口语n|考试m]。
${buildEnVocabUsageCategoryFocusLine(category)}

输出格式（必须）：
- 只输出编号行：数字. [口语n|考试m] 中文说明
- 条数与顺序必须与上面已有用法一致
- 正文禁止考试名称/标签
- 不要 markdown、不要例句、不要额外解释`;
}

function stripFenceNoise(raw: string): string {
  return String(raw || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !FENCE_RE.test(line))
    .join("\n");
}

/** 解析并规范化编号用法行；失败返回 null。频次可选（旧数据可无）。 */
export function parseEnVocabUsagePoints(
  raw: string
): EnVocabUsagePoint[] | null {
  const lines = stripFenceNoise(raw)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return null;

  const points: EnVocabUsagePoint[] = [];
  for (const line of lines) {
    const m = NUMBERED_LINE_RE.exec(line);
    if (!m) return null;
    const n = Number(m[1]);
    const body = m[2].trim();
    if (!Number.isInteger(n) || n <= 0 || !body) return null;
    const { oralFrequency, examFrequency, frequency, text } =
      extractEnVocabUsageFrequency(body);
    if (!text || !HAN_RE.test(text)) return null;
    // 形如 [15] / [0] 的非法分值：方括号数字却不在 1～10 → 拒收
    // 双分非法：`[口语0|考试8]` / `[口语11|考试8]` 等由 extract 未吃掉前缀时再拒
    if (
      oralFrequency == null &&
      examFrequency == null &&
      /^\[\s*(?:口语|频次)?\s*\d{1,2}/u.test(body)
    ) {
      return null;
    }
    if (
      /^\[\s*口语\s*[：:]?\s*\d{1,2}\s*[|｜]\s*考试\s*[：:]?\s*\d{1,2}\s*\]/u.test(
        body
      ) &&
      (oralFrequency == null || examFrequency == null)
    ) {
      return null;
    }
    points.push({
      n,
      text,
      oralFrequency,
      examFrequency,
      frequency,
    });
  }
  if (!points.length) return null;

  // 必须从 1 连续递增
  for (let i = 0; i < points.length; i++) {
    if (points[i].n !== i + 1) return null;
  }
  return points;
}

export function serializeEnVocabUsagePoints(
  points: Array<
    Pick<EnVocabUsagePoint, "text" | "oralFrequency" | "examFrequency" | "frequency"> & {
      n?: number;
    }
  >
): string {
  return points
    .map((p, i) => {
      const oral = clampEnVocabUsageFrequency(p.oralFrequency);
      const exam = clampEnVocabUsageFrequency(
        p.examFrequency ?? p.frequency
      );
      let freq = "";
      if (oral != null && exam != null) {
        freq = `${formatEnVocabUsageFrequencyMarker(oral, exam)} `;
      } else if (exam != null) {
        // 过渡：只写考试分时仍用旧单分，便于读旧 UI；list_missing 会再补口语
        freq = `[${exam}] `;
      }
      return `${i + 1}. ${freq}${String(p.text ?? "").trim()}`;
    })
    .join("\n");
}

export function normalizeEnVocabUsageText(
  raw: string | null | undefined
): string | null {
  const points = parseEnVocabUsagePoints(String(raw ?? ""));
  if (!points || points.length < 1) return null;
  return serializeEnVocabUsagePoints(points);
}

export function normalizeEnVocabUsageSource(
  raw: string | null | undefined
): string | null {
  const t = String(raw ?? "").trim();
  return t || null;
}

export function enVocabUsageHasExamLabel(raw: string): boolean {
  return EN_VOCAB_USAGE_EXAM_LABEL_RE.test(String(raw ?? ""));
}

/** 复合标签先剥，减少「IELTS/TOEFL」「雅思/托福」残留斜杠 */
const EN_VOCAB_USAGE_EXAM_LABEL_COMPOUND_RE =
  /IELTS\s*[\/／、&]\s*TOEFL|TOEFL\s*[\/／、&]\s*IELTS|雅思\s*[\/／、或和与]\s*托福|托福\s*[\/／、或和与]\s*雅思/gi;

const EN_VOCAB_USAGE_IMAGE_LINE_RE = /^!\[[^\]]*\]\([^)]+\)\s*$/;

/** 剥标签后清多余标点/空格；空编号行返回 "" */
function cleanEnVocabUsageLineDebris(line: string): string {
  let s = String(line || "")
    .replace(/\s{2,}/g, " ")
    .replace(/[；;]{2,}/g, "；")
    .replace(/[，,]{2,}/g, "，")
    .replace(/([：:；;，,、])\s+/g, "$1")
    .replace(/\s+([：:；;，,、。．.!！？?])/g, "$1")
    .replace(/([：:])\s*[；;，,、／/]+\s*/g, "$1")
    .replace(/\s*[；;，,、／/]+\s*([。．.!！？?])/g, "$1")
    .replace(/([。．.!！？?])\s*[；;，,、／/]+/g, "$1")
    // 汉字之间因剥标签留下的空格（「在 语法」→「在语法」）
    .replace(/([\u4E00-\u9FFF])\s+(?=[\u4E00-\u9FFF])/g, "$1")
    .trim();
  s = s.replace(/^(\d+\s*[.、．)\]]\s*)[；;，,、／/]+\s*/, "$1");
  s = s.replace(/[；;，,、／/\s]+$/g, "").trim();
  if (/^\d+\s*[.、．)\]]\s*$/.test(s)) return "";
  return s;
}

/**
 * 从用法正文去掉考试品牌/标签，保留编号义项（至少 1 条即可）。
 * 含图片 markdown 行时原样保留。无标签则原样返回。
 */
export function stripEnVocabUsageExamLabels(raw: string): string {
  const original = String(raw ?? "");
  if (!original.trim()) return original;
  if (!enVocabUsageHasExamLabel(original)) return original;

  const stripped = original
    .replace(EN_VOCAB_USAGE_EXAM_LABEL_COMPOUND_RE, "")
    .replace(EN_VOCAB_USAGE_EXAM_LABEL_RE, "");

  const lines = stripped
    .split(/\r?\n/)
    .map((ln) => cleanEnVocabUsageLineDebris(ln))
    .filter((ln) => ln.trim());

  const out: string[] = [];
  let pointIdx = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (EN_VOCAB_USAGE_IMAGE_LINE_RE.test(trimmed)) {
      out.push(trimmed);
      continue;
    }
    const m = NUMBERED_LINE_RE.exec(trimmed);
    if (m) {
      const {
        oralFrequency,
        examFrequency,
        frequency,
        text: body,
      } = extractEnVocabUsageFrequency(m[2].trim());
      if (!body || !HAN_RE.test(body)) continue;
      pointIdx += 1;
      const oral = clampEnVocabUsageFrequency(oralFrequency);
      const exam = clampEnVocabUsageFrequency(examFrequency ?? frequency);
      let freq = "";
      if (oral != null && exam != null) {
        freq = `${formatEnVocabUsageFrequencyMarker(oral, exam)} `;
      } else if (exam != null) {
        freq = `[${exam}] `;
      }
      out.push(`${pointIdx}. ${freq}${body}`);
      continue;
    }
    out.push(trimmed);
  }
  return out.join("\n");
}

/**
 * 展示用：先剥考试标签，编号行改成「1.用法：… / 2.用法：…」。
 * 仅一条时只显示「1.用法：…」。图片行不动。频次标记不写进正文（由 UI 单独展示）。
 */
export function formatEnVocabUsageForDisplay(raw: string): string {
  const stripped = stripEnVocabUsageExamLabels(String(raw ?? ""));
  if (!stripped.trim()) return "";

  const lines = stripped.split(/\r?\n/);
  const out: string[] = [];
  let pointIdx = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (EN_VOCAB_USAGE_IMAGE_LINE_RE.test(trimmed)) {
      out.push(trimmed);
      continue;
    }
    const m = NUMBERED_LINE_RE.exec(trimmed);
    if (m) {
      const { text: body } = extractEnVocabUsageFrequency(m[2].trim());
      if (!body) continue;
      pointIdx += 1;
      out.push(`${pointIdx}.用法：${body}`);
      continue;
    }
    out.push(trimmed);
  }
  return out.join("\n");
}

/**
 * 上传入口屏蔽：雅思/托福/IELTS/TOEFL 等考试标签直接去掉，再入库。
 * fill-usage apply、编辑保存用法统一走这里。
 */
export function shieldEnVocabUsageUploadText(raw: string): string {
  return stripEnVocabUsageExamLabels(String(raw ?? "")).trim();
}

/** 校验 AI 返回的用法块是否可用（先屏蔽考试标签，再验编号格式 + 频次） */
export function validateEnVocabUsageAiOutput(
  raw: string,
  _input?: EnVocabUsageAiInput,
  options: { requireFrequency?: boolean } = {}
): { ok: true; text: string } | { ok: false; reason: string } {
  const text = shieldEnVocabUsageUploadText(raw);
  if (!text) return { ok: false, reason: "empty" };

  const points = parseEnVocabUsagePoints(text);
  if (!points) {
    // 区分非法分值与普通编号错误
    const hasBadBracket = /^\s*\d+\s*[.、．)\]]\s*\[\d{1,2}\]/m.test(text);
    if (hasBadBracket) return { ok: false, reason: "invalid_frequency" };
    return { ok: false, reason: "invalid_numbering" };
  }
  if (points.length < 1) return { ok: false, reason: "need_one_point" };

  const requireFrequency = options.requireFrequency !== false;
  if (requireFrequency) {
    for (const p of points) {
      if (
        !enVocabUsagePointHasCompleteFrequency(
          p.oralFrequency,
          p.examFrequency
        )
      ) {
        return { ok: false, reason: "missing_frequency" };
      }
    }
  }

  for (const p of points) {
    if (EN_VOCAB_USAGE_AMBIGUOUS_POS_RE.test(p.text.trim())) {
      return { ok: false, reason: "ambiguous_pos" };
    }
  }

  // 词性栏仅名词时，禁止用法标「形容词：」（名词作定语 ≠ 形容词）
  if (enVocabPosLooksNounOnly(_input?.pos)) {
    for (const p of points) {
      if (EN_VOCAB_USAGE_ADJ_LABEL_RE.test(p.text.trim())) {
        return { ok: false, reason: "noun_attrib_as_adj" };
      }
    }
  }

  // 含空格的固定搭配：用法不要写成「形容词：/副词：」（词性栏是短语，可写「短语：作定语/状语用」）
  if (enVocabLemmaHasMultipleWords(_input?.word)) {
    for (const p of points) {
      if (EN_VOCAB_USAGE_BARE_ADJ_ADV_LABEL_RE.test(p.text.trim())) {
        return { ok: false, reason: "phrase_labeled_as_adj_adv" };
      }
    }
  }

  return { ok: true, text: serializeEnVocabUsagePoints(points) };
}
