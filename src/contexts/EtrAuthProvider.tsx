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

export type EtrAuthUser = {
  id: number;
  username: string;
  role: EtrUserRole;
  expires_at: string;
  expires_hint: string;
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
  const [user, setUser] = useState<EtrAuthUser | null>(null);
  const [checking, setChecking] = useState(true);
  const refreshGenRef = useRef(0);

  const refresh = useCallback(async () => {
    const gen = ++refreshGenRef.current;
    setChecking(true);
    try {
      const res = await fetch("/api/english-teacher-review/auth", {
        credentials: "include",
      });
      const data = await res.json();
      if (gen !== refreshGenRef.current) return;
      if (data.ok && data.authenticated && data.user) {
        setUser(data.user as EtrAuthUser);
      } else {
        setUser(null);
      }
    } catch {
      if (gen === refreshGenRef.current) setUser(null);
    } finally {
      if (gen === refreshGenRef.current) setChecking(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** 登录成功后写入用户，并作废进行中的 refresh，避免把刚登录的状态冲掉 */
  const applyUser = useCallback((next: EtrAuthUser | null) => {
    refreshGenRef.current += 1;
    setUser(next);
    setChecking(false);
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
    setChecking(false);
  }, []);

  const value = useMemo(
    () => ({
      user,
      checking,
      isAdmin: user?.role === "admin",
      isJpVocabTeacher: isJpVocabTeacherRole(user?.role),
      canAccessJpVocab: canUserOperateJpVocab(user),
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
