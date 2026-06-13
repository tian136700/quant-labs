"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import { storeReviewPath } from "@/lib/locale-path";
import {
  STORE_PLATFORMS,
  platformLabel,
} from "@/store-review/platforms";
import type { PublicStoreReview } from "@/store-review/types";

function scoreClass(score: number): string {
  if (score >= 8) return "etr-score--high";
  if (score <= 4) return "etr-score--low";
  return "etr-score--mid";
}

export function StoreReviewPlazaPage() {
  const { locale, t } = useI18n();
  const pl = t("storeReview").plaza;

  const [records, setRecords] = useState<PublicStoreReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [platform, setPlatform] = useState("");
  const [storeQuery, setStoreQuery] = useState("");
  const [error, setError] = useState("");

  const platformOptions = useMemo(
    () =>
      STORE_PLATFORMS.map((p) => ({
        id: p.id,
        label: locale === "zh" ? p.labelZh : p.labelEn,
      })),
    [locale]
  );

  useEffect(() => {
    document.title = pl.metaTitle;
  }, [locale, pl.metaTitle]);

  const loadPlaza = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ _: String(Date.now()) });
      if (platform) params.set("platform", platform);
      if (storeQuery.trim()) params.set("store", storeQuery.trim());
      const res = await fetch(`/api/store-review/plaza?${params}`);
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || pl.loadFailed);
        setRecords([]);
        return;
      }
      setRecords(data.data ?? []);
    } catch {
      setError(pl.loadFailed);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [platform, storeQuery, pl.loadFailed]);

  useEffect(() => {
    void loadPlaza();
  }, [loadPlaza]);

  return (
    <div className="etr-page svr-page svr-plaza">
      <div className="page-hero">
        <div className="etr-top-bar">
          <div className="etr-top-bar-main">
            <h1>{pl.title}</h1>
            <p className="sub">{pl.subtitle}</p>
            <p className="hint svr-plaza-link-wrap">
              <Link href={storeReviewPath(locale)} className="svr-plaza-link">
                {pl.myReviewsLink}
              </Link>
            </p>
          </div>
        </div>
      </div>

      <section className="section etr-panel" aria-labelledby="svr-plaza-filter-heading">
        <h2 id="svr-plaza-filter-heading">{pl.filterHeading}</h2>
        <div className="form-grid svr-plaza-filters">
          <div className="field">
            <label htmlFor="svr-plaza-platform">{pl.platform}</label>
            <select
              id="svr-plaza-platform"
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
            >
              <option value="">{pl.allPlatforms}</option>
              {platformOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="svr-plaza-store">{pl.storeSearch}</label>
            <input
              id="svr-plaza-store"
              type="search"
              value={storeQuery}
              onChange={(e) => setStoreQuery(e.target.value)}
              placeholder={pl.storeSearchPlaceholder}
            />
          </div>
          <div className="field svr-plaza-filter-action">
            <button
              type="button"
              className="btn-rsi-filter btn-rsi-filter--primary"
              onClick={() => void loadPlaza()}
              disabled={loading}
            >
              {pl.search}
            </button>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="svr-plaza-list-heading">
        <h2 id="svr-plaza-list-heading">{pl.listHeading}</h2>
        <p className="hint">{pl.usernameHint}</p>

        {error ? (
          <p className="telegram-push-result telegram-push-result--err" role="alert">
            {error}
          </p>
        ) : null}

        {loading ? (
          <p className="empty">{pl.loading}</p>
        ) : !records.length ? (
          <p className="empty">{pl.empty}</p>
        ) : (
          <div className="svr-plaza-list">
            {records.map((item) => (
              <article key={item.id} className="strategy-card svr-plaza-card">
                <header className="svr-plaza-card-head">
                  <div>
                    <h3 className="strategy-card-title svr-plaza-store">
                      {item.store_name}
                    </h3>
                    <p className="hint svr-plaza-meta">
                      {platformLabel(item.platform, locale, item.platform_other)}
                      {" · "}
                      {item.masked_username}
                    </p>
                  </div>
                  <span className={`etr-score-badge ${scoreClass(item.score)}`}>
                    {item.score} {t("storeReview").form.scoreUnit}
                  </span>
                </header>

                {item.remark ? (
                  <p className="svr-plaza-remark">{item.remark}</p>
                ) : null}

                {item.good_dishes.length ? (
                  <div className="svr-plaza-dish-group">
                    <h4>{pl.goodDishes}</h4>
                    <ul className="svr-dish-tags svr-dish-tags--good">
                      {item.good_dishes.map((d) => (
                        <li key={d.id} title={d.remark ?? undefined}>
                          {d.dish_name}
                          {d.remark ? ` — ${d.remark}` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {item.bad_dishes.length ? (
                  <div className="svr-plaza-dish-group">
                    <h4>{pl.badDishes}</h4>
                    <ul className="svr-dish-tags svr-dish-tags--bad">
                      {item.bad_dishes.map((d) => (
                        <li key={d.id} title={d.remark ?? undefined}>
                          {d.dish_name}
                          {d.remark ? ` — ${d.remark}` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <p className="hint svr-plaza-time">{item.updated_at}</p>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
