/** Bark 推送（Worker / API 用；勿把 device key 写进仓库）。 */

export const BARK_DEFAULT_SERVER = "https://api.day.app";
export const BARK_ICON_DEPLOY_FAIL =
  "https://finance.info-quests.com/bark/deploy-fail.png";
export const BARK_ICON_CLASS_REMIND =
  "https://finance.info-quests.com/bark/class-remind.png";

export type BarkPushResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  error?: string;
  response?: unknown;
};

export function formatClassRemindPush(input: {
  minutesLeft: number;
  summary: string;
  thailandClassAtLabel: string;
  beijingClassAtLabel: string;
  teachers?: string;
  lessonTitle?: string;
}): { title: string; body: string } {
  const mins = Math.max(1, Math.floor(input.minutesLeft));
  const title = `还有${mins}分钟上课`;
  const lines = [
    (input.summary || "课程").trim() || "课程",
    `开课：泰国时间 ${input.thailandClassAtLabel}`,
    `（网站日程北京时间 ${input.beijingClassAtLabel}）`,
  ];
  const teachers = (input.teachers || "").trim();
  if (teachers) lines.push(`老师：${teachers}`);
  const lessonTitle = (input.lessonTitle || "").trim();
  if (lessonTitle && !input.summary.includes(lessonTitle)) {
    lines.push(`内容：${lessonTitle.slice(0, 120)}`);
  }
  return { title, body: lines.join("\n") };
}

export async function sendBarkPush(options: {
  deviceKey: string;
  title: string;
  body: string;
  group?: string;
  level?: string;
  icon?: string | null;
  call?: boolean;
  volume?: number | null;
  server?: string;
}): Promise<BarkPushResult> {
  const key = options.deviceKey.trim();
  if (!key) {
    return { ok: true, skipped: true, reason: "bark_not_configured" };
  }
  const server = (options.server || BARK_DEFAULT_SERVER).replace(/\/$/, "");
  const payload: Record<string, unknown> = {
    title: options.title.slice(0, 80),
    body: options.body.slice(0, 500),
    level: options.level || "timeSensitive",
  };
  const group = (options.group || "").trim();
  // 调用方显式传 group（如「上课提醒」）；不要默认塞「维护中心」标签
  if (group) payload.group = group;
  const icon = (options.icon || "").trim();
  if (icon) payload.icon = icon;
  if (options.call) {
    // Bark 文档：call=1 持续铃响约 30 秒；须配合 level=critical 才可在静音下持续响
    // JSON 里用数字 1（字符串 "1" 在部分客户端上只会响一声）
    payload.call = 1;
    if (options.volume == null) {
      payload.volume = options.level === "critical" ? 10 : 5;
    }
  }
  if (options.volume != null) {
    payload.volume = Math.max(0, Math.min(10, Math.floor(options.volume)));
  }

  try {
    const res = await fetch(`${server}/${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(payload),
    });
    const raw = await res.text();
    let parsed: unknown = raw;
    try {
      parsed = raw ? JSON.parse(raw) : {};
    } catch {
      parsed = { raw };
    }
    const code =
      parsed && typeof parsed === "object" && "code" in parsed
        ? (parsed as { code?: unknown }).code
        : undefined;
    if (code !== undefined && code !== 200) {
      return { ok: false, error: `bark code=${String(code)}`, response: parsed };
    }
    if (!res.ok) {
      return { ok: false, error: `bark HTTP ${res.status}`, response: parsed };
    }
    return { ok: true, response: parsed };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
