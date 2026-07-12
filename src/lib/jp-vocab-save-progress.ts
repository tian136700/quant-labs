/** 远端 D1 保存/同步时橙色进度条动画时长（与发给学生一致） */
export const JP_VOCAB_SAVE_PROGRESS_DURATION_MS = 5000;

/** 排队等待写入时进度条显示的百分比 */
export const JP_VOCAB_SAVE_PROGRESS_QUEUED_PERCENT = 12;

/** 进度条文案场景（改保存 UI 时选用，见 JpVocabSaveProgressBar） */
export type JpVocabSaveProgressKind =
  | "share"
  | "sync_to_student"
  | "save_level"
  | "save";

export function jpVocabSaveProgressPercent(
  elapsedMs: number,
  durationMs = JP_VOCAB_SAVE_PROGRESS_DURATION_MS
): number {
  return Math.min(100, Math.round((elapsedMs / durationMs) * 100));
}

export function jpVocabSaveProgressLabel(
  kind: JpVocabSaveProgressKind,
  opts?: { queued?: boolean }
): string {
  if (opts?.queued) return "排队同步中…";
  switch (kind) {
    case "share":
      return "正在发给学生，传输中…";
    case "sync_to_student":
      return "正在同步到学生端…";
    case "save_level":
      return "正在保存熟悉程度…";
    case "save":
      return "正在保存，传输中…";
  }
}

/** 展示用百分比：有动画值用动画值，否则排队固定 12% */
export function jpVocabSaveProgressDisplayPercent(
  animatedPercent: number | null | undefined
): number {
  return animatedPercent ?? JP_VOCAB_SAVE_PROGRESS_QUEUED_PERCENT;
}

export async function animateJpVocabSaveProgressTo100(
  startedAtMs: number,
  setPercent: (percent: number) => void
): Promise<void> {
  const elapsed = Date.now() - startedAtMs;
  const current = jpVocabSaveProgressPercent(elapsed);
  if (current >= 100) {
    setPercent(100);
    await new Promise((resolve) => setTimeout(resolve, 120));
    return;
  }
  const steps = Math.max(4, Math.ceil((100 - current) / 5));
  const stepMs = Math.min(80, Math.round(400 / steps));
  for (let i = 1; i <= steps; i++) {
    await new Promise((resolve) => setTimeout(resolve, stepMs));
    const percent = current + Math.round(((100 - current) * i) / steps);
    setPercent(percent);
  }
  setPercent(100);
  await new Promise((resolve) => setTimeout(resolve, 120));
}
