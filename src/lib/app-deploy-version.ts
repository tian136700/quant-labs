/**
 * 每次 production 构建前写入唯一版本戳（见 write_app_deploy_version.py）。
 * 客户端用它与 GET /api/app-deploy-version 比对；不一致则清 API 缓存并整页重载。
 */
export { APP_DEPLOY_VERSION } from "@/lib/app-deploy-version.generated";

export const APP_DEPLOY_VERSION_STORAGE_KEY = "iq:app-deploy-version";
export const APP_DEPLOY_RELOAD_GUARD_KEY = "iq:app-deploy-reload-for";

/** 可见态轮询间隔：勿低于 30s（Workers 日请求配额） */
export const APP_DEPLOY_VERSION_POLL_MS = 60_000;
export const APP_DEPLOY_VERSION_POLL_HIDDEN_MS = 5 * 60_000;

export const APP_DEPLOY_VERSION_API_PATH = "/api/app-deploy-version";

/** 版本变更时清掉本地 API 缓存键前缀，避免新 JS + 旧 list 缓存「像没改」 */
export const APP_DEPLOY_CLIENT_CACHE_PREFIXES = [
  "jp-api:",
  "en-api:",
  "ko-api:",
] as const;
