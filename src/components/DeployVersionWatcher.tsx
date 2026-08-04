"use client";

import { useEffect, useRef, useState } from "react";
import {
  isAppDeployReloadHeld,
  subscribeAppDeployReloadHold,
} from "@/lib/app-deploy-reload-hold";
import {
  APP_DEPLOY_CLIENT_CACHE_PREFIXES,
  APP_DEPLOY_RELOAD_GUARD_KEY,
  APP_DEPLOY_VERSION,
  APP_DEPLOY_VERSION_API_PATH,
  APP_DEPLOY_VERSION_POLL_HIDDEN_MS,
  APP_DEPLOY_VERSION_POLL_MS,
  APP_DEPLOY_VERSION_STORAGE_KEY,
} from "@/lib/app-deploy-version";

function clearClientApiCaches(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (
        APP_DEPLOY_CLIENT_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix))
      ) {
        keys.push(key);
      }
    }
    for (const key of keys) {
      localStorage.removeItem(key);
    }
  } catch {
    // private mode / quota — still reload
  }
}

function markReloadGuard(serverVersion: string): void {
  try {
    sessionStorage.setItem(APP_DEPLOY_RELOAD_GUARD_KEY, serverVersion);
    localStorage.setItem(APP_DEPLOY_VERSION_STORAGE_KEY, serverVersion);
  } catch {
    // ignore
  }
}

function alreadyReloadedFor(serverVersion: string): boolean {
  try {
    return sessionStorage.getItem(APP_DEPLOY_RELOAD_GUARD_KEY) === serverVersion;
  } catch {
    return false;
  }
}

async function fetchServerVersion(signal?: AbortSignal): Promise<string | null> {
  try {
    const res = await fetch(APP_DEPLOY_VERSION_API_PATH, {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
      signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { ok?: boolean; version?: string };
    const version = typeof data.version === "string" ? data.version.trim() : "";
    return data.ok && version ? version : null;
  } catch {
    return null;
  }
}

function reloadNow(serverVersion: string): void {
  if (alreadyReloadedFor(serverVersion)) return;
  markReloadGuard(serverVersion);
  clearClientApiCaches();
  // 整页重载以拉取新 HTML / JS chunk（仅改 query 不够）
  window.location.reload();
}

/**
 * 部署上线后：开着的标签页检测到新 version → 顶部提示「有新版本 / 点击刷新」。
 * **只**在用户点「点击刷新」时清 API 缓存并 reload；可见/隐藏/抽查 hold 均不自动刷。
 * 轮询 60s（隐藏 5min）+ 切回前台立刻查一次；hold 期间只记 pending，松手后仍只出条。
 */
export function DeployVersionWatcher() {
  const bakedVersion = APP_DEPLOY_VERSION;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pendingReloadVersionRef = useRef<string | null>(null);
  const showBannerRef = useRef<(version: string) => void>(() => {});
  const [bannerVersion, setBannerVersion] = useState<string | null>(null);

  showBannerRef.current = (version: string) => {
    setBannerVersion(version);
  };

  useEffect(() => {
    let cancelled = false;

    const clearTimer = () => {
      if (timerRef.current != null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const scheduleNext = () => {
      clearTimer();
      if (cancelled) return;
      const ms = document.hidden
        ? APP_DEPLOY_VERSION_POLL_HIDDEN_MS
        : APP_DEPLOY_VERSION_POLL_MS;
      timerRef.current = setTimeout(() => {
        void check();
      }, ms);
    };

    /** 有新版本：只挂提示条，绝不自动 location.reload */
    const offerManualReload = (serverVersion: string) => {
      if (alreadyReloadedFor(serverVersion)) return;
      pendingReloadVersionRef.current = serverVersion;
      // 抽查 hold 时也不自动刷；条可以先出，点刷新时若仍 hold 则继续等
      if (!isAppDeployReloadHeld()) {
        showBannerRef.current(serverVersion);
      }
      scheduleNext();
    };

    const flushPendingBanner = () => {
      if (cancelled) return;
      const pending = pendingReloadVersionRef.current;
      if (!pending || isAppDeployReloadHeld()) return;
      if (alreadyReloadedFor(pending)) return;
      showBannerRef.current(pending);
    };

    const check = async () => {
      if (cancelled) return;
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      const serverVersion = await fetchServerVersion(ac.signal);
      if (cancelled || ac.signal.aborted) return;
      if (serverVersion && serverVersion !== bakedVersion) {
        offerManualReload(serverVersion);
        return;
      }
      scheduleNext();
    };

    const onVisibility = () => {
      if (document.hidden) {
        scheduleNext();
        return;
      }
      // 回前台：若有挂起的新版本，只出提示条，不自动刷
      flushPendingBanner();
      void check();
    };

    try {
      localStorage.setItem(APP_DEPLOY_VERSION_STORAGE_KEY, bakedVersion);
    } catch {
      // ignore
    }

    void check();
    document.addEventListener("visibilitychange", onVisibility);
    const unsubHold = subscribeAppDeployReloadHold(flushPendingBanner);

    return () => {
      cancelled = true;
      clearTimer();
      abortRef.current?.abort();
      document.removeEventListener("visibilitychange", onVisibility);
      unsubHold();
    };
  }, [bakedVersion]);

  if (!bannerVersion) return null;

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
          onClick={() => {
            const version = bannerVersion;
            if (!version) return;
            // 抽查卡开着：只收起条，等松 hold 后再出条；禁止硬刷打断抽查
            if (isAppDeployReloadHeld()) {
              pendingReloadVersionRef.current = version;
              setBannerVersion(null);
              return;
            }
            pendingReloadVersionRef.current = null;
            setBannerVersion(null);
            reloadNow(version);
          }}
        >
          点击刷新
        </button>
      </div>
    </>
  );
}
