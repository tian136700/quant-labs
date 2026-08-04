/**
 * 部署版本变更时 DeployVersionWatcher 只出「点击刷新」条。
 * 抽查卡打开等场景须 hold：点刷新也不硬刷，松 hold 后再出条。
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
