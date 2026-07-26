async function loadPdfJs() {
  const pdfjs = await import("pdfjs-dist");
  if (typeof window !== "undefined") {
    pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
  }
  return pdfjs;
}

export async function pdfToWord(file: File): Promise<Blob> {
  const [{ Document, Packer, Paragraph, TextRun }, pdfjs] = await Promise.all([
    import("docx"),
    loadPdfJs(),
  ]);
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buffer }).promise;

  const paragraphs: InstanceType<typeof Paragraph>[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const lines: string[] = [];
    let lastY: number | null = null;
    let line = "";

    for (const item of content.items) {
      if (!("str" in item)) continue;
      const str = item.str;
      const y = item.transform[5];
      if (lastY !== null && Math.abs(y - lastY) > 4) {
        if (line.trim()) lines.push(line.trim());
        line = str;
      } else {
        line += (line && str && !line.endsWith(" ") && !str.startsWith(" ") ? " " : "") + str;
      }
      lastY = y;
    }
    if (line.trim()) lines.push(line.trim());

    if (pdf.numPages > 1) {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text: `— Page ${pageNum} —`, bold: true })],
        })
      );
    }

    for (const text of lines) {
      paragraphs.push(new Paragraph({ children: [new TextRun(text)] }));
    }

    if (pageNum < pdf.numPages) {
      paragraphs.push(new Paragraph({ children: [new TextRun("")] }));
    }
  }

  if (!paragraphs.length) {
    paragraphs.push(new Paragraph({ children: [new TextRun("(No extractable text found)")] }));
  }

  const doc = new Document({ sections: [{ children: paragraphs }] });
  return Packer.toBlob(doc);
}

export async function pdfToExcel(file: File): Promise<Blob> {
  const XLSX = await import("xlsx");
  const pdfjs = await loadPdfJs();
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buffer }).promise;

  const rows: string[][] = [["Page", "Line", "Content"]];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const lines: string[] = [];
    let lastY: number | null = null;
    let line = "";

    for (const item of content.items) {
      if (!("str" in item)) continue;
      const str = item.str;
      const y = item.transform[5];
      if (lastY !== null && Math.abs(y - lastY) > 4) {
        if (line.trim()) lines.push(line.trim());
        line = str;
      } else {
        line += (line && str && !line.endsWith(" ") && !str.startsWith(" ") ? " " : "") + str;
      }
      lastY = y;
    }
    if (line.trim()) lines.push(line.trim());

    lines.forEach((text, idx) => {
      rows.push([String(pageNum), String(idx + 1), text]);
    });
  }

  if (rows.length === 1) {
    rows.push(["1", "1", "(No extractable text found)"]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "PDF Content");
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export async function wordToPdf(file: File): Promise<Blob> {
  const mammoth = await import("mammoth");
  const { jsPDF } = await import("jspdf");

  const buffer = await file.arrayBuffer();
  const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
  const html = result.value || "<p>(Empty document)</p>";

  const container = document.createElement("div");
  container.style.cssText =
    "position:fixed;left:-9999px;top:0;width:595px;padding:40px;font-family:Arial,sans-serif;font-size:12pt;line-height:1.6;color:#000;background:#fff;";
  container.innerHTML = html;
  document.body.appendChild(container);

  try {
    const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
    await pdf.html(container, {
      x: 0,
      y: 0,
      width: 515,
      windowWidth: 595,
      autoPaging: "text",
      margin: [40, 40, 40, 40],
    });
    return pdf.output("blob");
  } finally {
    document.body.removeChild(container);
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function outputFilename(inputName: string, ext: string): string {
  const base = inputName.replace(/\.[^.]+$/, "") || "converted";
  return `${base}.${ext}`;
}
