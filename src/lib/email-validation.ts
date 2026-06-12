const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(raw: string): boolean {
  const email = (raw || "").trim();
  if (!email || email.length > 254) return false;
  return EMAIL_RE.test(email);
}
