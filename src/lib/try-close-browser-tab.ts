/**
 * 尝试关闭当前浏览器标签。
 * 多数浏览器只允许关闭「由脚本打开」的窗口；普通书签/地址栏打开的标签常会被忽略。
 * 若关闭失败（页面仍在），约 200ms 后调用 onStillOpen，提示用户手动关。
 */
export function tryCloseBrowserTab(onStillOpen?: () => void): void {
  try {
    window.close();
  } catch {
    // ignore — 交给下方兜底提示
  }
  window.setTimeout(() => {
    if (typeof document === "undefined") return;
    // 关成功时页面已卸载，不会走到这里
    onStillOpen?.();
  }, 200);
}
