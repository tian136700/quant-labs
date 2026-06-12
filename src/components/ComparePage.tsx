"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import type { ComparePayload } from "@/lib/types";
import { CompareChart } from "./CompareChart";
import { CompareTable } from "./CompareTable";

const LS_SYMBOL = "strategy_compare_symbol";
const LS_YEARS = "strategy_compare_years";

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
    let sym = "SPY";
    let yrs = 2;
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

  return (
    <>
      <h1>{page.title}</h1>
      <p className="sub">{page.subtitle}</p>

      <div className="section">
        <h2>{params.heading}</h2>
        <div className="row">
          <div className="field field--grow">
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
          <div className="field field--narrow">
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
          <div className="field field--action">
            <span className="rsi-filter-actions-label">{params.action}</span>
            <div className="rsi-filter-actions">
              <button
                type="button"
                className="btn-rsi-filter"
                onClick={runCompare}
                disabled={loading}
              >
                {loading ? params.computing : params.run}
              </button>
            </div>
          </div>
        </div>
        <p className={statusClass} role="status" aria-live="polite">
          {status}
          {cacheHit === true && statusKind === "ok" ? " ⚡" : null}
        </p>
      </div>

      <div className="section">
        <h2>{results.heading}</h2>
        <p className="hint">{results.hint}</p>
        {!compare ? (
          <p className="empty">{results.empty}</p>
        ) : (
          <CompareTable data={compare} />
        )}
      </div>

      {compare ? (
        <div className="section">
          <h2>{t("chart").heading}</h2>
          <CompareChart points={compare.chart_points} symbol={compare.symbol} />
        </div>
      ) : null}
    </>
  );
}
