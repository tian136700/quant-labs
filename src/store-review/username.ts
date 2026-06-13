/** 广场展示：前 1 位 + 星号 + 后 1 位 */
export function maskUsername(username: string): string {
  const name = username.trim();
  const len = name.length;
  if (len <= 1) return "*";
  if (len === 2) return `${name[0]}*`;
  const middleLen = len - 2;
  return `${name.slice(0, 1)}${"*".repeat(middleLen)}${name.slice(-1)}`;
}

export const STORE_REVIEW_USERNAME_MIN = 6;

export function isValidStoreReviewUsername(username: string): boolean {
  if (username.length < STORE_REVIEW_USERNAME_MIN || username.length > 32) {
    return false;
  }
  return /^[\w\u4e00-\u9fff.-]+$/u.test(username);
}
