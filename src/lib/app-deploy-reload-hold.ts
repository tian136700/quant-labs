/**
 * 部署版本变更时 DeployVersionWatcher 会整页 reload。
 * 抽查卡打开等「不能打断」场景须 hold：检测到新版本先挂起，hold 放掉后再 reload。
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
