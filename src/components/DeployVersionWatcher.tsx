"use client";

import { useAppDeployVersion } from "@/contexts/AppDeployVersionProvider";

/**
 * 部署上线后：开着的标签页检测到新 version → 顶部提示「有新版本 / 点击刷新」。
 * **只**在用户点「点击刷新」时清 API 缓存并 reload；可见/隐藏/抽查 hold 均不自动刷。
 * 顶栏「刷新缓存」按钮与此共用 pending 状态（见 DeployCacheRefreshButton）。
 */
export function DeployVersionWatcher() {
  const { bannerVisible, pendingVersion, applyPendingReload } =
    useAppDeployVersion();

  if (!bannerVisible || !pendingVersion) return null;

  return (
    <>
      <style jsx global>{`
        .iq-deploy-reload-banner {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 12000;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: center;
          gap: 0.65rem 0.85rem;
          padding: max(0.55rem, env(safe-area-inset-top, 0px)) 0.85rem 0.55rem;
          background: #1a2332;
          color: #f5f7fa;
          font-size: 0.92rem;
          line-height: 1.35;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.22);
        }
        .iq-deploy-reload-banner__text {
          margin: 0;
          text-align: center;
        }
        .iq-deploy-reload-banner__btn {
          appearance: none;
          border: none;
          border-radius: 6px;
          padding: 0.45rem 0.9rem;
          min-height: 2.25rem;
          background: #f0a060;
          color: #1a1208;
          font-size: 0.92rem;
          font-weight: 600;
          cursor: pointer;
        }
        .iq-deploy-reload-banner__btn:active {
          filter: brightness(0.95);
        }
        @media (max-width: 767px) {
          .iq-deploy-reload-banner {
            font-size: 0.88rem;
            gap: 0.5rem;
          }
          .iq-deploy-reload-banner__btn {
            min-height: 2.5rem;
            padding: 0.5rem 1rem;
          }
        }
      `}</style>
      <div
        className="iq-deploy-reload-banner"
        role="status"
        aria-live="polite"
      >
        <p className="iq-deploy-reload-banner__text">有新版本可用</p>
        <button
          type="button"
          className="iq-deploy-reload-banner__btn"
          onClick={() => applyPendingReload()}
        >
          点击刷新
        </button>
      </div>
    </>
  );
}
