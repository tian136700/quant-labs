"use client";

import { useEffect, useRef } from "react";
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
 * 部署上线后：开着的标签页检测到新 version → 清 API 本地缓存并强制刷新。
 * 轮询 60s（隐藏 5min）+ 切回前台立刻查一次，避免顶 Workers 日请求。
 * 抽查卡等 hold 期间不 reload，等放锁后再刷。
 */
export function DeployVersionWatcher() {
  const bakedVersion = APP_DEPLOY_VERSION;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pendingReloadVersionRef = useRef<string | null>(null);

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

    const requestReloadForNewDeploy = (serverVersion: string) => {
      if (alreadyReloadedFor(serverVersion)) return;
      if (isAppDeployReloadHeld()) {
        pendingReloadVersionRef.current = serverVersion;
        scheduleNext();
        return;
      }
      pendingReloadVersionRef.current = null;
      reloadNow(serverVersion);
    };

    const flushPendingReload = () => {
      if (cancelled) return;
      const pending = pendingReloadVersionRef.current;
      if (!pending || isAppDeployReloadHeld()) return;
      pendingReloadVersionRef.current = null;
      reloadNow(pending);
    };

    const check = async () => {
      if (cancelled) return;
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      const serverVersion = await fetchServerVersion(ac.signal);
      if (cancelled || ac.signal.aborted) return;
      if (serverVersion && serverVersion !== bakedVersion) {
        requestReloadForNewDeploy(serverVersion);
        return;
      }
      scheduleNext();
    };

    const onVisibility = () => {
      if (document.hidden) {
        scheduleNext();
        return;
      }
      void check();
    };

    try {
      localStorage.setItem(APP_DEPLOY_VERSION_STORAGE_KEY, bakedVersion);
    } catch {
      // ignore
    }

    void check();
    document.addEventListener("visibilitychange", onVisibility);
    const unsubHold = subscribeAppDeployReloadHold(flushPendingReload);

    return () => {
      cancelled = true;
      clearTimer();
      abortRef.current?.abort();
      document.removeEventListener("visibilitychange", onVisibility);
      unsubHold();
    };
  }, [bakedVersion]);

  return null;
}
