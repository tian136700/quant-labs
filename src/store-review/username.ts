/** 广场展示：前 2 位 + 星号 + 后 2 位（注册名至少 6 字符） */
export function maskUsername(username: string): string {
  const name = username.trim();
  const len = name.length;
  if (len <= 4) {
    return "*".repeat(Math.max(len, 1));
  }
  const middleLen = Math.max(0, len - 4);
  return `${name.slice(0, 2)}${"*".repeat(middleLen)}${name.slice(-2)}`;
}

export const STORE_REVIEW_USERNAME_MIN = 6;

export function isValidStoreReviewUsername(username: string): boolean {
  if (username.length < STORE_REVIEW_USERNAME_MIN || username.length > 32) {
    return false;
  }
  return /^[\w\u4e00-\u9fff.-]+$/u.test(username);
}
