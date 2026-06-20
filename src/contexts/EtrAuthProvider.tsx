"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { EtrUserRole } from "@/lib/etr-auth";
import { canAccessJpVocab, isJpVocabTeacherRole } from "@/lib/etr-auth";

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

  const refresh = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch("/api/english-teacher-review/auth", {
        credentials: "include",
      });
      const data = await res.json();
      if (data.ok && data.authenticated && data.user) {
        setUser(data.user as EtrAuthUser);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
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
  }, []);

  const value = useMemo(
    () => ({
      user,
      checking,
      isAdmin: user?.role === "admin",
      isJpVocabTeacher: isJpVocabTeacherRole(user?.role),
      canAccessJpVocab: canAccessJpVocab(user?.role),
      refresh,
      setUser,
      logout,
    }),
    [user, checking, refresh, logout]
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
