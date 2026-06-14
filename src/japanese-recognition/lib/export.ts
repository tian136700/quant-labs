function timestampFilename(prefix: string, ext: string): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `${prefix}-${stamp}.${ext}`;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function downloadTranscriptTxt(text: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  triggerDownload(blob, timestampFilename("japanese-transcript", "txt"));
}

export function downloadTranscriptWord(text: string) {
  const body = escapeHtml(text).replace(/\n/g, "<br>");
  const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word">
<head><meta charset="utf-8"><title>日語聽寫</title></head>
<body style="font-family:'Noto Serif JP',serif;font-size:14pt;line-height:2;">${body}</body>
</html>`;
  const blob = new Blob(["\ufeff", html], {
    type: "application/msword;charset=utf-8",
  });
  triggerDownload(blob, timestampFilename("japanese-transcript", "doc"));
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

declare global {
  interface Window {
    html2pdf?: () => {
      set: (options: Record<string, unknown>) => {
        from: (element: HTMLElement) => {
          save: () => Promise<void>;
        };
      };
    };
  }
}

export async function downloadTranscriptPdf(text: string): Promise<void> {
  await loadScript(
    "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.2/html2pdf.bundle.min.js"
  );
  if (!window.html2pdf) {
    throw new Error("PDF 库加载失败");
  }

  const element = document.createElement("div");
  element.style.cssText =
    "padding:40px;font-family:'Noto Serif JP',serif;font-size:14pt;line-height:2;color:#1a1a2e;white-space:pre-wrap;word-break:break-all;width:794px;";
  element.textContent = text;
  document.body.appendChild(element);

  try {
    await window
      .html2pdf()
      .set({
        margin: 15,
        filename: timestampFilename("japanese-transcript", "pdf"),
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      })
      .from(element)
      .save();
  } finally {
    document.body.removeChild(element);
  }
}
