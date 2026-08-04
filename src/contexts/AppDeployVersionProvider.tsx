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
  /** 用户点顶栏「刷新缓存」：抽查 hold 时不刷（按钮保持亮）；否则清缓存并 reload */
  applyPendingReload: () => void;
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
 * 轮询 GET /api/app-deploy-version；有新版只记 pending（顶栏「刷新缓存」亮），绝不自动 reload。
 */
export function AppDeployVersionProvider({ children }: { children: ReactNode }) {
  const bakedVersion = APP_DEPLOY_VERSION;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pendingReloadVersionRef = useRef<string | null>(null);
  const [pendingVersion, setPendingVersion] = useState<string | null>(null);

  const offerManualReload = useCallback((serverVersion: string) => {
    if (alreadyReloadedForAppDeploy(serverVersion)) return;
    pendingReloadVersionRef.current = serverVersion;
    setPendingVersion(serverVersion);
  }, []);

  const reassertPending = useCallback(() => {
    const pending = pendingReloadVersionRef.current;
    if (!pending) return;
    if (alreadyReloadedForAppDeploy(pending)) return;
    setPendingVersion(pending);
  }, []);

  const applyPendingReload = useCallback(() => {
    const version = pendingReloadVersionRef.current ?? pendingVersion;
    if (!version) return;
    // 抽查卡打开：不打断；pending 保留，顶栏按钮继续亮
    if (isAppDeployReloadHeld()) return;
    pendingReloadVersionRef.current = null;
    setPendingVersion(null);
    reloadForAppDeployVersion(version);
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
      if (!cancelled) {
        pendingReloadVersionRef.current = null;
        setPendingVersion(null);
      }
      scheduleNext();
    };

    const onVisibility = () => {
      if (document.hidden) {
        scheduleNext();
        return;
      }
      reassertPending();
      void check();
    };

    try {
      localStorage.setItem(APP_DEPLOY_VERSION_STORAGE_KEY, bakedVersion);
    } catch {
      // ignore
    }

    void check();
    document.addEventListener("visibilitychange", onVisibility);
    const unsubHold = subscribeAppDeployReloadHold(reassertPending);

    return () => {
      cancelled = true;
      clearTimer();
      abortRef.current?.abort();
      document.removeEventListener("visibilitychange", onVisibility);
      unsubHold();
    };
  }, [bakedVersion, offerManualReload, reassertPending]);

  const value = useMemo<AppDeployVersionContextValue>(
    () => ({
      pendingVersion,
      hasUpdate: Boolean(pendingVersion),
      applyPendingReload,
    }),
    [pendingVersion, applyPendingReload]
  );

  return (
    <AppDeployVersionContext.Provider value={value}>
      {children}
    </AppDeployVersionContext.Provider>
  );
}
