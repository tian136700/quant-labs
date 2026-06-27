"use client";

import { useCallback, useEffect, useState } from "react";
import { useEtrAuth } from "@/contexts/EtrAuthProvider";
import { useI18n } from "@/i18n/I18nProvider";
import { formatBeijingDateTime } from "@/lib/format-datetime";
import {
  adminPath,
  adminRbacPath,
  adminTrendsPath,
  adminUsersPath,
  adminJpLessonTeachersPath,
  teacherReviewNavPath,
} from "@/lib/locale-path";
import type { ToolDotCodeRecord, ToolDotType } from "@/tool-dot/types";
import { TOOL_DOT_TYPES } from "@/tool-dot/types";

export function AdminToolCodesPage() {
  const { locale, t } = useI18n();
  const adm = t("toolDot").admin;
  const { isAdmin, checking } = useEtrAuth();

  const [toolType, setToolType] = useState<ToolDotType>("any");
  const [count, setCount] = useState(5);
  const [label, setLabel] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "unused" | "used">("unused");
  const [records, setRecords] = useState<ToolDotCodeRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [status, setStatus] = useState("");
  const [statusErr, setStatusErr] = useState(false);
  const [generatedCodes, setGeneratedCodes] = useState<string[]>([]);

  useEffect(() => {
    document.title = adm.meta.title;
  }, [locale, adm.meta.title]);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tool-dot/codes?status=${statusFilter}`, {
        credentials: "include",
      });
      const data = (await res.json()) as {
        ok?: boolean;
        records?: ToolDotCodeRecord[];
        error?: string;
      };
      if (!data.ok) {
        setStatus(data.error || adm.status.loadFailed);
        setStatusErr(true);
        return;
      }
      setRecords(data.records ?? []);
    } catch {
      setStatus(adm.status.loadFailed);
      setStatusErr(true);
    } finally {
      setLoading(false);
    }
  }, [adm.status.loadFailed, statusFilter]);

  useEffect(() => {
    if (!checking && isAdmin) void loadRecords();
  }, [checking, isAdmin, loadRecords]);

  const generateCodes = async () => {
    setGenerating(true);
    setStatus("");
    setStatusErr(false);
    setGeneratedCodes([]);
    try {
      const res = await fetch("/api/tool-dot/codes", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool_type: toolType, count, label: label || null }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        codes?: string[];
        error?: string;
      };
      if (!data.ok) {
        setStatus(data.error || adm.status.generateFailed);
        setStatusErr(true);
        return;
      }
      setGeneratedCodes(data.codes ?? []);
      setStatus(adm.status.generated);
      setStatusErr(false);
      void loadRecords();
    } catch {
      setStatus(adm.status.generateFailed);
      setStatusErr(true);
    } finally {
      setGenerating(false);
    }
  };

  const deleteCode = async (id: number) => {
    if (!confirm(adm.confirmDelete)) return;
    try {
      const res = await fetch(`/api/tool-dot/codes?id=${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!data.ok) {
        setStatus(data.error || adm.status.deleteFailed);
        setStatusErr(true);
        return;
      }
      void loadRecords();
    } catch {
      setStatus(adm.status.deleteFailed);
      setStatusErr(true);
    }
  };

  const copyCodes = async () => {
    if (!generatedCodes.length) return;
    try {
      await navigator.clipboard.writeText(generatedCodes.join("\n"));
      setStatus(adm.status.copied);
      setStatusErr(false);
    } catch {
      setStatus(adm.status.copyFailed);
      setStatusErr(true);
    }
  };

  const copyOneCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setStatus(adm.status.copied);
      setStatusErr(false);
    } catch {
      setStatus(adm.status.copyFailed);
      setStatusErr(true);
    }
  };

  const toolLabel = (type: ToolDotType) => adm.toolTypes[type] ?? type;

  if (checking) return null;

  if (!isAdmin) {
    return (
      <div className="admin-page admin-page--auth">
        <div className="page-hero etr-hero-center">
          <h1>{adm.page.title}</h1>
          <p className="sub">{adm.auth.required}</p>
          <div className="etr-form-actions etr-form-actions--center">
            <a
              className="btn-rsi-filter btn-rsi-filter--primary"
              href={teacherReviewNavPath(locale)}
            >
              {adm.auth.login}
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <div className="page-hero">
        <h1>{adm.page.title}</h1>
        <p className="sub">{adm.page.subtitle}</p>
        <p className="hint">
          <a href={adminPath(locale)}>{locale === "zh" ? "← 返回后台管理" : "← Back to admin"}</a>
          {" · "}
          <a href={adminUsersPath(locale)}>{locale === "zh" ? "用户管理" : "Users"}</a>
          {" · "}
          <a href={adminTrendsPath(locale)}>{locale === "zh" ? "趋势抓取" : "Trends"}</a>
          {" · "}
          <a href={adminRbacPath(locale)}>{locale === "zh" ? "角色权限" : "Roles"}</a>
          {" · "}
          <a href={adminJpLessonTeachersPath(locale)}>
            {locale === "zh" ? "上课老师" : "Lesson teachers"}
          </a>
        </p>
      </div>

      {status ? (
        <p className={statusErr ? "telegram-push-result telegram-push-result--err" : "hint"}>
          {status}
        </p>
      ) : null}

      <section className="section etr-panel admin-rbac-section admin-user-add-section">
        <h2 className="admin-user-add-title">{adm.generate.heading}</h2>
        <form
          className="admin-user-add-form"
          onSubmit={(e) => {
            e.preventDefault();
            void generateCodes();
          }}
        >
          <label className="admin-user-add-field">
            <span>{adm.generate.toolType}</span>
            <select
              value={toolType}
              disabled={generating}
              onChange={(e) => setToolType(e.target.value as ToolDotType)}
            >
              {TOOL_DOT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {toolLabel(type)}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-user-add-field">
            <span>{adm.generate.count}</span>
            <input
              type="number"
              min={1}
              max={50}
              value={count}
              disabled={generating}
              onChange={(e) => setCount(Number(e.target.value))}
            />
          </label>
          <label className="admin-user-add-field">
            <span>{adm.generate.label}</span>
            <input
              type="text"
              value={label}
              disabled={generating}
              placeholder={adm.generate.labelPlaceholder}
              onChange={(e) => setLabel(e.target.value)}
            />
          </label>
          <button
            type="submit"
            className="btn-rsi-filter btn-rsi-filter--primary admin-user-add-submit"
            disabled={generating}
          >
            {generating ? adm.generate.generating : adm.generate.submit}
          </button>
        </form>

        {generatedCodes.length > 0 ? (
          <div className="admin-tool-codes-result">
            <div className="admin-tool-codes-result-head">
              <strong>{adm.generate.result}</strong>
              <button
                type="button"
                className="btn-rsi-filter btn-rsi-filter--compact"
                onClick={() => void copyCodes()}
              >
                {adm.generate.copyAll}
              </button>
            </div>
            <pre className="admin-tool-codes-block">{generatedCodes.join("\n")}</pre>
          </div>
        ) : null}
      </section>

      <section className="section etr-panel admin-rbac-section">
        <div className="etr-history-head">
          <h2>{adm.list.heading}</h2>
          <div className="admin-tool-codes-filters">
            <select
              className="admin-tool-codes-filter-select"
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as "all" | "unused" | "used")
              }
            >
              <option value="all">{adm.list.filterAll}</option>
              <option value="unused">{adm.list.filterUnused}</option>
              <option value="used">{adm.list.filterUsed}</option>
            </select>
            <button
              type="button"
              className="btn-rsi-filter btn-rsi-filter--compact"
              onClick={() => void loadRecords()}
              disabled={loading}
            >
              {adm.list.refresh}
            </button>
          </div>
        </div>

        {loading ? (
          <p className="hint">{adm.list.loading}</p>
        ) : records.length === 0 ? (
          <p className="hint">{adm.list.empty}</p>
        ) : (
          <div className="admin-rbac-table-wrap">
            <table className="admin-rbac-table">
              <thead>
                <tr>
                  <th>{adm.list.code}</th>
                  <th>{adm.list.toolType}</th>
                  <th>{adm.list.label}</th>
                  <th>{adm.list.status}</th>
                  <th>{adm.list.usedAt}</th>
                  <th>{adm.list.actions}</th>
                </tr>
              </thead>
              <tbody>
                {records.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <code>{row.code}</code>
                    </td>
                    <td>{toolLabel(row.tool_type)}</td>
                    <td>{row.label || "—"}</td>
                    <td>
                      {row.consumed_at
                        ? locale === "zh"
                          ? "已使用"
                          : "Used"
                        : locale === "zh"
                          ? "未使用"
                          : "Unused"}
                    </td>
                    <td>
                      {row.consumed_at ? formatBeijingDateTime(row.consumed_at) : "—"}
                    </td>
                    <td>
                      <div className="etr-form-actions etr-form-actions--inline">
                        <button
                          type="button"
                          className="btn-rsi-filter btn-rsi-filter--compact"
                          onClick={() => void copyOneCode(row.code)}
                        >
                          {locale === "zh" ? "复制" : "Copy"}
                        </button>
                        {!row.consumed_at ? (
                          <button
                            type="button"
                            className="btn-rsi-filter btn-rsi-filter--danger btn-rsi-filter--compact"
                            onClick={() => void deleteCode(row.id)}
                          >
                            {adm.list.delete}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
