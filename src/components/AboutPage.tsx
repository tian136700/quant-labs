"use client";

import { useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import { trackEvent } from "@/lib/analytics-client";
import { isValidEmail } from "@/lib/email-validation";

export function AboutPage() {
  const { locale, t } = useI18n();
  const about = t("about");
  const [email, setEmail] = useState("");
  const [content, setContent] = useState("");
  const [status, setStatus] = useState("");
  const [statusKind, setStatusKind] = useState<"" | "ok" | "err">("");
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async () => {
    const trimmedEmail = email.trim();
    const trimmedContent = content.trim();

    if (!trimmedEmail) {
      setStatus(about.status.emailRequired);
      setStatusKind("err");
      return;
    }
    if (!isValidEmail(trimmedEmail)) {
      setStatus(about.status.emailInvalid);
      setStatusKind("err");
      return;
    }
    if (!trimmedContent) {
      setStatus(about.status.contentRequired);
      setStatusKind("err");
      return;
    }

    setSubmitting(true);
    setStatus("");
    setStatusKind("");

    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: trimmedEmail,
          content: trimmedContent,
          url_path: window.location.pathname,
          locale,
        }),
      });
      const data = await res.json();

      if (!data.ok) {
        setStatus(data.error || about.status.submitFailed);
        setStatusKind("err");
        return;
      }

      setStatus(about.status.submitted);
      setStatusKind("ok");
      setContent("");
      trackEvent({
        event_type: "action",
        event_detail: "feedback_submit_client",
        locale,
      });
    } catch {
      setStatus(about.status.submitFailed);
      setStatusKind("err");
    } finally {
      setSubmitting(false);
    }
  };

  const statusClass =
    statusKind === "ok"
      ? "telegram-push-result telegram-push-result--ok"
      : statusKind === "err"
        ? "telegram-push-result telegram-push-result--err"
        : "telegram-push-result";

  return (
    <div className="about-page">
      <div className="page-hero">
        <h1>{about.page.title}</h1>
        <p className="sub">{about.page.intro}</p>
      </div>

      <section className="section etr-panel">
        <h2>{about.page.title}</h2>
        <div className="form-grid">
          <div className="field field--span-2">
            <label htmlFor="feedback-email">
              {about.form.email}
              <span className="etr-required">{about.form.required}</span>
            </label>
            <input
              id="feedback-email"
              type="email"
              name="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={about.form.emailPlaceholder}
            />
          </div>
          <div className="field field--span-2">
            <label htmlFor="feedback-content">
              {about.form.content}
              <span className="etr-required">{about.form.required}</span>
            </label>
            <textarea
              id="feedback-content"
              name="content"
              rows={6}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={about.form.contentPlaceholder}
            />
          </div>
        </div>
        <div className="etr-form-actions">
          <button
            type="button"
            className="btn-rsi-filter btn-rsi-filter--primary"
            onClick={() => void onSubmit()}
            disabled={submitting}
          >
            {submitting ? about.form.submitting : about.form.submit}
          </button>
        </div>
        {status ? <p className={statusClass}>{status}</p> : null}
      </section>
    </div>
  );
}
