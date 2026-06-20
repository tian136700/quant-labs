"use client";

import { useState } from "react";
import type { EtrAuthUser } from "@/contexts/EtrAuthProvider";
import { useI18n } from "@/i18n/I18nProvider";

export type { EtrAuthUser };

type AuthMode = "login" | "register";

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

  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || auth.failed);
        return;
      }
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
            className="btn-rsi-filter btn-rsi-filter--compact"
            onClick={onClose}
            aria-label={auth.close}
          >
            ×
          </button>
        </div>
      ) : null}

      {!loginOnly ? (
        <div className="etr-auth-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "login"}
            className={`btn-rsi-filter btn-rsi-filter--compact${mode === "login" ? " is-active" : ""}`}
            onClick={() => {
              setMode("login");
              setError("");
            }}
          >
            {auth.loginTab}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "register"}
            className={`btn-rsi-filter btn-rsi-filter--compact${mode === "register" ? " is-active" : ""}`}
            onClick={() => {
              setMode("register");
              setError("");
            }}
          >
            {auth.registerTab}
          </button>
        </div>
      ) : null}

      {mode === "register" && !loginOnly ? (
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

        {mode === "register" && !loginOnly ? (
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

        <div className="etr-form-actions etr-form-actions--center">
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
