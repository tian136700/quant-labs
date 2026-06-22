const CACHE_VERSION = 1;

type CacheEnvelope<T> = {
  v: number;
  savedAt: number;
  data: T;
};

export function readClientCache<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEnvelope<T>;
    if (parsed.v !== CACHE_VERSION || parsed.data == null) return null;
    return parsed.data;
  } catch {
    return null;
  }
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

/** 先读本地缓存（若有），再请求网络并写回缓存 */
export async function fetchWithClientCache<T>(
  cacheKey: string,
  url: string,
  parse: (json: unknown) => T,
  opts?: {
    credentials?: RequestCredentials;
    onCached?: (data: T) => void;
  }
): Promise<T> {
  const cached = readClientCache<T>(cacheKey);
  if (cached != null) opts?.onCached?.(cached);

  const res = await fetch(url, { credentials: opts?.credentials ?? "include" });
  const json = (await res.json()) as unknown;
  const fresh = parse(json);
  writeClientCache(cacheKey, fresh);
  return fresh;
}
