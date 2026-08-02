/**
 * 读音/形态「对比区别」语法（如 何（なん／なに））：
 * 不是拆成多条「1.用法」，而是先写【区别】，再两侧各一组对照例句。
 */

const NUMBERED_LINE_RE = /^\s*(\d+)\s*[.、．)\]]\s*(.+)$/;
const DISTINCTION_MARKERS = ["【区别】", "【區別】", "【對比】", "【对比】"] as const;

/** 标题/读音里用「／」并列两种假名读法，或标题含「区别/对比/辨析」 */
export function isJpVocabContrastGrammar(
  word: string,
  reading?: string | null
): boolean {
  const w = String(word || "").trim();
  const r = String(reading || "").trim();
  if (!w && !r) return false;
  // 活用变形课优先走变形格式，不抢
  if (/变形|变化规则|形规则|变ます|変ます|ます形规则|活用规则/.test(w)) {
    return false;
  }
  const blob = `${w}\n${r}`;
  // 何（なん／なに）的用法
  if (
    /[（(][^）)]*[\u3040-\u309Fー]+[／\/][\u3040-\u309Fー]+[^）)]*[）)]/.test(
      blob
    )
  ) {
    return true;
  }
  // reading = なに／なん
  if (/^[\u3040-\u309Fー]+[／\/][\u3040-\u309Fー]+$/.test(r)) return true;
  if (/区别|对比|対比|辨析/.test(w)) return true;
  return false;
}

/** 从标题括号或 reading 抽出两侧形态，如 ["なん","なに"] */
export function parseJpVocabContrastForms(
  word: string,
  reading?: string | null
): [string, string] | null {
  const r = String(reading || "").trim();
  const mReading = /^([\u3040-\u309Fー]+)[／\/]([\u3040-\u309Fー]+)$/.exec(r);
  if (mReading) return preferContrastFormOrder(mReading[1], mReading[2]);

  const w = String(word || "").trim();
  const mParen =
    /[（(][^）)]*?([\u3040-\u309Fー]+)[／\/]([\u3040-\u309Fー]+)[^）)]*[）)]/.exec(
      w
    );
  if (mParen) return preferContrastFormOrder(mParen[1], mParen[2]);
  return null;
}

/** 教学顺序：なに 先于 なん；其它保持原序 */
function preferContrastFormOrder(a: string, b: string): [string, string] {
  if (
    (a === "なん" && b === "なに") ||
    (a === "なに" && b === "なん")
  ) {
    return ["なに", "なん"];
  }
  return [a, b];
}

export function splitJpVocabUsageDistinctionLead(raw: string): {
  lead: string | null;
  body: string;
} {
  const text = String(raw ?? "")
    .replace(/\r\n/g, "\n")
    .trim();
  if (!text) return { lead: null, body: "" };

  let rest = text;
  let hadMarker = false;
  for (const marker of DISTINCTION_MARKERS) {
    if (rest.startsWith(marker)) {
      rest = rest.slice(marker.length).replace(/^\s+/, "");
      hadMarker = true;
      break;
    }
  }

  const lines = rest.split("\n");
  const firstNumbered = lines.findIndex((ln) =>
    NUMBERED_LINE_RE.test(ln.trim())
  );
  if (firstNumbered < 0) {
    if (hadMarker) return { lead: rest || null, body: "" };
    return { lead: null, body: text };
  }
  if (firstNumbered === 0) {
    return { lead: null, body: hadMarker ? rest : text };
  }
  if (!hadMarker && NUMBERED_LINE_RE.test(lines[0]?.trim() || "")) {
    return { lead: null, body: text };
  }

  const leadLines = lines
    .slice(0, firstNumbered)
    .map((l) => l.trim())
    .filter(Boolean);
  const body = lines.slice(firstNumbered).join("\n").trim();
  return { lead: leadLines.length ? leadLines.join("\n") : null, body };
}

export function joinJpVocabUsageWithDistinction(
  lead: string | null | undefined,
  numberedBody: string
): string {
  const body = String(numberedBody || "").trim();
  const leadText = String(lead || "").trim();
  if (!leadText) return body;
  if (!body) return `【区别】\n${leadText}`;
  return `【区别】\n${leadText}\n${body}`;
}

/** 对照侧标签：优先取「なに」；否则「1.对照」 */
export function jpVocabContrastPairLabel(n: number, usageText: string): string {
  const t = String(usageText || "").trim();
  const m = /^「([^」]+)」/.exec(t);
  if (m) return `${n}.「${m[1]}」`;
  return `${n}.对照`;
}

export function buildJpVocabContrastUsageAiPromptAppendix(
  word: string,
  reading?: string | null
): string {
  const forms = parseJpVocabContrastForms(word, reading);
  const a = forms?.[0] ?? "A";
  const b = forms?.[1] ?? "B";
  return `
本条是「读音/形态对比」课（比较「${a}」与「${b}」的区别），不是句型多义用法课。

硬规则（必须遵守）：
- ❌ 禁止按场景拆成 5～7 条「1.用法：…」编号清单（那是句型课格式，不适合本条）。
- ✅ 先用中文概括两者的区别，再分别给两侧各恰好 1 组：何时用「${a}」+ 1 条例句；何时用「${b}」+ 1 条例句。
- 输出结构必须是：
【区别】
（一段中文：两者分别用在什么地方、各表示什么；句末半角 (N5)/(N4)…）
1. 「${a}」：……时用「${a}」。(N5)
日语例句
译文：…
2. 「${b}」：……时用「${b}」。(N5)
日语例句
译文：…
【接序】
（两侧接续要点；可用「用法1:」「用法2:」分行）
【出现频率】
口语频率：n
考试频率：n
- 编号用法正文以「「${a}」：」「「${b}」：」开头；必须中文；句末等级括号。
- 严格 2 组、每组恰好 1 条例句；不要 markdown；例句汉字后半角括号假名。

输出格式示例：
【区别】
「何」有「なに」与「なん」两种读法：独立发问或后接「の／を／が／も／か」等时多用「なに」；后接数量词或「で／と」时读「なん」。(N5)
1. 「なに」：独立发问，或后接「の」「を」「が」「も」「か」等时用「なに」。(N5)
これはなにですか。
译文：这是什么？
2. 「なん」：后接数量词、「時」「月」「年」或「で」「と」时用「なん」。(N5)
今(いま)、何時(なんじ)ですか。
译文：现在几点？
【接序】
用法1: 独立使用，或后接「の」「を」「が」「も」「か」等
用法2: 后接数量词、「時」「月」「年」，或「で」「と」`;
}
