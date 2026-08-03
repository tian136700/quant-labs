/** 解析 API 响应：避免 HTML 错误页导致 res.json() 抛出难懂异常 */
export type ApiJsonResult<T extends Record<string, unknown>> =
  | { ok: true; data: T; status: number }
  | { ok: false; status: number; error: string };

/** Cloudflare / 网关短暂不可用时可自动重试 */
export function isTransientApiStatus(status: number): boolean {
  return status === 502 || status === 503 || status === 504;
}

function htmlApiError(status: number, body = ""): string {
  if (
    body.includes("Error 1102") ||
    body.includes("Worker exceeded") ||
    body.includes("exceeded resource limits")
  ) {
    return "服务器繁忙（课堂并发请求较多），请稍等几秒后刷新页面。";
  }
  if (status === 404) return "接口不存在，请刷新页面后重试。";
  if (status === 401 || status === 403) return "登录已失效，请重新登录后再试。";
  if (status >= 500) return `服务器错误（${status}），请稍后重试。`;
  return `服务器返回了异常页面（${status}），请稍后重试。`;
}

/** 将 fetch/json 异常转为用户可读文案（避免页面上出现 Unexpected token '<'） */
export function sanitizeApiClientError(message: string): string {
  const trimmed = message.trim();
  if (
    trimmed.includes("<!DOCTYPE") ||
    trimmed.includes("Unexpected token '<'") ||
    trimmed.includes("Unexpected token \'<\'")
  ) {
    return "服务器暂时不可用，请稍后刷新页面。";
  }
  const lower = trimmed.toLowerCase();
  if (
    lower === "load failed" ||
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("network request failed")
  ) {
    return "服务器繁忙或网络中断（连接被掐），请稍等几秒后刷新。";
  }
  if (/abort|timeout|timed out/i.test(trimmed)) {
    return "请求超时，服务器可能繁忙，请稍后刷新。";
  }
  return trimmed || "请求失败，请稍后重试。";
}

export async function readApiJson<T extends Record<string, unknown>>(
  res: Response
): Promise<ApiJsonResult<T>> {
  const status = res.status;
  const contentType = res.headers.get("content-type") || "";
  const text = await res.text();
  const trimmed = text.trimStart();

  if (
    !contentType.includes("application/json") &&
    (trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html"))
  ) {
    return { ok: false, status, error: htmlApiError(status, trimmed) };
  }

  if (!text) {
    return { ok: false, status, error: `请求失败（${status}）` };
  }

  try {
    const data = JSON.parse(text) as T;
    return { ok: true, data, status };
  } catch {
    if (trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html")) {
      return { ok: false, status, error: htmlApiError(status, trimmed) };
    }
    return { ok: false, status, error: "服务器返回了无效的数据格式。" };
  }
}
