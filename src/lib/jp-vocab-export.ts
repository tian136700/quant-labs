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

/** 备注图片每行最多几张 */
const EXPORT_IMAGES_PER_ROW = 3;
/** 图片超过此行数时，该词条独占一页 */
const EXPORT_OWN_PAGE_MIN_IMAGES = 4;

/** A4 内容区约宽（px，与教案分页导出一致） */
const EXPORT_CONTENT_WIDTH_PX = 642;
const EXPORT_IMAGE_CELL_GAP_PX = 8;
const EXPORT_IMAGE_MAX_HEIGHT_PX = 220;

type NoteImagePayload = {
  data: Uint8Array;
  width: number;
  height: number;
  type: "png" | "jpg";
};

type DocxModule = typeof import("docx");
type DocxChild = InstanceType<DocxModule["Paragraph"]> | InstanceType<DocxModule["Table"]>;

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function calcImageDrawSize(
  imgW: number,
  imgH: number,
  maxW: number,
  maxH: number
): { width: number; height: number } {
  let drawW = maxW;
  let drawH = (imgH / imgW) * drawW;
  if (drawH > maxH) {
    drawH = maxH;
    drawW = (imgW / imgH) * drawH;
  }
  return { width: Math.round(drawW), height: Math.round(drawH) };
}

function imageTypeFromContentType(contentType: string | null): "png" | "jpg" {
  if (contentType?.includes("jpeg") || contentType?.includes("jpg")) return "jpg";
  return "png";
}

async function readImageDimensions(
  data: Uint8Array,
  type: "png" | "jpg"
): Promise<{ width: number; height: number }> {
  const mime = type === "jpg" ? "image/jpeg" : "image/png";
  const blob = new Blob([data.slice()], { type: mime });
  const url = URL.createObjectURL(blob);
  try {
    const bitmap = await createImageBitmap(blob);
    bitmap.close();
    return { width: bitmap.width, height: bitmap.height };
  } catch {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error("图片尺寸读取失败"));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function fetchNoteImage(src: string): Promise<NoteImagePayload | null> {
  try {
    const url = src.startsWith("http")
      ? src
      : `${window.location.origin}${src.startsWith("/") ? src : `/${src}`}`;
    const res = await fetch(url, { credentials: "same-origin" });
    if (!res.ok) return null;
    const type = imageTypeFromContentType(res.headers.get("Content-Type"));
    const buffer = await res.arrayBuffer();
    const data = new Uint8Array(buffer);
    const { width, height } = await readImageDimensions(data, type);
    return { data, width, height, type };
  } catch {
    return null;
  }
}

function collectNoteImageSrcs(words: JpVocabWord[]): string[] {
  const seen = new Set<string>();
  const srcs: string[] = [];
  for (const word of words) {
    for (const entry of parseJpVocabClassNotes(word.class_notes)) {
      for (const segment of parseJpVocabClassNoteContent(entry.content)) {
        if (segment.type !== "image" || seen.has(segment.src)) continue;
        seen.add(segment.src);
        srcs.push(segment.src);
      }
    }
  }
  return srcs;
}

async function prefetchNoteImages(
  words: JpVocabWord[]
): Promise<Map<string, NoteImagePayload>> {
  const srcs = collectNoteImageSrcs(words);
  const entries = await Promise.all(
    srcs.map(async (src) => [src, await fetchNoteImage(src)] as const)
  );
  const map = new Map<string, NoteImagePayload>();
  for (const [src, payload] of entries) {
    if (payload) map.set(src, payload);
  }
  return map;
}

/** 界面占位符，导出时视为无内容 */
const EXPORT_FIELD_PLACEHOLDERS = new Set([
  "—",
  "-",
  "–",
  "待补全",
  "无",
  "暂无",
  "n/a",
  "N/A",
]);

function normalizeExportFieldValue(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return "";
  if (EXPORT_FIELD_PLACEHOLDERS.has(trimmed)) return "";
  return trimmed;
}

function hasExportableFieldValue(value: string | null | undefined): boolean {
  return Boolean(normalizeExportFieldValue(value));
}

function entryHasExportableContent(
  content: string,
  imageCache: Map<string, NoteImagePayload>
): boolean {
  return parseJpVocabClassNoteContent(content).some(
    (segment) =>
      (segment.type === "text" && segment.text.trim()) ||
      (segment.type === "image" && imageCache.has(segment.src))
  );
}

function countWordExportableNoteImages(
  word: JpVocabWord,
  imageCache: Map<string, NoteImagePayload>
): number {
  let count = 0;
  for (const entry of parseJpVocabClassNotes(word.class_notes)) {
    for (const segment of parseJpVocabClassNoteContent(entry.content)) {
      if (segment.type === "image" && imageCache.has(segment.src)) count++;
    }
  }
  return count;
}

function labeledParagraph(
  docx: DocxModule,
  label: string,
  value: string,
  opts?: { valueBold?: boolean; valueSize?: number; after?: number }
) {
  const { Paragraph, TextRun } = docx;
  return new Paragraph({
    spacing: opts?.after != null ? { after: opts.after } : { after: 60 },
    children: [
      new TextRun({
        text: `${label}：`,
        bold: true,
        size: 20,
        font: "Microsoft YaHei",
      }),
      new TextRun({
        text: value.trim(),
        bold: opts?.valueBold,
        size: opts?.valueSize ?? 22,
        font: "Microsoft YaHei",
      }),
    ],
  });
}

function textParagraphs(
  docx: DocxModule,
  text: string,
  opts?: {
    size?: number;
    color?: string;
    spacingAfter?: number;
    /** 备注正文：首行缩进约 2 个中文字符 */
    firstLineIndent?: boolean;
  }
) {
  const { Paragraph, TextRun, convertMillimetersToTwip } = docx;
  const firstLine = opts?.firstLineIndent
    ? convertMillimetersToTwip(7.5)
    : undefined;

  return text.split("\n").map(
    (line, index, lines) =>
      new Paragraph({
        indent: firstLine != null ? { firstLine } : undefined,
        spacing:
          index < lines.length - 1
            ? { after: 40 }
            : opts?.spacingAfter != null
              ? { after: opts.spacingAfter }
              : undefined,
        children: [
          new TextRun({
            text: line || " ",
            size: opts?.size ?? 20,
            color: opts?.color,
            font: "Microsoft YaHei",
          }),
        ],
      })
  );
}

function buildNoteImageGrid(
  docx: DocxModule,
  images: NoteImagePayload[]
): InstanceType<DocxModule["Table"]> {
  const {
    AlignmentType,
    BorderStyle,
    ImageRun,
    Paragraph,
    Table,
    TableCell,
    TableRow,
    WidthType,
  } = docx;

  const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const borders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };
  const cellWidthPx =
    (EXPORT_CONTENT_WIDTH_PX - EXPORT_IMAGE_CELL_GAP_PX * (EXPORT_IMAGES_PER_ROW - 1)) /
    EXPORT_IMAGES_PER_ROW;
  const rows: InstanceType<DocxModule["TableRow"]>[] = [];

  for (let row = 0; row < Math.ceil(images.length / EXPORT_IMAGES_PER_ROW); row++) {
    const rowImages = images.slice(
      row * EXPORT_IMAGES_PER_ROW,
      row * EXPORT_IMAGES_PER_ROW + EXPORT_IMAGES_PER_ROW
    );
    const colPercent = Math.floor(100 / rowImages.length);
    const cells: InstanceType<DocxModule["TableCell"]>[] = [];

    for (const image of rowImages) {
      const { width, height } = calcImageDrawSize(
        image.width,
        image.height,
        cellWidthPx,
        EXPORT_IMAGE_MAX_HEIGHT_PX
      );
      cells.push(
        new TableCell({
          borders,
          width: { size: colPercent, type: WidthType.PERCENTAGE },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { after: 80 },
              children: [
                new ImageRun({
                  type: image.type,
                  data: image.data,
                  transformation: { width, height },
                }),
              ],
            }),
          ],
        })
      );
    }
    rows.push(new TableRow({ children: cells }));
  }

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows,
  });
}

function buildNoteEntryBlocks(
  docx: DocxModule,
  content: string,
  imageCache: Map<string, NoteImagePayload>
): DocxChild[] {
  const segments = parseJpVocabClassNoteContent(content);
  const blocks: DocxChild[] = [];
  let pendingImages: NoteImagePayload[] = [];

  const flushImages = () => {
    if (!pendingImages.length) return;
    blocks.push(buildNoteImageGrid(docx, pendingImages));
    pendingImages = [];
  };

  for (const segment of segments) {
    if (segment.type === "text") {
      flushImages();
      const trimmed = segment.text.trim();
      if (trimmed) {
        blocks.push(
          ...textParagraphs(docx, trimmed, { spacingAfter: 80, firstLineIndent: true })
        );
      }
      continue;
    }

    const image = imageCache.get(segment.src);
    if (image) {
      pendingImages.push(image);
    }
  }

  flushImages();
  return blocks;
}

function buildClassNotesBlocks(
  docx: DocxModule,
  word: JpVocabWord,
  imageCache: Map<string, NoteImagePayload>
): DocxChild[] {
  const { Paragraph, TextRun } = docx;
  const exportableEntries = parseJpVocabClassNotes(word.class_notes).filter((entry) =>
    entryHasExportableContent(entry.content, imageCache)
  );
  if (!exportableEntries.length) return [];

  const contentBlocks: DocxChild[] = [];

  exportableEntries.forEach((entry, entryIndex) => {
    const entryBlocks = buildNoteEntryBlocks(docx, entry.content, imageCache);
    if (!entryBlocks.length) return;

    if (entry.timestamp) {
      contentBlocks.push(
        ...textParagraphs(docx, entry.timestamp, {
          size: 18,
          color: "666666",
          spacingAfter: 60,
        })
      );
    }
    contentBlocks.push(...entryBlocks);
    if (entryIndex < exportableEntries.length - 1) {
      contentBlocks.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
    }
  });

  if (!contentBlocks.length) return [];

  return [
    new Paragraph({
      spacing: { after: 60 },
      children: [
        new TextRun({
          text: "备注：",
          bold: true,
          size: 20,
          font: "Microsoft YaHei",
        }),
      ],
    }),
    ...contentBlocks,
  ];
}

function buildWordBlock(
  docx: DocxModule,
  word: JpVocabWord,
  index: number,
  imageCache: Map<string, NoteImagePayload>,
  opts: { pageBreakBefore: boolean }
): DocxChild[] {
  const { BorderStyle, convertMillimetersToTwip, PageBreak, Paragraph, TextRun } = docx;
  const exportNum = index + 1;
  const isGrammar = word.kind === "grammar";
  const wordText = word.word.trim();
  const typeLabel = isGrammar ? "语法" : "单词";

  const blocks: DocxChild[] = [];

  if (opts.pageBreakBefore) {
    blocks.push(new Paragraph({ children: [new PageBreak()] }));
  }

  blocks.push(
    new Paragraph({
      spacing: { after: 80 },
      children: [
        new TextRun({
          text: `${exportNum}. `,
          bold: true,
          size: 28,
          font: "Microsoft YaHei",
        }),
        new TextRun({
          text: wordText,
          bold: true,
          size: 28,
          font: "Microsoft YaHei",
        }),
      ],
    })
  );

  const reading = normalizeExportFieldValue(word.reading);
  const meaning = normalizeExportFieldValue(word.meaning);
  const pos = normalizeExportFieldValue(word.pos);
  const optionalFields: { label: string; value: string }[] = [];
  if (hasExportableFieldValue(reading)) optionalFields.push({ label: "读音", value: reading });
  optionalFields.push({ label: "类型", value: typeLabel });
  if (hasExportableFieldValue(meaning)) optionalFields.push({ label: "释义", value: meaning });
  if (hasExportableFieldValue(pos)) optionalFields.push({ label: "词性", value: pos });

  const noteBlocks = buildClassNotesBlocks(docx, word, imageCache);

  optionalFields.forEach((field, fieldIndex) => {
    const isLastField =
      fieldIndex === optionalFields.length - 1 && !noteBlocks.length;
    blocks.push(
      labeledParagraph(docx, field.label, field.value, {
        after: isLastField ? 80 : undefined,
      })
    );
  });

  if (noteBlocks.length) {
    blocks.push(...noteBlocks);
  }

  blocks.push(
    new Paragraph({
      spacing: {
        before: convertMillimetersToTwip(index === 0 ? 2 : 4),
        after: convertMillimetersToTwip(4),
      },
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 4, color: "D8D8D8" },
      },
      children: [],
    })
  );

  return blocks;
}

async function buildExportWordBlocks(
  words: JpVocabWord[],
  docx: DocxModule
): Promise<DocxChild[]> {
  const imageCache = await prefetchNoteImages(words);
  const blocks: DocxChild[] = [];

  words.forEach((word, index) => {
    const imageCount = countWordExportableNoteImages(word, imageCache);
    const pageBreakBefore =
      index > 0 && imageCount >= EXPORT_OWN_PAGE_MIN_IMAGES;
    blocks.push(
      ...buildWordBlock(docx, word, index, imageCache, {
        pageBreakBefore,
      })
    );
  });

  return blocks;
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
  _dailySeqByWordId: Map<number, number>
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

  const wordBlocks = await buildExportWordBlocks(words, docx);

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
    ...wordBlocks,
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
