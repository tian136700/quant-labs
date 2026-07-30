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
          上传接口：<code>POST /api/jp-lesson/upload</code>（单词或语法二选一）；同一课单词+语法一次上传用{" "}
          <code>POST /api/jp-lesson/upload-mixed</code>（列表仍分两条，教材列显示如「标日23课」；说明见{" "}
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
  -F "course_label=标日23课" \\
  -F "word_content=東, 西, 南, 北" \\
  -F "word_meanings=东|西|南|北" \\
  -F "word_annotations=口语常用|考试常用|口语考试都常用|口语常用" \\
  -F "grammar_content=～によると, ～について" \\
  -F "grammar_meanings=据……说|关于……" \\
  -F "grammar_annotations=考试常用|口语考试都常用" \\
  -F "word_media_type=image" \\
  -F "word_file=@lesson23-words.png" \\
  -F "grammar_media_type=image" \\
  -F "grammar_file=@lesson23-grammar.png"`}
        </pre>
        <p>
          <code>content</code> 中多个单词/语法用英文或中文逗号分隔；可选 <code>meanings</code> 与
          <code>content</code> 各项一一对应，多项释义用竖线 <code>|</code> 分隔（释义内可含逗号）。
          可选 <code>annotations</code>（合传为 <code>word_annotations</code> /{" "}
          <code>grammar_annotations</code>）同样用 <code>|</code> 对齐，每项只能是：口语常用、考试常用、口语考试都常用。
          强烈建议同时传可选 <code>example_sentences</code>：与 <code>content</code> 各项一一对应，多项之间用{" "}
          <code>|||</code> 分隔；每一项里写若干「日语句 + 下一行 <code>译文：…</code>」（也可写{" "}
          <code>1. …</code> 序号，入库时会规范化）。每个单词/语法最多 10 条例句，条数由上传方自定。
          合传接口必填 <code>course_label</code>（如「标日23课」，列表「教材」列展示）+{" "}
          <code>word_content</code> / <code>grammar_content</code>（及对应 meanings /
          annotations / example_sentences）；教案推荐 <code>word_file</code> /{" "}
          <code>grammar_file</code> 分开传。上传后列表出现两条（类型仍是单词 / 语法），共享同一教材名；
          各自改为「已完成」后分别写入日语抽问。
        </p>
      </details>
  );
}
