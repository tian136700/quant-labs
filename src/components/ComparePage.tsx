"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import type { ComparePayload } from "@/lib/types";
import { CompareChart } from "./CompareChart";
import { CompareTable } from "./CompareTable";
import { SeoContent } from "./SeoContent";

const LS_SYMBOL = "strategy_compare_symbol";
const LS_YEARS = "strategy_compare_years";

function readUrlFilters(): { sym: string; yrs: number } | null {
  if (typeof window === "undefined") return null;
  const sp = new URLSearchParams(window.location.search);
  const sym = sp.get("symbol")?.trim().toUpperCase();
  if (!sym) return null;
  const rawYears = sp.get("years");
  if (rawYears) {
    const y = parseInt(rawYears, 10);
    if (y >= 1 && y <= 10) return { sym, yrs: y };
  }
  return { sym, yrs: 2 };
}

function syncUrlFilters(sym: string, yrs: number) {
  const url = new URL(window.location.href);
  url.searchParams.set("symbol", sym);
  url.searchParams.set("years", String(yrs));
  window.history.replaceState(null, "", url.toString());
}

export function ComparePage() {
  const { locale, t } = useI18n();
  const page = t("page");
  const params = t("params");
  const statusMsg = t("status");
  const results = t("results");
  const meta = t("meta");

  const [symbol, setSymbol] = useState("SPY");
  const [years, setYears] = useState(2);
  const [status, setStatus] = useState("");
  const [statusKind, setStatusKind] = useState<"" | "ok" | "err">("");
  const [loading, setLoading] = useState(false);
  const [compare, setCompare] = useState<ComparePayload | null>(null);
  const [cacheHit, setCacheHit] = useState<boolean | null>(null);

  const saveFilters = useCallback((sym: string, y: number) => {
    try {
      localStorage.setItem(LS_SYMBOL, sym);
      localStorage.setItem(LS_YEARS, String(y));
    } catch {
      /* ignore */
    }
  }, []);

  const runCompareWith = useCallback(
    async (symInput: string, yearsInput: number) => {
      const sym = symInput.trim().toUpperCase();
      if (!sym) {
        setStatus(statusMsg.enterSymbol);
        setStatusKind("err");
        return;
      }
      if (yearsInput < 1 || yearsInput > 10) {
        setStatus(statusMsg.yearsRange);
        setStatusKind("err");
        return;
      }

      saveFilters(sym, yearsInput);
      syncUrlFilters(sym, yearsInput);
      document.title = `${sym} · ${meta.title}`;
      setLoading(true);
      setStatus(statusMsg.loading);
      setStatusKind("");

      try {
        const urlParams = new URLSearchParams({
          symbol: sym,
          years: String(yearsInput),
        });
        const res = await fetch(`/api/bars?${urlParams}`);
        const data = await res.json();

        if (!data.ok) {
          setStatus(data.error || statusMsg.requestFailed);
          setStatusKind("err");
          setCompare(null);
          return;
        }

        setCompare(data.compare);
        setCacheHit(data.cache_hit ?? null);
        setStatus(data.cache_hit ? statusMsg.cacheHit : statusMsg.cacheMiss);
        setStatusKind("ok");
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setStatus(`${statusMsg.errorPrefix}: ${msg}`);
        setStatusKind("err");
        setCompare(null);
      } finally {
        setLoading(false);
      }
    },
    [saveFilters, statusMsg, meta.title]
  );

  useEffect(() => {
    const fromUrl = readUrlFilters();
    let sym = "SPY";
    let yrs = 2;
    if (fromUrl) {
      sym = fromUrl.sym;
      yrs = fromUrl.yrs;
    } else {
      try {
        const lsSym = localStorage.getItem(LS_SYMBOL);
        const lsYears = localStorage.getItem(LS_YEARS);
        if (lsSym) sym = lsSym.toUpperCase();
        if (lsYears) {
          const y = parseInt(lsYears, 10);
          if (y >= 1 && y <= 10) yrs = y;
        }
      } catch {
        /* ignore */
      }
    }
    setSymbol(sym);
    setYears(yrs);
    void runCompareWith(sym, yrs);
  }, [runCompareWith]);

  useEffect(() => {
    document.title = meta.title;
  }, [locale, meta.title]);

  const runCompare = useCallback(async () => {
    await runCompareWith(symbol, years);
  }, [runCompareWith, symbol, years]);

  const statusClass =
    statusKind === "ok"
      ? "telegram-push-result telegram-push-result--ok"
      : statusKind === "err"
        ? "telegram-push-result telegram-push-result--err"
        : "telegram-push-result";

  const runButton = (
    <button
      type="button"
      className="btn-rsi-filter"
      onClick={runCompare}
      disabled={loading}
    >
      {loading ? params.computing : params.run}
    </button>
  );

  return (
    <>
      <h1>{page.title}</h1>
      <p className="sub">{page.subtitle}</p>

      <section className="section" aria-labelledby="params-heading">
        <h2 id="params-heading">{params.heading}</h2>
        <div className="row cmp-params-row">
          <div>
            <label htmlFor="cmpSymbol">{params.ticker}</label>
            <input
              id="cmpSymbol"
              type="text"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder={params.tickerPlaceholder}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div>
            <label htmlFor="cmpYears">{params.years}</label>
            <input
              id="cmpYears"
              type="number"
              min={1}
              max={10}
              value={years}
              onChange={(e) => setYears(parseInt(e.target.value, 10) || 1)}
            />
          </div>
          <div className="desktop-action">
            <span className="rsi-filter-actions-label">{params.action}</span>
            <div className="rsi-filter-actions">{runButton}</div>
          </div>
        </div>
        <p className={statusClass} role="status" aria-live="polite">
          {status}
          {cacheHit === true && statusKind === "ok" ? " ⚡" : null}
        </p>
      </section>

      <section className="section" aria-labelledby="results-heading">
        <h2 id="results-heading">{results.heading}</h2>
        <p className="hint">{results.hint}</p>
        {!compare ? (
          <p className="empty">{results.empty}</p>
        ) : (
          <CompareTable data={compare} />
        )}
      </section>

      {compare ? (
        <section className="section" aria-labelledby="chart-heading">
          <h2 id="chart-heading">{t("chart").heading}</h2>
          <CompareChart points={compare.chart_points} symbol={compare.symbol} />
        </section>
      ) : null}

      <div className="mobile-action-bar" role="toolbar" aria-label={params.action}>
        {runButton}
      </div>

      <SeoContent />
    </>
  );
}
