const CACHE_VERSION = 1;

type CacheEnvelope<T> = {
  v: number;
  savedAt: number;
  data: T;
};

function readCacheEnvelope<T>(key: string): CacheEnvelope<T> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEnvelope<T>;
    if (parsed.v !== CACHE_VERSION || parsed.data == null) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function readClientCache<T>(key: string): T | null {
  return readCacheEnvelope<T>(key)?.data ?? null;
}

/** 缓存写入至今的毫秒数；无缓存时返回 null */
export function readClientCacheAge(key: string): number | null {
  const envelope = readCacheEnvelope(key);
  if (!envelope) return null;
  return Date.now() - envelope.savedAt;
}

export function writeClientCache<T>(key: string, data: T): void {
  if (typeof window === "undefined") return;
  try {
    const envelope: CacheEnvelope<T> = {
      v: CACHE_VERSION,
      savedAt: Date.now(),
      data,
    };
    localStorage.setItem(key, JSON.stringify(envelope));
  } catch {
    /* quota exceeded or private mode */
  }
}

export function clearClientCache(key: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function patchClientCache<T>(key: string, patch: (prev: T) => T): void {
  const prev = readClientCache<T>(key);
  if (prev == null) return;
  writeClientCache(key, patch(prev));
}

const inflightFetches = new Map<string, Promise<unknown>>();

/** 词表等大包默认上限；超时须清 loading，禁止无限转圈 */
export const CLIENT_SWR_FETCH_TIMEOUT_MS = 60_000;

function clientSwrHttpErrorMessage(status: number, bodyText: string): string {
  const trimmed = bodyText.trim();
  if (
    status === 503 ||
    status === 502 ||
    /error code:\s*1102/i.test(trimmed) ||
    /\b1102\b/.test(trimmed)
  ) {
    return "服务暂时繁忙，请稍后重试或点「更新缓存」";
  }
  if (status === 401 || status === 403) {
    return "请重新登录后再试";
  }
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as { error?: string };
      if (parsed.error) return String(parsed.error);
    } catch {
      /* fall through */
    }
  }
  return trimmed ? `加载失败（HTTP ${status}）` : `加载失败（HTTP ${status}）`;
}

/** 先读本地缓存（若有），再请求网络并写回缓存 */
export async function fetchWithClientCache<T>(
  cacheKey: string,
  url: string,
  parse: (json: unknown) => T,
  opts?: {
    credentials?: RequestCredentials;
    onCached?: (data: T) => void;
    /** 缓存仍在此时间内则跳过网络请求（毫秒） */
    ttlMs?: number;
    /** 忽略 ttl，强制拉取最新数据 */
    force?: boolean;
    /** fetch 超时（毫秒）；默认 CLIENT_SWR_FETCH_TIMEOUT_MS */
    timeoutMs?: number;
  }
): Promise<T> {
  const cached = readClientCache<T>(cacheKey);
  if (cached != null) opts?.onCached?.(cached);

  const ageMs = readClientCacheAge(cacheKey);
  if (
    cached != null &&
    !opts?.force &&
    opts?.ttlMs != null &&
    ageMs != null &&
    ageMs < opts.ttlMs
  ) {
    return cached;
  }

  const flightKey = `${cacheKey}\0${url}`;
  const existing = inflightFetches.get(flightKey);
  if (existing) return existing as Promise<T>;

  const timeoutMs = opts?.timeoutMs ?? CLIENT_SWR_FETCH_TIMEOUT_MS;

  const promise = (async () => {
    try {
      // 本地 SWR（localStorage + ttl）才是缓存层；浏览器 HTTP 缓存会让 force 仍拿到旧响应
      const res = await fetch(url, {
        credentials: opts?.credentials ?? "include",
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });
      const bodyText = await res.text();
      if (!res.ok) {
        throw new Error(clientSwrHttpErrorMessage(res.status, bodyText));
      }
      let json: unknown;
      try {
        json = bodyText ? JSON.parse(bodyText) : null;
      } catch {
        throw new Error(clientSwrHttpErrorMessage(res.status, bodyText));
      }
      const fresh = parse(json);
      writeClientCache(cacheKey, fresh);
      return fresh;
    } catch (err) {
      if (err instanceof DOMException && err.name === "TimeoutError") {
        throw new Error("加载超时，请稍后重试或点「更新缓存」");
      }
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error("加载超时，请稍后重试或点「更新缓存」");
      }
      throw err;
    } finally {
      inflightFetches.delete(flightKey);
    }
  })();

  inflightFetches.set(flightKey, promise);
  return promise;
}
