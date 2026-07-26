/** 将模板正文与登录链接合并；可含 `{login_url}` / `{username}`，无占位则链接追加在末尾 */
export function renderLoginLinkTemplate(
  body: string,
  loginUrl: string,
  username?: string | null
): string {
  const trimmed = body.trim();
  if (!trimmed) return loginUrl;
  const name = (username ?? "").trim();
  let text = trimmed;
  if (name && text.includes("{username}")) {
    text = text.replace(/\{username\}/g, name);
  }
  if (text.includes("{login_url}")) {
    return text.replace(/\{login_url\}/g, loginUrl);
  }
  return `${text}\n\n${loginUrl}`;
}
