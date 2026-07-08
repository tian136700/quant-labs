import { readClientCache, writeClientCache } from "@/lib/client-swr-cache";

export const ADMIN_USERS_CACHE_KEY = "admin-api:users:v1";

export type AdminUserListRow = {
  id: number;
  username: string;
  role: string;
  role_label: string;
  jp_lesson_teacher_name?: string | null;
  disabled: boolean;
  created_at: string;
  last_login_at?: string | null;
  last_login_ip?: string | null;
};

export function readAdminUsersCache(): AdminUserListRow[] | null {
  return readClientCache<AdminUserListRow[]>(ADMIN_USERS_CACHE_KEY);
}

export function writeAdminUsersCache(users: AdminUserListRow[]): void {
  writeClientCache(ADMIN_USERS_CACHE_KEY, users);
}

export function parseAdminUsersApi(json: unknown): AdminUserListRow[] {
  const data = json as {
    ok?: boolean;
    users?: AdminUserListRow[];
    error?: string;
  };
  if (!data.ok || !Array.isArray(data.users)) {
    throw new Error(data.error || "load failed");
  }
  return data.users;
}
