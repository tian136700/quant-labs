"use client";

import { JP_SITE_URL } from "@/lib/jp-site-host";

export function JpLessonApiUploadDocs() {
  return (
      <details style={{ marginTop: "1.5rem", color: "var(--muted)", fontSize: "0.875rem" }}>
        <summary style={{ cursor: "pointer", marginBottom: "0.5rem" }}>API 上传说明</summary>
        <p style={{ marginTop: "0.5rem" }}>
          固定链接：<code>{JP_SITE_URL}/jp-lesson</code>
        </p>
        <p>
          上传接口：<code>POST /api/jp-lesson/upload</code>（单词或语法二选一）；同课单词+语法用{" "}
          <code>POST /api/jp-lesson/upload-mixed</code>（类型显示「单词加语法」；说明见{" "}
          <code>docs/jp-lesson-upload-mixed-api.txt</code>）。Header{" "}
          <code>Authorization: Bearer &lt;JP_REVIEW_UPLOAD_TOKEN&gt;</code>
        </p>
        <pre
          style={{
            overflow: "auto",
            padding: "0.75rem",
            background: "var(--panel)",
            borderRadius: "6px",
            border: "1px solid var(--border)",
            fontSize: "0.8125rem",
          }}
        >
{`curl -X POST "${JP_SITE_URL}/api/jp-lesson/upload" \\
  -H "Authorization: Bearer <TOKEN>" \\
  -F "kind=grammar" \\
  -F "content=～ばかり, ～ようになる, ～に来る" \\
  -F "meanings=（刚刚，只是……）|（变得能够……）|（来……做……）" \\
  -F "example_sentences=遊んでばかりいます。
译文：光在玩。
今来たばかりです。
译文：刚来。|||日本語が話せるようになりました。
译文：已经会说日语了。
毎日早く起きるようになりました。
译文：开始每天早起了。|||ご飯を食べに来ます。
译文：来吃饭。
買い物に来ました。
译文：来买东西了。" \\
  -F "media_type=image" \\
  -F "file=@lesson02.png"`}
        </pre>
        <p style={{ marginTop: "0.75rem" }}>同课单词+语法合传示例：</p>
        <pre
          style={{
            overflow: "auto",
            padding: "0.75rem",
            background: "var(--panel)",
            borderRadius: "6px",
            border: "1px solid var(--border)",
            fontSize: "0.8125rem",
          }}
        >
{`curl -X POST "${JP_SITE_URL}/api/jp-lesson/upload-mixed" \\
  -H "Authorization: Bearer <TOKEN>" \\
  -F "title=标日第23课" \\
  -F "word_content=東, 西, 南, 北" \\
  -F "word_meanings=东|西|南|北" \\
  -F "grammar_content=～によると, ～について" \\
  -F "grammar_meanings=据……说|关于……" \\
  -F "media_type=image" \\
  -F "file=@lesson23.png"`}
        </pre>
        <p>
          <code>content</code> 中多个单词/语法用英文或中文逗号分隔；可选 <code>meanings</code> 与
          <code>content</code> 各项一一对应，多项释义用竖线 <code>|</code> 分隔（释义内可含逗号）。
          强烈建议同时传可选 <code>example_sentences</code>：与 <code>content</code> 各项一一对应，多项之间用{" "}
          <code>|||</code> 分隔；每一项里写若干「日语句 + 下一行 <code>译文：…</code>」（也可写{" "}
          <code>1. …</code> 序号，入库时会规范化）。每个单词/语法最多 10 条例句，条数由上传方自定。
          合传接口用 <code>word_content</code> / <code>grammar_content</code>（及对应 meanings /
          example_sentences）分别传两侧；上传带 <code>file</code> 时，系统会自动生成教案标识（如{" "}
          <code>lesson-4</code>）并绑定到该条新课，无需传 <code>ref_key</code>。
          上传后默认「未完成」；在列表中改为「已完成」后，会同步写入
          日语单词抽问并带上教案链接、释义与例句（合传课：单词与语法分别按类型入库）。
        </p>
      </details>
  );
}
