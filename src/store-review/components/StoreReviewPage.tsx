"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TeacherReviewAuth } from "@/components/TeacherReviewAuth";
import { useEtrAuth } from "@/contexts/EtrAuthProvider";
import { useI18n } from "@/i18n/I18nProvider";
import { storeReviewPlazaPath } from "@/lib/locale-path";
import {
  STORE_PLATFORMS,
  platformLabel,
  type StorePlatformId,
} from "@/store-review/platforms";
import type {
  StoreReviewSortField,
  StoreReviewWithDishes,
} from "@/store-review/types";

type SortOrder = "asc" | "desc";
type AuthPanelMode = "login" | "register" | null;

type DishRow = {
  key: string;
  dish_name: string;
  remark: string;
};

type FormState = {
  id: string;
  platform: StorePlatformId | "";
  platform_other: string;
  store_name: string;
  score: string;
  remark: string;
  is_public: boolean;
  good_dishes: DishRow[];
  bad_dishes: DishRow[];
};

function newDishRow(): DishRow {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    dish_name: "",
    remark: "",
  };
}

function defaultForm(): FormState {
  return {
    id: "",
    platform: "",
    platform_other: "",
    store_name: "",
    score: "",
    remark: "",
    is_public: false,
    good_dishes: [],
    bad_dishes: [],
  };
}

function defaultOrderForField(field: StoreReviewSortField): SortOrder {
  return field === "store_name" || field === "score" ? "asc" : "desc";
}

function scoreClass(score: number): string {
  if (score >= 8) return "etr-score--high";
  if (score <= 4) return "etr-score--low";
  return "etr-score--mid";
}

function dishesToRows(
  dishes: { dish_name: string; remark: string | null }[]
): DishRow[] {
  return dishes.map((d) => ({
    key: `${d.dish_name}-${Math.random().toString(36).slice(2, 6)}`,
    dish_name: d.dish_name,
    remark: d.remark ?? "",
  }));
}

export function StoreReviewPage() {
  const { locale, t } = useI18n();
  const sr = t("storeReview");
  const formRef = useRef<HTMLFormElement>(null);

  const { user: authUser, checking: authChecking, setUser: setAuthUser, logout } =
    useEtrAuth();
  const [authPanel, setAuthPanel] = useState<AuthPanelMode>(null);

  const [form, setForm] = useState<FormState>(defaultForm);
  const [records, setRecords] = useState<StoreReviewWithDishes[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [statusKind, setStatusKind] = useState<"" | "ok" | "err">("");
  const [sortField, setSortField] = useState<StoreReviewSortField>("updated_at");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  const platformGroups = useMemo(
    () => ({
      intl: STORE_PLATFORMS.filter((p) => p.group === "intl"),
      cn: STORE_PLATFORMS.filter((p) => p.group === "cn"),
      misc: STORE_PLATFORMS.filter((p) => p.group === "misc"),
    }),
    []
  );

  useEffect(() => {
    document.title = sr.meta.title;
  }, [locale, sr.meta.title]);

  const openAuth = (mode: "login" | "register") => {
    setAuthPanel(mode);
    setStatus(sr.demo.loginToSave);
    setStatusKind("err");
    window.setTimeout(() => {
      document.getElementById("etr-auth-panel")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 50);
  };

  const onLogout = async () => {
    await logout();
    setAuthPanel(null);
    setRecords([]);
    setForm(defaultForm());
    setStatus("");
    setStatusKind("");
  };

  const setField = useCallback(
    <K extends keyof FormState>(key: K, value: FormState[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const resetForm = useCallback(() => {
    setForm(defaultForm());
  }, []);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        sort: sortField,
        order: sortOrder,
        _: String(Date.now()),
      });
      const res = await fetch(`/api/store-review?${params}`, {
        credentials: "include",
      });
      const data = await res.json();
      if (data.auth_required) {
        setAuthUser(null);
        return;
      }
      if (!data.ok) {
        setStatus(data.error || sr.status.loadFailed);
        setStatusKind("err");
        setRecords([]);
        return;
      }
      setRecords(data.data ?? []);
    } catch {
      setStatus(sr.status.loadFailed);
      setStatusKind("err");
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [sortField, sortOrder, sr.status.loadFailed, setAuthUser]);

  useEffect(() => {
    if (!authUser) return;
    void loadHistory();
  }, [loadHistory, authUser]);

  const onSort = (field: StoreReviewSortField) => {
    if (sortField === field) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder(defaultOrderForField(field));
    }
  };

  const sortMark = (field: StoreReviewSortField) => {
    if (sortField !== field) return "";
    return sortOrder === "asc" ? " ↑" : " ↓";
  };

  const requireAuth = (): boolean => {
    if (authUser) return true;
    openAuth("login");
    return false;
  };

  const validate = (): boolean => {
    if (!form.platform) {
      setStatus(sr.form.platformRequired);
      setStatusKind("err");
      return false;
    }
    if (form.platform === "other" && !form.platform_other.trim()) {
      setStatus(sr.form.platformOtherRequired);
      setStatusKind("err");
      return false;
    }
    if (!form.store_name.trim()) {
      setStatus(sr.form.storeNameRequired);
      setStatusKind("err");
      return false;
    }
    if (form.score === "") {
      setStatus(sr.form.scoreRequired);
      setStatusKind("err");
      return false;
    }
    return true;
  };

  const onSave = async () => {
    if (!requireAuth()) return;
    if (!validate()) return;
    setSaving(true);
    setStatus("");
    setStatusKind("");

    try {
      const res = await fetch("/api/store-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          id: form.id || undefined,
          platform: form.platform,
          platform_other: form.platform_other.trim(),
          store_name: form.store_name.trim(),
          score: parseInt(form.score, 10),
          remark: form.remark.trim(),
          is_public: form.is_public,
          good_dishes: form.good_dishes
            .filter((d) => d.dish_name.trim())
            .map((d) => ({
              dish_name: d.dish_name.trim(),
              remark: d.remark.trim(),
            })),
          bad_dishes: form.bad_dishes
            .filter((d) => d.dish_name.trim())
            .map((d) => ({
              dish_name: d.dish_name.trim(),
              remark: d.remark.trim(),
            })),
        }),
      });
      const data = await res.json();
      if (data.auth_required) {
        setAuthUser(null);
        openAuth("login");
        return;
      }
      if (!data.ok) {
        setStatus(data.error || sr.status.saveFailed);
        setStatusKind("err");
        return;
      }
      setStatus(sr.status.saved);
      setStatusKind("ok");
      resetForm();
      void loadHistory();
    } catch {
      setStatus(sr.status.saveFailed);
      setStatusKind("err");
    } finally {
      setSaving(false);
    }
  };

  const onEdit = (record: StoreReviewWithDishes) => {
    if (!requireAuth()) return;
    setForm({
      id: String(record.id),
      platform: record.platform,
      platform_other: record.platform_other ?? "",
      store_name: record.store_name,
      score: String(record.score),
      remark: record.remark ?? "",
      is_public: record.is_public === 1,
      good_dishes: dishesToRows(record.good_dishes),
      bad_dishes: dishesToRows(record.bad_dishes),
    });
    setStatus(sr.status.editLoaded);
    setStatusKind("ok");
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const onDelete = async (id: number) => {
    if (!requireAuth()) return;
    if (!window.confirm(sr.history.confirmDelete)) return;
    try {
      const res = await fetch("/api/store-review", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ids: [id] }),
      });
      const data = await res.json();
      if (data.auth_required) {
        setAuthUser(null);
        openAuth("login");
        return;
      }
      if (!data.ok) {
        setStatus(data.error || sr.status.deleteFailed);
        setStatusKind("err");
        return;
      }
      setStatus(sr.status.deleted);
      setStatusKind("ok");
      if (form.id === String(id)) resetForm();
      void loadHistory();
    } catch {
      setStatus(sr.status.deleteFailed);
      setStatusKind("err");
    }
  };

  const updateDish = (
    kind: "good_dishes" | "bad_dishes",
    key: string,
    patch: Partial<DishRow>
  ) => {
    setForm((prev) => ({
      ...prev,
      [kind]: prev[kind].map((row) =>
        row.key === key ? { ...row, ...patch } : row
      ),
    }));
  };

  const addDish = (kind: "good_dishes" | "bad_dishes") => {
    if (!requireAuth()) return;
    setForm((prev) => ({
      ...prev,
      [kind]: [...prev[kind], newDishRow()],
    }));
  };

  const removeDish = (kind: "good_dishes" | "bad_dishes", key: string) => {
    setForm((prev) => ({
      ...prev,
      [kind]: prev[kind].filter((row) => row.key !== key),
    }));
  };

  const renderDishList = (
    kind: "good_dishes" | "bad_dishes",
    heading: string,
    namePlaceholder: string,
    remarkPlaceholder: string
  ) => (
    <div className="svr-dish-block">
      <div className="svr-dish-head">
        <h3 className="svr-dish-title">{heading}</h3>
        <button
          type="button"
          className="btn-rsi-filter btn-rsi-filter--compact"
          onClick={() => addDish(kind)}
        >
          {sr.form.addDish}
        </button>
      </div>
      {form[kind].length === 0 ? (
        <p className="hint svr-dish-empty">{sr.form.dishEmptyHint}</p>
      ) : (
        <ul className="svr-dish-list">
          {form[kind].map((row) => (
            <li key={row.key} className="svr-dish-row">
              <input
                type="text"
                value={row.dish_name}
                onChange={(e) =>
                  updateDish(kind, row.key, { dish_name: e.target.value })
                }
                placeholder={namePlaceholder}
                aria-label={namePlaceholder}
              />
              <input
                type="text"
                value={row.remark}
                onChange={(e) =>
                  updateDish(kind, row.key, { remark: e.target.value })
                }
                placeholder={remarkPlaceholder}
                aria-label={remarkPlaceholder}
              />
              <button
                type="button"
                className="btn-rsi-filter btn-rsi-filter--compact btn-rsi-filter--danger"
                onClick={() => removeDish(kind, row.key)}
                aria-label={sr.form.removeDish}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const statusClass =
    statusKind === "ok"
      ? "telegram-push-result telegram-push-result--ok"
      : statusKind === "err"
        ? "telegram-push-result telegram-push-result--err"
        : "telegram-push-result";

  const saveButton = (
    <button
      type="button"
      className="btn-rsi-filter btn-rsi-filter--primary"
      onClick={onSave}
      disabled={saving || authChecking}
    >
      {saving ? sr.form.saving : sr.form.save}
    </button>
  );

  const scoreOptions = Array.from({ length: 10 }, (_, i) => i + 1);
  const isGuest = !authUser;

  return (
    <div className="etr-page svr-page">
      <div className="page-hero">
        <div className="etr-top-bar">
          <div className="etr-top-bar-main">
            <h1>{sr.page.title}</h1>
            <p className="sub">{sr.page.subtitle}</p>
            <p className="hint svr-plaza-link-wrap">
              <Link href={storeReviewPlazaPath(locale)} className="svr-plaza-link">
                {sr.page.plazaLink}
              </Link>
            </p>
          </div>
          <div className="etr-top-bar-actions">
            {authUser ? (
              <>
                <p className="hint etr-user-line">{authUser.expires_hint}</p>
                <button
                  type="button"
                  className="btn-rsi-filter btn-rsi-filter--compact"
                  onClick={() => void onLogout()}
                >
                  {sr.auth.logout}
                </button>
              </>
            ) : (
              <div className="etr-guest-actions">
                <button
                  type="button"
                  className="btn-rsi-filter btn-rsi-filter--compact"
                  onClick={() => openAuth("login")}
                >
                  {sr.auth.loginTab}
                </button>
                <button
                  type="button"
                  className="btn-rsi-filter btn-rsi-filter--compact btn-rsi-filter--primary"
                  onClick={() => openAuth("register")}
                >
                  {sr.auth.registerTab}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {isGuest ? (
        <p className="etr-demo-banner hint" role="note">
          {sr.demo.banner}
        </p>
      ) : null}

      {authPanel ? (
        <div id="etr-auth-panel">
          <TeacherReviewAuth
            variant="inline"
            initialMode={authPanel}
            onClose={() => setAuthPanel(null)}
            onAuthenticated={(user) => {
              setAuthUser(user);
              setAuthPanel(null);
              setStatus("");
              setStatusKind("");
            }}
          />
        </div>
      ) : null}

      <section className="section etr-panel" aria-labelledby="svr-form-heading">
        <h2 id="svr-form-heading">{sr.form.heading}</h2>
        <form
          ref={formRef}
          className="etr-form"
          onSubmit={(e) => {
            e.preventDefault();
            void onSave();
          }}
        >
          <input type="hidden" name="id" value={form.id} />
          <div className="form-grid">
            <div className="field">
              <label htmlFor="svr-platform">
                {sr.form.platform}
                <span className="etr-required">{sr.form.required}</span>
              </label>
              <select
                id="svr-platform"
                value={form.platform}
                onChange={(e) =>
                  setField("platform", e.target.value as StorePlatformId | "")
                }
              >
                <option value="">{sr.form.platformPlaceholder}</option>
                <optgroup label={sr.form.platformGroupIntl}>
                  {platformGroups.intl.map((p) => (
                    <option key={p.id} value={p.id}>
                      {locale === "zh" ? p.labelZh : p.labelEn}
                    </option>
                  ))}
                </optgroup>
                <optgroup label={sr.form.platformGroupCn}>
                  {platformGroups.cn.map((p) => (
                    <option key={p.id} value={p.id}>
                      {locale === "zh" ? p.labelZh : p.labelEn}
                    </option>
                  ))}
                </optgroup>
                <optgroup label={sr.form.platformGroupMisc}>
                  {platformGroups.misc.map((p) => (
                    <option key={p.id} value={p.id}>
                      {locale === "zh" ? p.labelZh : p.labelEn}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>

            {form.platform === "other" ? (
              <div className="field">
                <label htmlFor="svr-platform-other">
                  {sr.form.platformOther}
                  <span className="etr-required">{sr.form.required}</span>
                </label>
                <input
                  id="svr-platform-other"
                  type="text"
                  value={form.platform_other}
                  onChange={(e) => setField("platform_other", e.target.value)}
                  placeholder={sr.form.platformOtherPlaceholder}
                />
              </div>
            ) : null}

            <div className="field">
              <label htmlFor="svr-store-name">
                {sr.form.storeName}
                <span className="etr-required">{sr.form.required}</span>
              </label>
              <input
                id="svr-store-name"
                type="text"
                value={form.store_name}
                onChange={(e) => setField("store_name", e.target.value)}
                placeholder={sr.form.storeNamePlaceholder}
                autoComplete="off"
              />
            </div>

            <div className="field">
              <label htmlFor="svr-score">
                {sr.form.score}
                <span className="etr-required">{sr.form.required}</span>
              </label>
              <select
                id="svr-score"
                value={form.score}
                onChange={(e) => setField("score", e.target.value)}
              >
                <option value="">{sr.form.scorePlaceholder}</option>
                {scoreOptions.map((n) => (
                  <option key={n} value={String(n)}>
                    {n} {sr.form.scoreUnit}
                  </option>
                ))}
              </select>
            </div>

            <div className="field field--span-2 etr-remark-field">
              <label htmlFor="svr-remark">{sr.form.remark}</label>
              <textarea
                id="svr-remark"
                value={form.remark}
                onChange={(e) => setField("remark", e.target.value)}
                placeholder={sr.form.remarkPlaceholder}
                rows={3}
              />
            </div>

            <div className="field field--span-2">
              <label className="svr-public-label">
                <input
                  type="checkbox"
                  checked={form.is_public}
                  onChange={(e) => setField("is_public", e.target.checked)}
                />
                <span>{sr.form.publicLabel}</span>
              </label>
              <p className="hint">{sr.form.publicHint}</p>
            </div>
          </div>

          {renderDishList(
            "good_dishes",
            sr.form.goodDishes,
            sr.form.dishNamePlaceholder,
            sr.form.dishRemarkPlaceholder
          )}
          {renderDishList(
            "bad_dishes",
            sr.form.badDishes,
            sr.form.dishNamePlaceholder,
            sr.form.badDishRemarkPlaceholder
          )}

          <div className="etr-form-actions desktop-action">
            {saveButton}
            <button
              type="button"
              className="btn-rsi-filter"
              onClick={() => {
                resetForm();
                setStatus(sr.status.resetDone);
                setStatusKind("ok");
              }}
            >
              {sr.form.reset}
            </button>
          </div>

          <p className={statusClass} role="status" aria-live="polite">
            {status}
          </p>
        </form>
      </section>

      <section className="section" aria-labelledby="svr-history-heading">
        <div className="etr-history-head">
          <h2 id="svr-history-heading">{sr.history.heading}</h2>
          {authUser ? (
            <button
              type="button"
              className="btn-rsi-filter btn-rsi-filter--compact"
              onClick={() => void loadHistory()}
              disabled={loading}
            >
              {sr.history.refresh}
            </button>
          ) : null}
        </div>
        <p className="hint">{sr.history.sortHint}</p>

        {!authUser ? (
          <p className="empty">{sr.history.loginHint}</p>
        ) : loading && !records.length ? (
          <p className="empty">{sr.form.saving}</p>
        ) : !records.length ? (
          <p className="empty">{sr.history.empty}</p>
        ) : (
          <>
            <div className="etr-cards">
              {records.map((item) => (
                <article key={item.id} className="strategy-card etr-card">
                  <h3 className="strategy-card-title">
                    {item.store_name}
                    <span className={`etr-score-badge ${scoreClass(item.score)}`}>
                      {item.score} {sr.form.scoreUnit}
                    </span>
                  </h3>
                  <dl className="strategy-card-grid">
                    <div className="strategy-card-item">
                      <dt>{sr.history.platform}</dt>
                      <dd>
                        {platformLabel(item.platform, locale, item.platform_other)}
                      </dd>
                    </div>
                    <div className="strategy-card-item">
                      <dt>{sr.history.visibility}</dt>
                      <dd>
                        {item.is_public === 1
                          ? sr.history.public
                          : sr.history.private}
                      </dd>
                    </div>
                    <div className="strategy-card-item">
                      <dt>{sr.history.updatedAt}</dt>
                      <dd>{item.updated_at}</dd>
                    </div>
                    {item.remark ? (
                      <div className="strategy-card-item strategy-card-item--wide">
                        <dt>{sr.history.remark}</dt>
                        <dd>{item.remark}</dd>
                      </div>
                    ) : null}
                    {item.good_dishes.length ? (
                      <div className="strategy-card-item strategy-card-item--wide">
                        <dt>{sr.history.goodDishes}</dt>
                        <dd>
                          <ul className="svr-dish-tags svr-dish-tags--good">
                            {item.good_dishes.map((d) => (
                              <li key={d.id}>{d.dish_name}</li>
                            ))}
                          </ul>
                        </dd>
                      </div>
                    ) : null}
                    {item.bad_dishes.length ? (
                      <div className="strategy-card-item strategy-card-item--wide">
                        <dt>{sr.history.badDishes}</dt>
                        <dd>
                          <ul className="svr-dish-tags svr-dish-tags--bad">
                            {item.bad_dishes.map((d) => (
                              <li key={d.id}>{d.dish_name}</li>
                            ))}
                          </ul>
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                  <div className="etr-card-actions">
                    <button
                      type="button"
                      className="btn-rsi-filter btn-rsi-filter--compact"
                      onClick={() => onEdit(item)}
                    >
                      {sr.history.edit}
                    </button>
                    <button
                      type="button"
                      className="btn-rsi-filter btn-rsi-filter--compact btn-rsi-filter--danger"
                      onClick={() => void onDelete(item.id)}
                    >
                      {sr.history.delete}
                    </button>
                  </div>
                </article>
              ))}
            </div>

            <div className="etr-table-wrap">
              <table className="compare-table etr-table">
                <thead>
                  <tr>
                    <th>{sr.history.id}</th>
                    <th>
                      <button
                        type="button"
                        className={`etr-sort-btn${sortField === "store_name" ? " is-active" : ""}`}
                        onClick={() => onSort("store_name")}
                      >
                        {sr.history.storeName}
                        {sortMark("store_name")}
                      </button>
                    </th>
                    <th>
                      <button
                        type="button"
                        className={`etr-sort-btn${sortField === "platform" ? " is-active" : ""}`}
                        onClick={() => onSort("platform")}
                      >
                        {sr.history.platform}
                        {sortMark("platform")}
                      </button>
                    </th>
                    <th>
                      <button
                        type="button"
                        className={`etr-sort-btn${sortField === "score" ? " is-active" : ""}`}
                        onClick={() => onSort("score")}
                      >
                        {sr.history.score}
                        {sortMark("score")}
                      </button>
                    </th>
                    <th>{sr.history.visibility}</th>
                    <th>{sr.history.remark}</th>
                    <th>
                      <button
                        type="button"
                        className={`etr-sort-btn${sortField === "updated_at" ? " is-active" : ""}`}
                        onClick={() => onSort("updated_at")}
                      >
                        {sr.history.updatedAt}
                        {sortMark("updated_at")}
                      </button>
                    </th>
                    <th>{sr.history.actions}</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((item) => (
                    <tr key={item.id}>
                      <td>{item.id}</td>
                      <td>{item.store_name}</td>
                      <td>
                        {platformLabel(item.platform, locale, item.platform_other)}
                      </td>
                      <td>
                        <span className={`etr-score-badge ${scoreClass(item.score)}`}>
                          {item.score} {sr.form.scoreUnit}
                        </span>
                      </td>
                      <td>
                        {item.is_public === 1
                          ? sr.history.public
                          : sr.history.private}
                      </td>
                      <td className="etr-remark-cell">{item.remark || "—"}</td>
                      <td>{item.updated_at}</td>
                      <td>
                        <div className="etr-row-actions">
                          <button
                            type="button"
                            className="btn-rsi-filter btn-rsi-filter--compact"
                            onClick={() => onEdit(item)}
                          >
                            {sr.history.edit}
                          </button>
                          <button
                            type="button"
                            className="btn-rsi-filter btn-rsi-filter--compact btn-rsi-filter--danger"
                            onClick={() => void onDelete(item.id)}
                          >
                            {sr.history.delete}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <div className="mobile-action-bar etr-mobile-bar" role="toolbar">
        {saveButton}
        <button
          type="button"
          className="btn-rsi-filter"
          onClick={() => {
            resetForm();
            setStatus(sr.status.resetDone);
            setStatusKind("ok");
          }}
        >
          {sr.form.reset}
        </button>
      </div>
    </div>
  );
}
