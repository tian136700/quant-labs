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
  canAccessJpVocabTeacherPage,
  canAccessJpVocabAdminPage,
  canAccessJpVocabStudy,
  canAccessJpVocabCoach,
  isJpVocabTeacherRole,
  canUserOperateEnVocab,
  canAccessEnVocabStudy,
  canAccessEnVocabTeacherPage,
  canAccessEnVocabAdminPage,
  isEnVocabTeacherRole,
} from "@/lib/etr-auth";
import { isAdminSuperuser } from "@/lib/rbac";
import { LOCALE_HEADER, readStoredLocale } from "@/lib/locale-detect";
import { aboutPath, isMaintenancePath, maintenancePath } from "@/lib/locale-path";
import {
  clearClientCache,
  readClientCache,
  writeClientCache,
} from "@/lib/client-swr-cache";
import { PUBLIC_REGISTRATION_ENABLED } from "@/lib/feature-flags";

const AUTH_USER_CACHE_KEY = "etr-auth:user:v1";

export type EtrAuthUser = {
  id: number;
  username: string;
  role: EtrUserRole;
  expires_at: string;
  expires_hint: string;
  permissions?: string[];
  /** 服务端根据 RBAC 计算的日语单词操作权限 */
  can_operate_jp_vocab?: boolean;
  /** 服务端根据 RBAC 计算的英语单词操作权限 */
  can_operate_en_vocab?: boolean;
};

type AuthPanelState = {
  mode: "login" | "register";
  loginOnly?: boolean;
  title?: string;
  subtitle?: string;
};

type EtrAuthContextValue = {
  user: EtrAuthUser | null;
  checking: boolean;
  maintenance: boolean;
  authPanel: AuthPanelState | null;
  isAdmin: boolean;
  isJpVocabTeacher: boolean;
  isEnVocabTeacher: boolean;
  canAccessJpVocab: boolean;
  canAccessJpVocabTeacherPage: boolean;
  canAccessJpVocabAdminPage: boolean;
  canAccessJpVocabStudy: boolean;
  canAccessJpVocabCoach: boolean;
  canAccessEnVocab: boolean;
  canAccessEnVocabTeacherPage: boolean;
  canAccessEnVocabAdminPage: boolean;
  canAccessEnVocabStudy: boolean;
  permissions: string[];
  hasPermission: (key: string) => boolean;
  refresh: () => Promise<void>;
  setUser: (user: EtrAuthUser | null) => void;
  openAuthPanel: (opts: AuthPanelState) => void;
  closeAuthPanel: () => void;
  logout: () => Promise<void>;
};

const EtrAuthContext = createContext<EtrAuthContextValue | null>(null);

export function EtrAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<EtrAuthUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [maintenance, setMaintenance] = useState(false);
  const [authPanel, setAuthPanel] = useState<AuthPanelState | null>(null);
  const refreshGenRef = useRef(0);

  const redirectMaintenance = useCallback(() => {
    if (typeof window === "undefined") return;
    if (isMaintenancePath(window.location.pathname)) return;
    const locale = readStoredLocale() ?? "en";
    window.location.href = maintenancePath(locale);
  }, []);

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
      if (data.maintenance) {
        setUser(null);
        setMaintenance(true);
        clearClientCache(AUTH_USER_CACHE_KEY);
        redirectMaintenance();
        return;
      }
      setMaintenance(false);
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
  }, [redirectMaintenance]);

  useEffect(() => {
    const cached = readClientCache<EtrAuthUser>(AUTH_USER_CACHE_KEY);
    if (cached) {
      setUser(cached);
      setChecking(false);
    }
    void refresh();
  }, [refresh]);

  const applyUser = useCallback((next: EtrAuthUser | null) => {
    refreshGenRef.current += 1;
    setUser(next);
    setMaintenance(false);
    setAuthPanel(null);
    setChecking(false);
    if (next) writeClientCache(AUTH_USER_CACHE_KEY, next);
    else clearClientCache(AUTH_USER_CACHE_KEY);
  }, []);

  const openAuthPanel = useCallback((opts: AuthPanelState) => {
    if (!PUBLIC_REGISTRATION_ENABLED) {
      setAuthPanel({ ...opts, mode: "login", loginOnly: true });
      return;
    }
    setAuthPanel(opts);
  }, []);

  const closeAuthPanel = useCallback(() => {
    setAuthPanel(null);
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
    clearClientCache(AUTH_USER_CACHE_KEY);
    // Navigate away before clearing React auth state so protected pages
    // (e.g. admin users) do not re-render as guest and trip Rules of Hooks.
    if (typeof window !== "undefined") {
      const locale = readStoredLocale() ?? "zh";
      window.location.href = aboutPath(locale);
      return;
    }
    setUser(null);
    setMaintenance(false);
    setAuthPanel(null);
    setChecking(false);
  }, []);

  const permissions = user?.permissions ?? [];
  const isAdmin = isAdminSuperuser(user?.role);

  const hasPermission = useCallback(
    (key: string) => {
      if (!user) return false;
      if (isAdmin) return true;
      return permissions.includes(key);
    },
    [user, isAdmin, permissions]
  );

  const value = useMemo(
    () => ({
      user,
      checking,
      maintenance,
      authPanel,
      isAdmin,
      isJpVocabTeacher: isJpVocabTeacherRole(user?.role),
      isEnVocabTeacher: isEnVocabTeacherRole(user?.role),
      canAccessJpVocab:
        user?.can_operate_jp_vocab === true ||
        (user?.can_operate_jp_vocab === undefined &&
          canUserOperateJpVocab(user)),
      canAccessJpVocabTeacherPage: canAccessJpVocabTeacherPage(user),
      canAccessJpVocabAdminPage: canAccessJpVocabAdminPage(user),
      canAccessJpVocabStudy: canAccessJpVocabStudy(user),
      canAccessJpVocabCoach: canAccessJpVocabCoach(user),
      canAccessEnVocab:
        user?.can_operate_en_vocab === true ||
        (user?.can_operate_en_vocab === undefined &&
          canUserOperateEnVocab(user)),
      canAccessEnVocabTeacherPage: canAccessEnVocabTeacherPage(user),
      canAccessEnVocabAdminPage: canAccessEnVocabAdminPage(user),
      canAccessEnVocabStudy: canAccessEnVocabStudy(user),
      permissions,
      hasPermission,
      refresh,
      setUser: applyUser,
      openAuthPanel,
      closeAuthPanel,
      logout,
    }),
    [user, checking, maintenance, authPanel, isAdmin, permissions, hasPermission, refresh, applyUser, openAuthPanel, closeAuthPanel, logout]
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
