/**
 * 从剪贴板取教案图 / PDF（对齐日语新课粘贴区）。
 */
export function pickClipboardLessonFile(
  clipboardData: DataTransfer | null | undefined
): File | null {
  if (!clipboardData) return null;

  for (const item of Array.from(clipboardData.items || [])) {
    const type = (item.type || "").toLowerCase();
    if (type.startsWith("image/") || type === "application/pdf") {
      const file = item.getAsFile();
      if (file && file.size > 0) return file;
    }
  }

  for (const file of Array.from(clipboardData.files || [])) {
    const type = (file.type || "").toLowerCase();
    if (
      type.startsWith("image/") ||
      type === "application/pdf" ||
      /\.pdf$/i.test(file.name)
    ) {
      if (file.size > 0) return file;
    }
  }

  return null;
}
