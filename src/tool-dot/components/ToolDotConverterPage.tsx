"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { LangSwitch } from "@/components/LangSwitch";
import { useI18n } from "@/i18n/I18nProvider";
import { toolDotHomePath } from "@/lib/locale-path";
import {
  downloadBlob,
  outputFilename,
  pdfToExcel,
  pdfToWord,
  wordToPdf,
} from "@/tool-dot/conversion/convert";
import type { ToolDotDefinition } from "@/tool-dot/tools";

type Props = {
  tool: ToolDotDefinition;
};

export function ToolDotConverterPage({ tool }: Props) {
  const { locale, t } = useI18n();
  const td = t("toolDot");
  const info = td.tools[tool.id];

  const fileRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [statusKind, setStatusKind] = useState<"" | "ok" | "err">("");

  useEffect(() => {
    document.title = info.pageTitle;
  }, [locale, info.pageTitle]);

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const picked = e.target.files?.[0] ?? null;
      setFile(picked);
      setStatus("");
      setStatusKind("");
    },
    []
  );

  const runConvert = useCallback(async () => {
    if (!code.trim()) {
      setStatus(td.converter.codeRequired);
      setStatusKind("err");
      return;
    }
    if (!file) {
      setStatus(td.converter.fileRequired);
      setStatusKind("err");
      return;
    }

    const maxBytes = tool.maxMb * 1024 * 1024;
    if (file.size > maxBytes) {
      setStatus(td.converter.fileTooLarge.replace("{max}", String(tool.maxMb)));
      setStatusKind("err");
      return;
    }

    setBusy(true);
    setStatus(td.converter.claiming);
    setStatusKind("");

    try {
      const claimRes = await fetch("/api/tool-dot/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim(),
          tool_type: tool.id,
          filename: file.name,
        }),
      });
      const claimData = (await claimRes.json()) as { ok?: boolean; error?: string };
      if (!claimData.ok) {
        setStatus(claimData.error || td.converter.claimFailed);
        setStatusKind("err");
        return;
      }

      setStatus(td.converter.converting);

      let blob: Blob;
      if (tool.id === "pdf-to-word") {
        blob = await pdfToWord(file);
      } else if (tool.id === "pdf-to-excel") {
        blob = await pdfToExcel(file);
      } else {
        blob = await wordToPdf(file);
      }

      downloadBlob(blob, outputFilename(file.name, tool.ext));
      setStatus(td.converter.done);
      setStatusKind("ok");
      setCode("");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch {
      setStatus(td.converter.convertFailed);
      setStatusKind("err");
    } finally {
      setBusy(false);
    }
  }, [code, file, td, tool]);

  return (
    <div className="page-wrap tool-dot-wrap">
      <header className="page-header tool-dot-header">
        <div className="tool-dot-brand">
          <Link href={toolDotHomePath(locale)} className="tool-dot-back">
            ← {td.converter.backHome}
          </Link>
          <h1 className="tool-dot-title">{info.title}</h1>
          <p className="tool-dot-subtitle">{info.desc}</p>
        </div>
        <div className="page-header-tools">
          <LangSwitch />
        </div>
      </header>

      <section className="tool-dot-converter">
        <div className="tool-dot-panel">
          <label className="tool-dot-field">
            <span className="tool-dot-label">{td.converter.codeLabel}</span>
            <input
              type="text"
              className="tool-dot-input"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder={td.converter.codePlaceholder}
              autoComplete="off"
              spellCheck={false}
              disabled={busy}
            />
            <span className="tool-dot-hint">{td.converter.codeHint}</span>
          </label>

          <label className="tool-dot-field">
            <span className="tool-dot-label">{td.converter.fileLabel}</span>
            <input
              ref={fileRef}
              type="file"
              className="tool-dot-file"
              accept={tool.accept}
              onChange={onFileChange}
              disabled={busy}
            />
            {file ? (
              <span className="tool-dot-file-name">
                {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
              </span>
            ) : (
              <span className="tool-dot-hint">{info.fileHint}</span>
            )}
          </label>

          <button
            type="button"
            className="tool-dot-btn tool-dot-btn--primary"
            onClick={() => void runConvert()}
            disabled={busy}
          >
            {busy ? td.converter.working : td.converter.convert}
          </button>

          {status ? (
            <p
              className={`tool-dot-status${statusKind === "ok" ? " tool-dot-status--ok" : statusKind === "err" ? " tool-dot-status--err" : ""}`}
              role="status"
            >
              {status}
            </p>
          ) : null}

          <p className="tool-dot-disclaimer">{td.converter.disclaimer}</p>
        </div>
      </section>
    </div>
  );
}
