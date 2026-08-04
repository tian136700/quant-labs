"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  isAppDeployReloadHeld,
  subscribeAppDeployReloadHold,
} from "@/lib/app-deploy-reload-hold";
import {
  alreadyReloadedForAppDeploy,
  fetchAppDeployServerVersion,
  reloadForAppDeployVersion,
} from "@/lib/app-deploy-reload-client";
import {
  APP_DEPLOY_VERSION,
  APP_DEPLOY_VERSION_POLL_HIDDEN_MS,
  APP_DEPLOY_VERSION_POLL_MS,
  APP_DEPLOY_VERSION_STORAGE_KEY,
} from "@/lib/app-deploy-version";

type AppDeployVersionContextValue = {
  /** 线上 version 与本页构建戳不一致时非空 */
  pendingVersion: string | null;
  hasUpdate: boolean;
  /** 用户点「刷新缓存 / 点击刷新」：hold 时只收起提示；否则清缓存并 reload */
  applyPendingReload: () => void;
  /** 收起顶部条（仍保留 pending，顶栏按钮保持亮） */
  dismissBanner: () => void;
  /** 顶部条是否展示（与顶栏按钮可同时亮） */
  bannerVisible: boolean;
  showBanner: () => void;
};

const AppDeployVersionContext =
  createContext<AppDeployVersionContextValue | null>(null);

export function useAppDeployVersion(): AppDeployVersionContextValue {
  const ctx = useContext(AppDeployVersionContext);
  if (!ctx) {
    throw new Error("useAppDeployVersion must be used within AppDeployVersionProvider");
  }
  return ctx;
}

/**
 * 轮询 GET /api/app-deploy-version；有新版只记 pending，绝不自动 reload。
 * 顶栏「刷新缓存」与顶部提示条共用同一状态。
 */
export function AppDeployVersionProvider({ children }: { children: ReactNode }) {
  const bakedVersion = APP_DEPLOY_VERSION;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pendingReloadVersionRef = useRef<string | null>(null);
  const [pendingVersion, setPendingVersion] = useState<string | null>(null);
  const [bannerVisible, setBannerVisible] = useState(false);

  const offerManualReload = useCallback((serverVersion: string) => {
    if (alreadyReloadedForAppDeploy(serverVersion)) return;
    pendingReloadVersionRef.current = serverVersion;
    setPendingVersion(serverVersion);
    if (!isAppDeployReloadHeld()) {
      setBannerVisible(true);
    }
  }, []);

  const flushPendingBanner = useCallback(() => {
    const pending = pendingReloadVersionRef.current;
    if (!pending || isAppDeployReloadHeld()) return;
    if (alreadyReloadedForAppDeploy(pending)) return;
    setPendingVersion(pending);
    setBannerVisible(true);
  }, []);

  const applyPendingReload = useCallback(() => {
    const version = pendingReloadVersionRef.current ?? pendingVersion;
    if (!version) return;
    if (isAppDeployReloadHeld()) {
      pendingReloadVersionRef.current = version;
      setBannerVisible(false);
      return;
    }
    pendingReloadVersionRef.current = null;
    setPendingVersion(null);
    setBannerVisible(false);
    reloadForAppDeployVersion(version);
  }, [pendingVersion]);

  const dismissBanner = useCallback(() => {
    setBannerVisible(false);
  }, []);

  const showBanner = useCallback(() => {
    if (!pendingReloadVersionRef.current && !pendingVersion) return;
    if (isAppDeployReloadHeld()) return;
    setBannerVisible(true);
  }, [pendingVersion]);

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

    const check = async () => {
      if (cancelled) return;
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      const serverVersion = await fetchAppDeployServerVersion(ac.signal);
      if (cancelled || ac.signal.aborted) return;
      if (serverVersion && serverVersion !== bakedVersion) {
        offerManualReload(serverVersion);
        scheduleNext();
        return;
      }
      // 线上已与本页一致：灭掉亮态
      if (!cancelled) {
        pendingReloadVersionRef.current = null;
        setPendingVersion(null);
        setBannerVisible(false);
      }
      scheduleNext();
    };

    const onVisibility = () => {
      if (document.hidden) {
        scheduleNext();
        return;
      }
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
  }, [bakedVersion, flushPendingBanner, offerManualReload]);

  const value = useMemo<AppDeployVersionContextValue>(
    () => ({
      pendingVersion,
      hasUpdate: Boolean(pendingVersion),
      applyPendingReload,
      dismissBanner,
      bannerVisible,
      showBanner,
    }),
    [
      pendingVersion,
      applyPendingReload,
      dismissBanner,
      bannerVisible,
      showBanner,
    ]
  );

  return (
    <AppDeployVersionContext.Provider value={value}>
      {children}
    </AppDeployVersionContext.Provider>
  );
}
