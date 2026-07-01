/** 将模板正文与登录链接合并；正文可含 `{login_url}`，否则链接追加在末尾 */
export function renderLoginLinkTemplate(body: string, loginUrl: string): string {
  const trimmed = body.trim();
  if (!trimmed) return loginUrl;
  if (trimmed.includes("{login_url}")) {
    return trimmed.replace(/\{login_url\}/g, loginUrl);
  }
  return `${trimmed}\n\n${loginUrl}`;
}
