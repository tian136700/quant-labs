"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
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
  canUserOperateKoPron,
  canAccessKoPronTeacherPage,
  canAccessKoPronAdminPage,
  canAccessKoPronStudy,
  isKoPronTeacherRole,
} from "@/lib/etr-auth";
import { isAdminSuperuser } from "@/lib/rbac";
import { LOCALE_HEADER, readStoredLocale } from "@/lib/locale-detect";
import {
  comparePath,
  isMaintenancePath,
  isVocabRefSharePath,
  maintenancePath,
} from "@/lib/locale-path";
import {
  clearClientCache,
  readClientCache,
  writeClientCache,
} from "@/lib/client-swr-cache";
import { PUBLIC_REGISTRATION_ENABLED } from "@/lib/feature-flags";
import { readApiJson } from "@/lib/api-json";

const AUTH_USER_CACHE_KEY = "etr-auth:user:v1";
/** 鉴权探测硬超时：弱网 / iPad Safari 挂起时不能永远停在「验证中」 */
const AUTH_PROBE_TIMEOUT_MS = 10_000;

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
  /** 服务端根据 RBAC 计算的韩语发音操作权限 */
  can_operate_ko_pron?: boolean;
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
  isKoPronTeacher: boolean;
  canAccessJpVocab: boolean;
  canAccessJpVocabTeacherPage: boolean;
  canAccessJpVocabAdminPage: boolean;
  canAccessJpVocabStudy: boolean;
  canAccessJpVocabCoach: boolean;
  canAccessEnVocab: boolean;
  canAccessEnVocabTeacherPage: boolean;
  canAccessEnVocabAdminPage: boolean;
  canAccessEnVocabStudy: boolean;
  canAccessKoPron: boolean;
  canAccessKoPronTeacherPage: boolean;
  canAccessKoPronAdminPage: boolean;
  canAccessKoPronStudy: boolean;
  permissions: string[];
  hasPermission: (key: string) => boolean;
  /** 首轮 /api/.../auth 探测已结束（勿用 localStorage 缓存用户做路由跳转） */
  authProbeDone: boolean;
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
  const [authProbeDone, setAuthProbeDone] = useState(false);
  const [maintenance, setMaintenance] = useState(false);
  const [authPanel, setAuthPanel] = useState<AuthPanelState | null>(null);
  const refreshGenRef = useRef(0);

  const redirectMaintenance = useCallback(() => {
    if (typeof window === "undefined") return;
    const pathname = window.location.pathname;
    // 教案查看链接：账号被封也不能硬跳维护页（否则闪一下又没了）
    if (isMaintenancePath(pathname) || isVocabRefSharePath(pathname)) return;
    const locale = readStoredLocale() ?? "en";
    window.location.href = maintenancePath(locale);
  }, []);

  const refresh = useCallback(async () => {
    const gen = ++refreshGenRef.current;
    const hasCache = readClientCache<EtrAuthUser>(AUTH_USER_CACHE_KEY) != null;
    if (!hasCache) setChecking(true);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(
      () => controller.abort(),
      AUTH_PROBE_TIMEOUT_MS
    );
    try {
      const locale = readStoredLocale() ?? "en";
      const res = await fetch("/api/english-teacher-review/auth", {
        credentials: "include",
        headers: { [LOCALE_HEADER]: locale },
        signal: controller.signal,
      });
      const parsed = await readApiJson<{
        ok?: boolean;
        authenticated?: boolean;
        user?: EtrAuthUser | null;
        maintenance?: boolean;
        session_conflict?: boolean;
      }>(res);
      if (gen !== refreshGenRef.current) return;
      if (!parsed.ok) {
        setUser(null);
        clearClientCache(AUTH_USER_CACHE_KEY);
        return;
      }
      const data = parsed.data;
      if (data.maintenance) {
        setUser(null);
        setMaintenance(true);
        clearClientCache(AUTH_USER_CACHE_KEY);
        redirectMaintenance();
        return;
      }
      if (data.session_conflict) {
        setUser(null);
        setMaintenance(false);
        clearClientCache(AUTH_USER_CACHE_KEY);
        setAuthPanel({
          mode: "login",
          loginOnly: true,
          title: "你已在别处登录",
          subtitle: "当前设备已下线，请重新登录。",
        });
        return;
      }
      setMaintenance(false);
      if (data.ok && data.authenticated && data.user) {
        const next = data.user;
        setUser(next);
        writeClientCache(AUTH_USER_CACHE_KEY, next);
      } else {
        setUser(null);
        clearClientCache(AUTH_USER_CACHE_KEY);
      }
    } catch {
      // 弱网 / 超时 / abort：保留本地缓存用户，避免整页掉回「验证中…」再变登录
      if (gen === refreshGenRef.current) {
        const kept = readClientCache<EtrAuthUser>(AUTH_USER_CACHE_KEY);
        if (!kept) setUser(null);
      }
    } finally {
      window.clearTimeout(timeoutId);
      if (gen === refreshGenRef.current) {
        setChecking(false);
        setAuthProbeDone(true);
      }
    }
  }, [redirectMaintenance]);

  // useLayoutEffect：有本地用户缓存时在首屏绘制前灌入，避免日程等页先闪「验证中…」
  useLayoutEffect(() => {
    const cached = readClientCache<EtrAuthUser>(AUTH_USER_CACHE_KEY);
    if (cached) {
      // 可先展示缓存用户，但 checking 保持 true，直到首轮服务端探测结束
      // （否则微信里过期 Cookie + 本地缓存会被科目路由笼误判已登录并踢走）
      setUser(cached);
    }
    void refresh();
  }, [refresh]);

  // 标签页回到前台再探一次：账号已被定时禁用时立刻进维护页，停掉软刷新/开卡轮询
  useEffect(() => {
    const onForeground = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      void refresh();
    };
    document.addEventListener("visibilitychange", onForeground);
    window.addEventListener("pageshow", onForeground);
    return () => {
      document.removeEventListener("visibilitychange", onForeground);
      window.removeEventListener("pageshow", onForeground);
    };
  }, [refresh]);

  const applyUser = useCallback((next: EtrAuthUser | null) => {
    refreshGenRef.current += 1;
    setUser(next);
    setMaintenance(false);
    setAuthPanel(null);
    setChecking(false);
    setAuthProbeDone(true);
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
      window.location.href = comparePath(locale);
      return;
    }
    setUser(null);
    setMaintenance(false);
    setAuthPanel(null);
    setChecking(false);
    setAuthProbeDone(true);
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
      isKoPronTeacher: isKoPronTeacherRole(user?.role),
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
      canAccessKoPron:
        user?.can_operate_ko_pron === true ||
        (user?.can_operate_ko_pron === undefined &&
          canUserOperateKoPron(user)),
      canAccessKoPronTeacherPage: canAccessKoPronTeacherPage(user),
      canAccessKoPronAdminPage: canAccessKoPronAdminPage(user),
      canAccessKoPronStudy: canAccessKoPronStudy(user),
      permissions,
      hasPermission,
      authProbeDone,
      refresh,
      setUser: applyUser,
      openAuthPanel,
      closeAuthPanel,
      logout,
    }),
    [user, checking, maintenance, authPanel, isAdmin, permissions, hasPermission, authProbeDone, refresh, applyUser, openAuthPanel, closeAuthPanel, logout]
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
