/** 远端 D1 保存/同步时橙色进度条动画时长（与发给学生一致） */
export const JP_VOCAB_SAVE_PROGRESS_DURATION_MS = 5000;

/** 排队等待写入时进度条显示的百分比 */
export const JP_VOCAB_SAVE_PROGRESS_QUEUED_PERCENT = 12;

export function jpVocabSaveProgressPercent(
  elapsedMs: number,
  durationMs = JP_VOCAB_SAVE_PROGRESS_DURATION_MS
): number {
  return Math.min(100, Math.round((elapsedMs / durationMs) * 100));
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
