"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { EtrUserRole } from "@/lib/etr-auth";
import {
  canUserOperateJpVocab,
  isJpVocabTeacherRole,
} from "@/lib/etr-auth";
import { LOCALE_HEADER, readStoredLocale } from "@/lib/locale-detect";
import {
  clearClientCache,
  readClientCache,
  writeClientCache,
} from "@/lib/client-swr-cache";

const AUTH_USER_CACHE_KEY = "etr-auth:user:v1";

export type EtrAuthUser = {
  id: number;
  username: string;
  role: EtrUserRole;
  expires_at: string;
  expires_hint: string;
  /** 服务端根据当前会话计算的日语单词操作权限 */
  can_operate_jp_vocab?: boolean;
};

type EtrAuthContextValue = {
  user: EtrAuthUser | null;
  checking: boolean;
  isAdmin: boolean;
  isJpVocabTeacher: boolean;
  canAccessJpVocab: boolean;
  refresh: () => Promise<void>;
  setUser: (user: EtrAuthUser | null) => void;
  logout: () => Promise<void>;
};

const EtrAuthContext = createContext<EtrAuthContextValue | null>(null);

export function EtrAuthProvider({ children }: { children: ReactNode }) {
  // SSR / 首次 hydration 必须与服务器一致，不可读 localStorage（见 I18nProvider）
  const [user, setUser] = useState<EtrAuthUser | null>(null);
  const [checking, setChecking] = useState(true);
  const refreshGenRef = useRef(0);

  const refresh = useCallback(async () => {
    const gen = ++refreshGenRef.current;
    const hasCache = readClientCache<EtrAuthUser>(AUTH_USER_CACHE_KEY) != null;
    if (!hasCache) setChecking(true);
    try {
      const locale = readStoredLocale() ?? "en";
      const res = await fetch("/api/english-teacher-review/auth", {
        credentials: "include",
        headers: { [LOCALE_HEADER]: locale },
      });
      const data = await res.json();
      if (gen !== refreshGenRef.current) return;
      if (data.ok && data.authenticated && data.user) {
        const next = data.user as EtrAuthUser;
        setUser(next);
        writeClientCache(AUTH_USER_CACHE_KEY, next);
      } else {
        setUser(null);
        clearClientCache(AUTH_USER_CACHE_KEY);
      }
    } catch {
      if (gen === refreshGenRef.current) setUser(null);
    } finally {
      if (gen === refreshGenRef.current) setChecking(false);
    }
  }, []);

  useEffect(() => {
    const cached = readClientCache<EtrAuthUser>(AUTH_USER_CACHE_KEY);
    if (cached) {
      setUser(cached);
      setChecking(false);
    }
    void refresh();
  }, [refresh]);

  /** 登录成功后写入用户，并作废进行中的 refresh，避免把刚登录的状态冲掉 */
  const applyUser = useCallback((next: EtrAuthUser | null) => {
    refreshGenRef.current += 1;
    setUser(next);
    setChecking(false);
    if (next) writeClientCache(AUTH_USER_CACHE_KEY, next);
    else clearClientCache(AUTH_USER_CACHE_KEY);
  }, []);

  const logout = useCallback(async () => {
    refreshGenRef.current += 1;
    try {
      await fetch("/api/english-teacher-review/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "logout" }),
      });
    } catch {
      /* ignore */
    }
    setUser(null);
    clearClientCache(AUTH_USER_CACHE_KEY);
    setChecking(false);
  }, []);

  const value = useMemo(
    () => ({
      user,
      checking,
      isAdmin: user?.role === "admin",
      isJpVocabTeacher: isJpVocabTeacherRole(user?.role),
      canAccessJpVocab:
        user?.can_operate_jp_vocab === true ||
        (user?.can_operate_jp_vocab === undefined &&
          canUserOperateJpVocab(user)),
      refresh,
      setUser: applyUser,
      logout,
    }),
    [user, checking, refresh, applyUser, logout]
  );

  return (
    <EtrAuthContext.Provider value={value}>{children}</EtrAuthContext.Provider>
  );
}

export function useEtrAuth(): EtrAuthContextValue {
  const ctx = useContext(EtrAuthContext);
  if (!ctx) {
    throw new Error("useEtrAuth must be used within EtrAuthProvider");
  }
  return ctx;
}
