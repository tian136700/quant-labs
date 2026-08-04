/**
 * 部署版本变更后：清本地 API 缓存并整页重载（仅用户点击触发）。
 */

import {
  APP_DEPLOY_CLIENT_CACHE_PREFIXES,
  APP_DEPLOY_RELOAD_GUARD_KEY,
  APP_DEPLOY_VERSION_API_PATH,
  APP_DEPLOY_VERSION_STORAGE_KEY,
} from "@/lib/app-deploy-version";

export function clearAppDeployClientApiCaches(): void {
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

export function markAppDeployReloadGuard(serverVersion: string): void {
  try {
    sessionStorage.setItem(APP_DEPLOY_RELOAD_GUARD_KEY, serverVersion);
    localStorage.setItem(APP_DEPLOY_VERSION_STORAGE_KEY, serverVersion);
  } catch {
    // ignore
  }
}

export function alreadyReloadedForAppDeploy(serverVersion: string): boolean {
  try {
    return sessionStorage.getItem(APP_DEPLOY_RELOAD_GUARD_KEY) === serverVersion;
  } catch {
    return false;
  }
}

export async function fetchAppDeployServerVersion(
  signal?: AbortSignal
): Promise<string | null> {
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

/** 清 jp/en/ko API 缓存后整页重载，拉取新 HTML / JS chunk。 */
export function reloadForAppDeployVersion(serverVersion: string): void {
  if (alreadyReloadedForAppDeploy(serverVersion)) return;
  markAppDeployReloadGuard(serverVersion);
  clearAppDeployClientApiCaches();
  window.location.reload();
}
