"use client";

import { SITE_URL } from "@/lib/site";

/** 英语新课页底部 API 上传说明（从编排页抽出控行数） */
export function EnLessonApiUploadHelp() {
  return (
    <details style={{ marginTop: "1.5rem", color: "var(--muted)", fontSize: "0.875rem" }}>
      <summary style={{ cursor: "pointer", marginBottom: "0.5rem" }}>API 上传说明</summary>
      <p style={{ marginTop: "0.5rem" }}>
        固定链接：<code>{SITE_URL}/en-lesson</code>
      </p>
      <p>
        网页「新增」：登录后点标题旁按钮，走{" "}
        <code>POST /api/en-lesson/create</code>（会话鉴权）。说明见{" "}
        <code>docs/en-lesson-create-api.txt</code>。
      </p>
      <p>
        脚本上传接口：<code>POST /api/en-lesson/upload</code>，Header{" "}
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
{`curl -X POST "${SITE_URL}/api/en-lesson/upload" \\
  -H "Authorization: Bearer <TOKEN>" \\
  -F "kind=grammar" \\
  -F "content=～ばかり, ～ようになる, ～に来る" \\
  -F "media_type=image" \\
  -F "file=@lesson02.png"`}
      </pre>
      <p>
        <code>content</code> 中多个单词/语法用英文或中文逗号分隔。
        相同学习类型与内容已存在时将返回 <code>content_duplicate</code>（HTTP 409）。
        上传带 <code>file</code> 时，系统会自动生成教案标识（如 <code>lesson-4</code>）并绑定到该条新课，无需传 <code>ref_key</code>。
        上传后默认「未完成」；改为「上课完」后会同步写入
        英语单词抽问并带上教案链接。
      </p>
    </details>
  );
}
