"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useEtrAuth } from "@/contexts/EtrAuthProvider";
import { useI18n } from "@/i18n/I18nProvider";
import { formatBeijingDateTime } from "@/lib/format-datetime";
import { adminPath, teacherReviewNavPath } from "@/lib/locale-path";
import type { TrendFetchRunRecord, TrendItemRecord } from "@/lib/types";
import type { TrendRunDetail } from "@/lib/trend-db";
import { resolveItemFullPrompt } from "@/lib/trend-db";

async function copyText(text: string) {
  await navigator.clipboard.writeText(text);
}

function PromptBlock({
  label,
  value,
  copyLabel,
  onCopied,
}: {
  label: string;
  value: string;
  copyLabel: string;
  onCopied: () => void;
}) {
  return (
    <div className="trend-prompt-block">
      <div className="trend-prompt-head">
        <h4>{label}</h4>
        <button
          type="button"
          className="btn-rsi-filter btn-rsi-filter--compact"
          onClick={() => {
            void copyText(value).then(onCopied);
          }}
        >
          {copyLabel}
        </button>
      </div>
      <textarea
        className="trend-prompt-textarea"
        readOnly
        value={value}
        rows={Math.min(32, Math.max(8, value.split("\n").length + 1))}
      />
    </div>
  );
}

export function AdminTrendsPage() {
  const { locale, t, tf } = useI18n();
  const tr = t("adminTrends");
  const { isAdmin, checking } = useEtrAuth();

  const [runs, setRuns] = useState<TrendFetchRunRecord[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [selectedRun, setSelectedRun] = useState<TrendRunDetail | null>(null);
  const [loadingRun, setLoadingRun] = useState(false);
  const [activeItem, setActiveItem] = useState<TrendItemRecord | null>(null);
  const [status, setStatus] = useState("");
  const [statusKind, setStatusKind] = useState<"" | "ok" | "err">("");

  const loadRuns = useCallback(async () => {
    setLoadingRuns(true);
    try {
      const res = await fetch("/api/trends/runs?limit=30", { credentials: "include" });
      const data = await res.json();
      if (!data.ok) {
        setStatus(data.error || tr.status.loadFailed);
        setStatusKind("err");
        return;
      }
      setRuns(data.records ?? []);
    } catch {
      setStatus(tr.status.loadFailed);
      setStatusKind("err");
    } finally {
      setLoadingRuns(false);
    }
  }, [tr.status.loadFailed]);

  const loadRun = useCallback(
    async (runId: number) => {
      setLoadingRun(true);
      setActiveItem(null);
      try {
        const res = await fetch(`/api/trends/runs/${runId}`, {
          credentials: "include",
        });
        const data = await res.json();
        if (!data.ok) {
          setStatus(data.error || tr.status.loadFailed);
          setStatusKind("err");
          return;
        }
        setSelectedRun(data.run);
      } catch {
        setStatus(tr.status.loadFailed);
        setStatusKind("err");
      } finally {
        setLoadingRun(false);
      }
    },
    [tr.status.loadFailed]
  );

  const runFetch = useCallback(async () => {
    setFetching(true);
    setStatus("");
    setStatusKind("");
    try {
      const res = await fetch("/api/trends/fetch", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!data.ok) {
        setStatus(data.error || tr.status.fetchFailed);
        setStatusKind("err");
        return;
      }
      setStatus(tr.status.fetchSuccess);
      setStatusKind("ok");
      await loadRuns();
      if (typeof data.run_id === "number") {
        await loadRun(data.run_id);
      }
    } catch {
      setStatus(tr.status.fetchFailed);
      setStatusKind("err");
    } finally {
      setFetching(false);
    }
  }, [
    loadRun,
    loadRuns,
    tr.status.fetchFailed,
    tr.status.fetchSuccess,
  ]);

  useEffect(() => {
    if (checking || !isAdmin) return;
    void loadRuns();
  }, [checking, isAdmin, loadRuns]);

  if (checking) return null;

  if (!isAdmin) {
    return (
      <div className="admin-page admin-page--auth">
        <div className="page-hero etr-hero-center">
          <h1>{tr.page.title}</h1>
          <p className="sub">{tr.auth.required}</p>
          <div className="etr-form-actions etr-form-actions--center">
            <a
              className="btn-rsi-filter btn-rsi-filter--primary"
              href={teacherReviewNavPath(locale)}
            >
              {tr.auth.login}
            </a>
          </div>
        </div>
      </div>
    );
  }

  const statusClass =
    statusKind === "err"
      ? "telegram-push-result telegram-push-result--err"
      : statusKind === "ok"
        ? "telegram-push-result telegram-push-result--ok"
        : "";

  const selectedItems =
    selectedRun?.items.filter((i) => i.selected === 1) ?? [];

  return (
    <div className="admin-page">
      <div className="page-hero">
        <h1>{tr.page.title}</h1>
        <p className="sub">{tr.page.subtitle}</p>
        <p className="hint">
          <Link href={adminPath(locale)}>{tr.page.backToAdmin}</Link>
        </p>
      </div>

      {status ? <p className={statusClass}>{status}</p> : null}

      <section className="section etr-panel">
        <div className="etr-history-head">
          <h2>{tr.runs.heading}</h2>
          <div className="etr-history-actions">
            <button
              type="button"
              className="btn-rsi-filter btn-rsi-filter--primary btn-rsi-filter--compact"
              onClick={() => void runFetch()}
              disabled={fetching || loadingRuns}
            >
              {fetching ? tr.runs.fetching : tr.runs.fetch}
            </button>
            <button
              type="button"
              className="btn-rsi-filter btn-rsi-filter--compact"
              onClick={() => void loadRuns()}
              disabled={loadingRuns || fetching}
            >
              {tr.runs.refresh}
            </button>
          </div>
        </div>

        {runs.length === 0 && !loadingRuns ? (
          <p className="hint">{tr.runs.empty}</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="compare-table etr-table admin-table">
              <thead>
                <tr>
                  <th>{tr.runs.id}</th>
                  <th>{tr.runs.fetchedAt}</th>
                  <th>{tr.runs.github}</th>
                  <th>{tr.runs.reddit}</th>
                  <th>{tr.runs.selected}</th>
                  <th>{tr.runs.actions}</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr
                    key={run.id}
                    className={
                      selectedRun?.id === run.id ? "trend-run-row--active" : ""
                    }
                  >
                    <td>{run.id}</td>
                    <td>{formatBeijingDateTime(run.fetched_at)}</td>
                    <td>{run.github_count}</td>
                    <td>{run.reddit_count}</td>
                    <td>{run.selected_count}</td>
                    <td>
                      <button
                        type="button"
                        className="btn-rsi-filter btn-rsi-filter--compact"
                        onClick={() => void loadRun(run.id)}
                        disabled={loadingRun}
                      >
                        {tr.runs.view}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedRun ? (
        <>
          <section className="section etr-panel">
            <h2>
              {tf(tr.detail.heading, {
                id: selectedRun.id,
                date: formatBeijingDateTime(selectedRun.fetched_at),
              })}
            </h2>
            <p className="hint">{tr.detail.selectedHint}</p>

            {selectedRun.batch_full_prompt ? (
              <PromptBlock
                label={tr.detail.fullPrompt}
                value={selectedRun.batch_full_prompt}
                copyLabel={tr.detail.copy}
                onCopied={() => {
                  setStatus(tr.status.copied);
                  setStatusKind("ok");
                }}
              />
            ) : null}

            <div className="admin-table-wrap">
              <table className="compare-table etr-table admin-table">
                <thead>
                  <tr>
                    <th>{tr.items.rank}</th>
                    <th>{tr.items.source}</th>
                    <th>{tr.items.title}</th>
                    <th>{tr.items.heat}</th>
                    <th>{tr.items.actions}</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedItems.map((item) => (
                    <tr
                      key={item.id}
                      className={
                        activeItem?.id === item.id
                          ? "trend-run-row--active"
                          : ""
                      }
                    >
                      <td>#{item.selection_rank}</td>
                      <td>
                        {item.source}
                        {item.subreddit ? ` / r/${item.subreddit}` : ""}
                        {item.stars != null ? ` · ★${item.stars.toLocaleString()}` : ""}
                      </td>
                      <td className="admin-cell-wrap">{item.title}</td>
                      <td>{Math.round(item.heat_score).toLocaleString()}</td>
                      <td>
                        <button
                          type="button"
                          className="btn-rsi-filter btn-rsi-filter--compact"
                          onClick={() => setActiveItem(item)}
                        >
                          {tr.items.preview}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {activeItem ? (
            <section className="section etr-panel trend-item-detail">
              <h2>{tr.itemDetail.heading}</h2>
              <dl className="strategy-card-grid">
                <div className="strategy-card-item strategy-card-item--wide">
                  <dt>{tr.items.title}</dt>
                  <dd>{activeItem.title}</dd>
                </div>
                {activeItem.description ? (
                  <div className="strategy-card-item strategy-card-item--wide">
                    <dt>{tr.itemDetail.description}</dt>
                    <dd className="trend-desc-preview">{activeItem.description}</dd>
                  </div>
                ) : null}
                {activeItem.url ? (
                  <div className="strategy-card-item strategy-card-item--wide">
                    <dt>{tr.itemDetail.url}</dt>
                    <dd>
                      <a href={activeItem.url} target="_blank" rel="noopener noreferrer">
                        {activeItem.url}
                      </a>
                    </dd>
                  </div>
                ) : null}
              </dl>

              {resolveItemFullPrompt(activeItem) ? (
                <PromptBlock
                  label={tr.itemDetail.fullPrompt}
                  value={resolveItemFullPrompt(activeItem)!}
                  copyLabel={tr.detail.copy}
                  onCopied={() => {
                    setStatus(tr.status.copied);
                    setStatusKind("ok");
                  }}
                />
              ) : null}
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
