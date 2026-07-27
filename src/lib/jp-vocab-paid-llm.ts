import "server-only";

import type { CloudflareEnv } from "@/lib/types";

const DEFAULT_BASE = "https://tokken.cc";
const DEFAULT_MODEL = "claude-sonnet-4-6";

type PaidLlmSecrets = {
  token: string;
  baseUrl: string;
  model: string;
};

function readSecret(
  env: CloudflareEnv | null | undefined,
  key:
    | "ANTHROPIC_AUTH_TOKEN"
    | "ANTHROPIC_API_KEY"
    | "ANTHROPIC_BASE_URL"
    | "ANTHROPIC_MODEL"
): string {
  const fromEnv = env?.[key];
  if (typeof fromEnv === "string" && fromEnv.trim()) return fromEnv.trim();
  const fromProcess = String(process.env[key] ?? "").trim();
  return fromProcess;
}

/** 与 Mac `paid_anthropic_client.py` 同套：tokken Anthropic 中转 */
export function resolveJpVocabPaidLlmSecrets(
  env?: CloudflareEnv | null
): PaidLlmSecrets | null {
  const token =
    readSecret(env, "ANTHROPIC_AUTH_TOKEN") ||
    readSecret(env, "ANTHROPIC_API_KEY");
  if (!token) return null;
  let baseUrl =
    readSecret(env, "ANTHROPIC_BASE_URL") || DEFAULT_BASE;
  baseUrl = baseUrl.replace(/\/$/, "");
  if (baseUrl.endsWith("tokken.top")) baseUrl = DEFAULT_BASE;
  const model = readSecret(env, "ANTHROPIC_MODEL") || DEFAULT_MODEL;
  return { token, baseUrl, model };
}

export function buildJpVocabOnlineSourceLabel(model?: string): string {
  const m = (model || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  return `线上 ${m}`;
}

/**
 * 管理员手动补全专用：单次调线上大模型。
 * 定时任务仍走 Mac，勿在 Worker 自动循环里调用。
 */
export async function callJpVocabPaidLlm(
  prompt: string,
  options: {
    env?: CloudflareEnv | null;
    system?: string;
    maxTokens?: number;
    temperature?: number;
    timeoutMs?: number;
  } = {}
): Promise<{ text: string; model: string; source: string }> {
  const secrets = resolveJpVocabPaidLlmSecrets(options.env);
  if (!secrets) {
    throw new Error(
      "未配置线上模型密钥（ANTHROPIC_AUTH_TOKEN）；请在本机 env / wrangler secret 配置"
    );
  }
  const url = `${secrets.baseUrl}/v1/messages`;
  const body: Record<string, unknown> = {
    model: secrets.model,
    max_tokens: options.maxTokens ?? 4500,
    temperature: options.temperature ?? 0.3,
    messages: [{ role: "user", content: prompt }],
  };
  if (options.system?.trim()) {
    body.system = options.system.trim();
  }

  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 120_000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let raw: string;
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "x-api-key": secrets.token,
        Authorization: `Bearer ${secrets.token}`,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    raw = await resp.text();
    if (!resp.ok) {
      throw new Error(
        `线上模型 HTTP ${resp.status}: ${raw.slice(0, 400)}`
      );
    }
  } finally {
    clearTimeout(timer);
  }

  let data: { content?: Array<{ type?: string; text?: string }> };
  try {
    data = JSON.parse(raw) as typeof data;
  } catch {
    throw new Error(`线上模型返回非 JSON: ${raw.slice(0, 200)}`);
  }
  const parts: string[] = [];
  for (const block of data.content || []) {
    if (block && block.type === "text" && block.text) {
      parts.push(String(block.text));
    }
  }
  const text = parts.join("\n").trim();
  if (!text) {
    throw new Error(`线上模型返回空内容: ${raw.slice(0, 300)}`);
  }
  return {
    text,
    model: secrets.model,
    source: buildJpVocabOnlineSourceLabel(secrets.model),
  };
}
