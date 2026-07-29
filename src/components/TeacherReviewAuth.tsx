"use client";

import { useEffect, useState } from "react";
import type { EtrAuthUser } from "@/contexts/EtrAuthProvider";
import { useI18n } from "@/i18n/I18nProvider";
import { readStoredLocale } from "@/lib/locale-detect";
import { PUBLIC_REGISTRATION_ENABLED } from "@/lib/feature-flags";
import { maintenancePath } from "@/lib/locale-path";
import { readApiJson } from "@/lib/api-json";

export type { EtrAuthUser };

type AuthMode = "login" | "register";

const AUTH_DRAFT_KEY = "etr-auth:draft:v1";

type AuthDraft = {
  username: string;
  password: string;
  mode: AuthMode;
};

function readAuthDraft(): AuthDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(AUTH_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AuthDraft>;
    if (typeof parsed.username !== "string" || typeof parsed.password !== "string") {
      return null;
    }
    return {
      username: parsed.username,
      password: parsed.password,
      mode: parsed.mode === "register" ? "register" : "login",
    };
  } catch {
    return null;
  }
}

function writeAuthDraft(draft: AuthDraft) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(AUTH_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* ignore quota / private mode */
  }
}

function clearAuthDraft() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(AUTH_DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

type Props = {
  onAuthenticated: (user: EtrAuthUser) => void;
  variant?: "page" | "inline";
  initialMode?: AuthMode;
  onClose?: () => void;
  /** 仅登录，不显示注册（如日语单词页） */
  loginOnly?: boolean;
  title?: string;
  subtitle?: string;
};

function PasswordField({
  id,
  label,
  value,
  onChange,
  placeholder,
  autoComplete,
  showLabel,
  hideLabel,
  required,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoComplete: string;
  showLabel: string;
  hideLabel: string;
  required?: boolean;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {required ? <span className="etr-required">*</span> : null}
      </label>
      <div className="etr-password-wrap">
        <input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
        />
        <button
          type="button"
          className="etr-password-toggle"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? hideLabel : showLabel}
          aria-pressed={visible}
        >
          {visible ? hideLabel : showLabel}
        </button>
      </div>
    </div>
  );
}

export function TeacherReviewAuth({
  onAuthenticated,
  variant = "page",
  initialMode = "login",
  onClose,
  loginOnly = false,
  title,
  subtitle,
}: Props) {
  const { t } = useI18n();
  const auth = t("teacherReview").auth;
  const showRegister = PUBLIC_REGISTRATION_ENABLED && !loginOnly;

  const resolveMode = (m: AuthMode): AuthMode =>
    m === "register" && !showRegister ? "login" : m;

  const [mode, setMode] = useState<AuthMode>(() => {
    if (variant !== "inline") return resolveMode(initialMode);
    return resolveMode(readAuthDraft()?.mode ?? initialMode);
  });
  const [username, setUsername] = useState(() =>
    variant === "inline" ? (readAuthDraft()?.username ?? "") : ""
  );
  const [password, setPassword] = useState(() =>
    variant === "inline" ? (readAuthDraft()?.password ?? "") : ""
  );
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setMode(resolveMode(initialMode));
    setError("");
  }, [initialMode, showRegister]);

  useEffect(() => {
    if (variant !== "inline") return;
    writeAuthDraft({ username, password, mode });
  }, [variant, username, password, mode]);

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setError("");
    setPasswordConfirm("");
  };

  const submit = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/english-teacher-review/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: mode,
          username,
          password,
          password_confirm: passwordConfirm,
        }),
      });
      const parsed = await readApiJson<{
        ok?: boolean;
        error?: string;
        maintenance?: boolean;
        user?: EtrAuthUser;
      }>(res);
      if (!parsed.ok) {
        setError(parsed.error || auth.failed);
        return;
      }
      const data = parsed.data;
      if (data.maintenance) {
        const locale = readStoredLocale() ?? "en";
        window.location.href = maintenancePath(locale);
        return;
      }
      if (!data.ok) {
        setError(data.error || auth.failed);
        return;
      }
      if (variant === "inline") clearAuthDraft();
      onAuthenticated(data.user as EtrAuthUser);
    } catch {
      setError(auth.failed);
    } finally {
      setLoading(false);
    }
  };

  const panel = (
    <section
      className={`etr-panel etr-auth-panel${variant === "inline" ? " etr-auth-panel--inline" : ""}`}
      aria-label={auth.loginTab}
    >
      {variant === "inline" && onClose ? (
        <div className="etr-auth-inline-head">
          <h2>{title ?? (mode === "login" ? auth.loginTab : auth.registerTab)}</h2>
          <button
            type="button"
            className="etr-auth-close"
            onClick={onClose}
            aria-label={auth.close}
          >
            ×
          </button>
        </div>
      ) : null}

      {mode === "register" && showRegister ? (
        <>
          <p className="hint etr-auth-hint">{auth.registerHint}</p>
          <p className="hint etr-auth-warning">{auth.saveCredentialsWarning}</p>
        </>
      ) : (
        <p className="hint etr-auth-hint">{subtitle ?? auth.loginHint}</p>
      )}

      <form
        className="etr-auth-form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="field">
          <label htmlFor="etr-auth-username">
            {auth.username}
            <span className="etr-required">*</span>
          </label>
          <input
            id="etr-auth-username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={auth.usernamePlaceholder}
            autoComplete="username"
            autoCapitalize="off"
            spellCheck={false}
          />
        </div>

        <PasswordField
          id="etr-auth-password"
          label={auth.password}
          value={password}
          onChange={setPassword}
          placeholder={auth.passwordPlaceholder}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          showLabel={auth.showPassword}
          hideLabel={auth.hidePassword}
          required
        />

        {mode === "register" && showRegister ? (
          <PasswordField
            id="etr-auth-password-confirm"
            label={auth.passwordConfirm}
            value={passwordConfirm}
            onChange={setPasswordConfirm}
            placeholder={auth.passwordConfirmPlaceholder}
            autoComplete="new-password"
            showLabel={auth.showPassword}
            hideLabel={auth.hidePassword}
            required
          />
        ) : null}

        {error ? (
          <p className="telegram-push-result telegram-push-result--err" role="alert">
            {error}
          </p>
        ) : null}

        <div className="etr-auth-form-actions">
          <button
            type="submit"
            className="btn-rsi-filter btn-rsi-filter--primary etr-auth-submit"
            disabled={loading}
          >
            {loading
              ? auth.submitting
              : mode === "login"
                ? auth.loginSubmit
                : auth.registerSubmit}
          </button>
          {showRegister && mode === "login" ? (
            <button
              type="button"
              className="etr-auth-switch-link"
              onClick={() => switchMode("register")}
            >
              {auth.registerLink}
            </button>
          ) : null}
          {showRegister && mode === "register" ? (
            <button
              type="button"
              className="etr-auth-switch-link"
              onClick={() => switchMode("login")}
            >
              {auth.switchToLogin}
            </button>
          ) : null}
        </div>
      </form>
    </section>
  );

  if (variant === "inline") {
    return panel;
  }

  return (
    <div className="etr-page etr-page--auth">
      <div className="page-hero etr-hero-center">
        <h1>{title ?? t("teacherReview").page.title}</h1>
        <p className="sub">{subtitle ?? auth.gateSubtitle}</p>
      </div>
      {panel}
    </div>
  );
}
