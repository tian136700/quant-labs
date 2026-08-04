"use client";

import { useAppDeployVersion } from "@/contexts/AppDeployVersionProvider";

type DeployCacheRefreshButtonProps = {
  /** 抽屉内全宽；桌面顶栏用 compact */
  fullWidth?: boolean;
};

/**
 * 顶栏最右侧「刷新缓存」：
 * - 有新部署版本 → 亮（可点，清本地 API 缓存并整页重载）
 * - 无更新 → 暗但仍可读（不可点；勿叠 opacity 到看不见）
 */
export function DeployCacheRefreshButton({
  fullWidth = false,
}: DeployCacheRefreshButtonProps) {
  const { hasUpdate, applyPendingReload } = useAppDeployVersion();

  return (
    <button
      type="button"
      className={[
        "btn-rsi-filter",
        "btn-rsi-filter--compact",
        "iq-deploy-cache-refresh",
        hasUpdate ? "iq-deploy-cache-refresh--lit" : "iq-deploy-cache-refresh--dim",
        fullWidth ? "iq-deploy-cache-refresh--block" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      disabled={!hasUpdate}
      aria-disabled={!hasUpdate}
      title={
        hasUpdate
          ? "有新版本：点击清缓存并刷新页面"
          : "当前已是最新代码"
      }
      onClick={() => {
        if (!hasUpdate) return;
        applyPendingReload();
      }}
    >
      刷新缓存
    </button>
  );
}
