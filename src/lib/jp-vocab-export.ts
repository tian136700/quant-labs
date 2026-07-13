import { beijingDateString } from "@/lib/jp-vocab-daily-check";
import {
  parseJpVocabClassNoteContent,
  parseJpVocabClassNotes,
} from "@/lib/jp-vocab-class-notes";
import type { JpVocabDailyDisplayOrder } from "@/lib/jp-vocab-daily-order";
import { effectiveJpVocabDisplayLevel } from "@/lib/jp-vocab-review";
import { jpVocabWordsInOrder } from "@/lib/jp-vocab-page-helpers";
import type { JpVocabLevel, JpVocabWord } from "@/lib/types";

export type JpVocabExportScope = "all" | "today_weak";

function classNotesToExportText(raw: string | null | undefined): string {
  const entries = parseJpVocabClassNotes(raw);
  if (!entries.length) return "";

  return entries
    .map((entry) => {
      const body = parseJpVocabClassNoteContent(entry.content)
        .map((segment) => {
          if (segment.type === "text") return segment.text.trim();
          return "[图片]";
        })
        .filter(Boolean)
        .join("\n");
      if (!body) return "";
      if (entry.timestamp) return `${entry.timestamp}\n${body}`;
      return body;
    })
    .filter(Boolean)
    .join("\n\n");
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function cellParagraphs(
  text: string,
  Paragraph: typeof import("docx").Paragraph,
  TextRun: typeof import("docx").TextRun,
  opts?: { bold?: boolean; size?: number }
) {
  const lines = (text || "—").split("\n");
  return lines.map(
    (line, index) =>
      new Paragraph({
        spacing: index < lines.length - 1 ? { after: 80 } : undefined,
        children: [
          new TextRun({
            text: line || " ",
            bold: opts?.bold,
            size: opts?.size ?? 20,
            font: "Microsoft YaHei",
          }),
        ],
      })
  );
}

function buildExportTable(
  words: JpVocabWord[],
  docx: typeof import("docx"),
  dailySeqByWordId: Map<number, number>
) {
  const {
    BorderStyle,
    Paragraph,
    Table,
    TableCell,
    TableRow,
    TextRun,
    VerticalAlign,
    WidthType,
  } = docx;

  const border = { style: BorderStyle.SINGLE, size: 1, color: "B8B8B8" };
  const borders = { top: border, bottom: border, left: border, right: border };

  const headerRow = new TableRow({
    tableHeader: true,
    children: ["序号", "ID", "单词 / 语法", "读音", "释义", "词性", "备注"].map(
      (label) =>
        new TableCell({
          borders,
          verticalAlign: VerticalAlign.CENTER,
          width: { size: label === "备注" ? 22 : 11, type: WidthType.PERCENTAGE },
          children: cellParagraphs(label, Paragraph, TextRun, { bold: true, size: 20 }),
        })
    ),
  });

  const dataRows = words.map((word, index) => {
    const seq = dailySeqByWordId.get(word.id);
    const kindLabel = word.kind === "grammar" ? "语法" : "";
    const wordText = kindLabel ? `${word.word}（${kindLabel}）` : word.word;
    const columns = [
      seq != null ? String(seq) : String(index + 1),
      String(word.id),
      wordText,
      word.reading?.trim() || "—",
      word.meaning?.trim() || "—",
      word.pos?.trim() || "—",
      classNotesToExportText(word.class_notes) || "—",
    ];

    return new TableRow({
      children: columns.map(
        (value, colIndex) =>
          new TableCell({
            borders,
            verticalAlign: VerticalAlign.TOP,
            width: {
              size: colIndex === 6 ? 22 : 11,
              type: WidthType.PERCENTAGE,
            },
            children: cellParagraphs(value, Paragraph, TextRun, {
              size: colIndex <= 2 ? 22 : 20,
              bold: colIndex === 2,
            }),
          })
      ),
    });
  });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...dataRows],
  });
}

/** 今日抽查后勾选为「一般」或「不熟悉」的词条（用于次日带读） */
export function filterJpVocabTodayWeakWords(
  words: JpVocabWord[],
  sessionLevel: Record<number, JpVocabLevel | undefined>,
  displayOrder: JpVocabDailyDisplayOrder
): JpVocabWord[] {
  const weak = words.filter((word) => {
    const level = effectiveJpVocabDisplayLevel(word, sessionLevel[word.id], {
      displayOrder,
    });
    return level === "normal" || level === "weak";
  });
  if (!displayOrder.ids.length) return weak;
  return jpVocabWordsInOrder(weak, displayOrder.ids);
}

export function resolveJpVocabExportWords(
  scope: JpVocabExportScope,
  words: JpVocabWord[],
  displayOrder: JpVocabDailyDisplayOrder,
  sessionLevel: Record<number, JpVocabLevel | undefined>
): JpVocabWord[] {
  if (scope === "today_weak") {
    return filterJpVocabTodayWeakWords(words, sessionLevel, displayOrder);
  }
  if (displayOrder.ids.length > 0) {
    return jpVocabWordsInOrder(words, displayOrder.ids);
  }
  return [...words];
}

export async function exportJpVocabToWord(
  words: JpVocabWord[],
  scope: JpVocabExportScope,
  dailySeqByWordId: Map<number, number>
): Promise<void> {
  if (!words.length) {
    throw new Error(
      scope === "today_weak"
        ? "今日暂无勾选为「一般」或「不熟悉」的单词，无法导出。"
        : "单词表为空，无法导出。"
    );
  }

  const docx = await import("docx");
  const {
    AlignmentType,
    convertMillimetersToTwip,
    Document,
    Packer,
    Paragraph,
    TextRun,
  } = docx;

  const date = beijingDateString();
  const title =
    scope === "today_weak" ? "今日待巩固单词 / 语法" : "日语单词 / 语法表";
  const subtitle =
    scope === "today_weak"
      ? `${date} · 含今日抽查勾选为「一般」「不熟悉」的词条，便于次日课堂带读`
      : `${date} · 共 ${words.length} 条`;

  const children = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: convertMillimetersToTwip(2) },
      children: [
        new TextRun({
          text: title,
          bold: true,
          size: 32,
          font: "Microsoft YaHei",
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: convertMillimetersToTwip(6) },
      children: [
        new TextRun({
          text: subtitle,
          size: 18,
          color: "666666",
          font: "Microsoft YaHei",
        }),
      ],
    }),
    buildExportTable(words, docx, dailySeqByWordId),
  ];

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertMillimetersToTwip(14),
              bottom: convertMillimetersToTwip(14),
              left: convertMillimetersToTwip(12),
              right: convertMillimetersToTwip(12),
            },
          },
        },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const filenameBase =
    scope === "today_weak"
      ? `今日待巩固单词-${date}`
      : `日语单词表-${date}`;
  downloadBlob(blob, `${filenameBase}.docx`);
}
