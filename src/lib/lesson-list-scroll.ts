/**
 * 新课列表改老师 / 上课时间后，按时间重排会让视口停在别的 ID 上。
 * 保存成功后调用，把刚编辑的那条滚回可见区域。
 */
export function scrollLessonListItemIntoView(lessonId: number): void {
  if (!Number.isInteger(lessonId) || lessonId <= 0) return;

  const run = () => {
    const nodes = document.querySelectorAll(`[data-lesson-anchor="${lessonId}"]`);
    let target: HTMLElement | null = null;
    nodes.forEach((node) => {
      if (target || !(node instanceof HTMLElement)) return;
      // 手机端桌面 ID 列 display:none，必须挑可见节点
      if (node.getClientRects().length > 0) target = node;
    });
    target?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "auto" });
  };

  // 等弹窗卸载 + 列表按新时间重排完成后再滚
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(run);
  });
}

/** 关弹窗前去掉焦点，避免浏览器把焦点还回已卸载按钮并误滚页面 */
export function blurActiveElementForLessonModalClose(): void {
  const el = document.activeElement;
  if (el instanceof HTMLElement) el.blur();
}
