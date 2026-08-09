/**
 * 部署版本变更时顶栏「刷新」亮起；用户点了才清缓存并 reload。
 * 抽查卡打开等场景须 hold：点「刷新」也不硬刷，松 hold 后按钮仍亮可点。
 */

let holdCount = 0;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      // ignore listener errors
    }
  }
}

/** 占住强制刷新；返回 release（可安全多次调用）。 */
export function holdAppDeployReload(): () => void {
  holdCount += 1;
  notify();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holdCount = Math.max(0, holdCount - 1);
    notify();
  };
}

export function isAppDeployReloadHeld(): boolean {
  return holdCount > 0;
}

export function subscribeAppDeployReloadHold(
  listener: () => void
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
