import {
  ETR_PASSWORD_MIN_LENGTH,
  ETR_USERNAME_MAX_LENGTH,
  ETR_USERNAME_MIN_LENGTH,
  isReservedUsername,
  isValidUsername,
  normalizeUsername,
} from "@/lib/etr-auth";

export type AdminUserFieldErrors = {
  username?: string;
  password?: string;
};

export function adminUserFieldErrors(
  username: string,
  password: string,
  locale: "en" | "zh",
  options?: { requireFilled?: boolean }
): AdminUserFieldErrors {
  const requireFilled = options?.requireFilled ?? false;
  const errors: AdminUserFieldErrors = {};
  const trimmed = normalizeUsername(username);

  if (requireFilled && !trimmed) {
    errors.username = locale === "zh" ? "请填写用户名。" : "Username is required.";
  } else if (trimmed && !isValidUsername(trimmed)) {
    errors.username =
      locale === "zh"
        ? `用户名须为 ${ETR_USERNAME_MIN_LENGTH}–${ETR_USERNAME_MAX_LENGTH} 个字符（字母、数字、_ . - 或中文）。`
        : `Username must be ${ETR_USERNAME_MIN_LENGTH}–${ETR_USERNAME_MAX_LENGTH} characters (letters, numbers, _ . - or Chinese).`;
  } else if (trimmed && isReservedUsername(trimmed)) {
    errors.username =
      locale === "zh" ? "该用户名已被系统保留。" : "This username is reserved.";
  }

  if (requireFilled && !password) {
    errors.password = locale === "zh" ? "请填写密码。" : "Password is required.";
  } else if (password && password.length < ETR_PASSWORD_MIN_LENGTH) {
    errors.password =
      locale === "zh"
        ? `密码至少 ${ETR_PASSWORD_MIN_LENGTH} 位。`
        : `Password must be at least ${ETR_PASSWORD_MIN_LENGTH} characters.`;
  }

  return errors;
}

export function hasAdminUserFieldErrors(errors: AdminUserFieldErrors): boolean {
  return Boolean(errors.username || errors.password);
}
