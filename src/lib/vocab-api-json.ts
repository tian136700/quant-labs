import { parseCf1102FromText } from "@/lib/worker-1102-client-shared";

/** Worker 过载时 POST 写库短重试（避免一遇 1102 就弹「保存失败」） */
export const VOCAB_API_OVERLOAD_RETRY_ATTEMPTS = 3;
export const VOCAB_API_OVERLOAD_RETRY_BASE_MS = 1_500;

export type VocabApiJsonFail = {
  ok: false;
  status: number;
  error: string;
  isWorkerOverload: boolean;
  bodySnip: string;
};

export type VocabApiJsonOk<T> = { ok: true; data: T };

function looksLikeHtmlBody(contentType: string, body: string): boolean {
  if (/text\/html/i.test(contentType)) return true;
  const trimmed = body.trim();
  return /^<!DOCTYPE html/i.test(trimmed) || /^<html[\s>]/i.test(trimmed);
}

/**
 * 解析词表 API 响应：Cloudflare 1102/5xx 常返回 HTML，
 * 直接 res.json() 会变成无意义的「保存失败」。
 */
export async function readVocabApiJsonResponse<T>(
  res: Response
): Promise<VocabApiJsonOk<T> | VocabApiJsonFail> {
  const contentType = res.headers.get("content-type") || "";
  const text = await res.text();
  const trimmed = text.trim();
  const parsed1102 = parseCf1102FromText(trimmed);
  const html = looksLikeHtmlBody(contentType, trimmed);
  const isWorkerOverload =
    html ||
    parsed1102.is1102 ||
    res.status === 502 ||
    res.status === 503 ||
    res.status === 504;

  if (html || parsed1102.is1102) {
    const ray = parsed1102.cfRay ? ` ray=${parsed1102.cfRay}` : "";
    const code = parsed1102.is1102 ? " Error 1102" : "";
    return {
      ok: false,
      status: res.status,
      error: `Worker过载(HTTP ${res.status}${code})，请稍后再试${ray}`,
      isWorkerOverload: true,
      bodySnip: parsed1102.snip || trimmed.slice(0, 200),
    };
  }

  if (!trimmed) {
    return {
      ok: false,
      status: res.status,
      error: isWorkerOverload
        ? `Worker过载(HTTP ${res.status})，空响应`
        : `空响应（HTTP ${res.status}）`,
      isWorkerOverload,
      bodySnip: "",
    };
  }

  try {
    return { ok: true, data: JSON.parse(trimmed) as T };
  } catch {
    return {
      ok: false,
      status: res.status,
      error: isWorkerOverload
        ? `Worker过载(HTTP ${res.status})，响应非 JSON`
        : `响应非 JSON（HTTP ${res.status}）`,
      isWorkerOverload,
      bodySnip: trimmed.slice(0, 200),
    };
  }
}

export function vocabApiOverloadRetryDelayMs(attempt: number): number {
  const n = Math.max(1, Math.floor(attempt));
  return VOCAB_API_OVERLOAD_RETRY_BASE_MS * n;
}

export function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
