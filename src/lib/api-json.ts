/** 解析 API 响应：避免 HTML 错误页导致 res.json() 抛出难懂异常 */
export type ApiJsonResult<T extends Record<string, unknown>> =
  | { ok: true; data: T; status: number }
  | { ok: false; status: number; error: string };

function htmlApiError(status: number): string {
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
    return { ok: false, status, error: htmlApiError(status) };
  }

  if (!text) {
    return { ok: false, status, error: `请求失败（${status}）` };
  }

  try {
    const data = JSON.parse(text) as T;
    return { ok: true, data, status };
  } catch {
    if (trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html")) {
      return { ok: false, status, error: htmlApiError(status) };
    }
    return { ok: false, status, error: "服务器返回了无效的数据格式。" };
  }
}
