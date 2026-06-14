"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  downloadTranscriptPdf,
  downloadTranscriptTxt,
  downloadTranscriptWord,
} from "@/japanese-recognition/lib/export";
import "@/japanese-recognition/styles/japanese-recognition.css";

type SpeechRecognitionCtor = new () => SpeechRecognition;

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  return (
    window.SpeechRecognition ||
    (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionCtor })
      .webkitSpeechRecognition ||
    null
  );
}

export function JapaneseRecognitionApp() {
  const [supported, setSupported] = useState(true);
  const [listening, setListening] = useState(false);
  const [finalText, setFinalText] = useState("");
  const [interimText, setInterimText] = useState("");
  const [status, setStatus] = useState<{
    text: string;
    kind: "idle" | "on" | "err";
  }>({ text: "待機中", kind: "idle" });
  const [copyLabel, setCopyLabel] = useState("複製全文");
  const [showTranslation, setShowTranslation] = useState(false);
  const [translation, setTranslation] = useState(
    "翻譯將在識別完一句後自動出現"
  );
  const [translating, setTranslating] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const listeningRef = useRef(false);
  const finalTextRef = useRef("");
  const translateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    finalTextRef.current = finalText;
  }, [finalText]);

  useEffect(() => {
    setSupported(getSpeechRecognition() !== null);
  }, []);

  const scheduleTranslation = useCallback((text: string) => {
    if (translateTimerRef.current) clearTimeout(translateTimerRef.current);
    translateTimerRef.current = setTimeout(async () => {
      if (!text.trim()) return;
      setTranslating(true);
      try {
        const res = await fetch("/api/japanese-recognition/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        const data = (await res.json()) as { translation?: string; error?: string };
        if (res.ok && data.translation) {
          setTranslation(data.translation);
        } else {
          setTranslation(data.error || "翻譯失敗");
        }
      } catch {
        setTranslation("翻譯出錯，請檢查網絡");
      } finally {
        setTranslating(false);
      }
    }, 1200);
  }, []);

  const setupRecognition = useCallback(() => {
    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) return null;

    const recognition = new SpeechRecognition();
    recognition.lang = "ja-JP";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setListening(true);
      setStatus({ text: "識別中", kind: "on" });
    };

    recognition.onresult = (e: SpeechRecognitionEvent) => {
      let interim = "";
      let nextFinal = finalTextRef.current;

      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          nextFinal += t + "\n";
        } else {
          interim += t;
        }
      }

      if (nextFinal !== finalTextRef.current) {
        finalTextRef.current = nextFinal;
        setFinalText(nextFinal);
        if (showTranslation) scheduleTranslation(nextFinal);
      }
      setInterimText(interim);
    };

    recognition.onerror = (e: SpeechRecognitionErrorEvent) => {
      let msg = "錯誤";
      if (e.error === "not-allowed") msg = "麥克風被拒絕";
      else if (e.error === "no-speech") msg = "未檢測到聲音";
      else if (e.error === "network") msg = "網絡錯誤";
      setStatus({ text: msg, kind: "err" });
    };

    recognition.onend = () => {
      setInterimText("");
      if (listeningRef.current) {
        try {
          recognition.start();
        } catch {
          /* ignore restart race */
        }
      } else {
        setListening(false);
        setStatus({ text: "已停止", kind: "idle" });
      }
    };

    return recognition;
  }, [scheduleTranslation, showTranslation]);

  const toggleMic = () => {
    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) return;

    if (!listeningRef.current) {
      const recognition = setupRecognition();
      if (!recognition) return;
      recognitionRef.current = recognition;
      listeningRef.current = true;
      try {
        recognition.start();
      } catch {
        listeningRef.current = false;
      }
    } else {
      listeningRef.current = false;
      recognitionRef.current?.stop();
    }
  };

  const clearAll = () => {
    finalTextRef.current = "";
    setFinalText("");
    setInterimText("");
    setTranslation("翻譯將在識別完一句後自動出現");
    setTranslating(false);
  };

  const copyAll = async () => {
    const text = finalText.trim();
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopyLabel("已複製 ✓");
    setTimeout(() => setCopyLabel("複製全文"), 1800);
  };

  const transcript = finalText.trim();
  const hasContent = Boolean(transcript || interimText);

  const handleDownloadTxt = () => {
    if (!transcript) return;
    downloadTranscriptTxt(transcript);
  };

  const handleDownloadWord = () => {
    if (!transcript) return;
    downloadTranscriptWord(transcript);
  };

  const handleDownloadPdf = async () => {
    if (!transcript || pdfBusy) return;
    setPdfBusy(true);
    try {
      await downloadTranscriptPdf(transcript);
    } catch {
      setStatus({ text: "PDF 生成失敗", kind: "err" });
    } finally {
      setPdfBusy(false);
    }
  };

  const onTranslationToggle = (checked: boolean) => {
    setShowTranslation(checked);
    if (checked && finalTextRef.current.trim()) {
      scheduleTranslation(finalTextRef.current);
    }
  };

  const statusClass =
    status.kind === "on"
      ? "jr-status-badge is-on"
      : status.kind === "err"
        ? "jr-status-badge is-err"
        : "jr-status-badge";

  return (
    <div className="jr-root">
      <header className="jr-header">
        <h1>日語聽寫</h1>
        <span className="jr-sub">Real-time Speech Recognition · ja-JP</span>
      </header>

      <div className="jr-layout">
        <aside className="jr-sidebar">
          <span className="jr-sidebar-title">導出轉錄</span>
          <button
            type="button"
            className="jr-download-btn"
            disabled={!transcript}
            onClick={handleDownloadTxt}
          >
            下載 TXT
          </button>
          <button
            type="button"
            className={`jr-download-btn${pdfBusy ? " is-busy" : ""}`}
            disabled={!transcript || pdfBusy}
            onClick={() => void handleDownloadPdf()}
          >
            {pdfBusy ? "生成 PDF…" : "下載 PDF"}
          </button>
          <button
            type="button"
            className="jr-download-btn"
            disabled={!transcript}
            onClick={handleDownloadWord}
          >
            下載 Word
          </button>
          <p className="jr-download-hint">
            導出已確認的日語識別文本；PDF 首次生成需加載渲染库。
          </p>
        </aside>

        <div className="jr-main">
          <div className="jr-controls">
            <button
              type="button"
              className={`jr-btn-mic${listening ? " is-listening" : ""}`}
              disabled={!supported}
              onClick={toggleMic}
            >
              <span className="jr-mic-dot" />
              <span>{listening ? "停止識別" : "開始識別"}</span>
            </button>
            <button type="button" className="jr-btn-clear" onClick={clearAll}>
              清除
            </button>
            <span className={statusClass}>{status.text}</span>
          </div>

          <div className="jr-display-wrap">
            <div className="jr-label-row">
              <span>識別結果 · 日語</span>
              <button type="button" className="jr-btn-copy" onClick={() => void copyAll()}>
                {copyLabel}
              </button>
            </div>
            <div className={`jr-output${listening ? " is-active" : ""}`}>
              {!hasContent && (
                <span className="jr-empty-hint">
                  {supported
                    ? "點擊「開始識別」後，日語將實時顯示在這裡"
                    : "請使用 Chrome 瀏覽器開啟此頁面"}
                </span>
              )}
              {finalText && <span>{finalText}</span>}
              {interimText && <span className="jr-interim">{interimText}</span>}
            </div>
          </div>

          <div className="jr-translation-toggle">
            <label className="jr-switch">
              <input
                type="checkbox"
                checked={showTranslation}
                onChange={(e) => onTranslationToggle(e.target.checked)}
              />
              <span className="jr-slider" />
            </label>
            <label className="jr-toggle-label">顯示中文翻譯</label>
          </div>

          <div
            className={`jr-translation-panel${showTranslation ? " is-visible" : ""}`}
          >
            <div className="jr-label-row">
              <span>中文翻譯</span>
              <span className="jr-translating-hint">
                {translating ? "翻譯中…" : ""}
              </span>
            </div>
            <div className="jr-translation-output">{translation}</div>
          </div>
        </div>
      </div>

      <footer className="jr-footer">
        <span>使用 Web Speech API（Chrome 支持最佳）</span>
        <span>識別語言：日語 ja-JP</span>
      </footer>
    </div>
  );
}
