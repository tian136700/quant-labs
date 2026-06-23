#!/usr/bin/env python3
"""Parse AI-generated trend blog Markdown into publish API fields."""

from __future__ import annotations

import html
import re
from typing import TypedDict


class ParsedTrendBlogMarkdown(TypedDict):
    meta_description: str
    headline: str
    content_html: str


_META_RE = re.compile(r"^\s*<!--\s*meta:\s*(.+?)\s*-->\s*$", re.IGNORECASE)
_H1_RE = re.compile(r"^#\s+(.+)$")
_H2_RE = re.compile(r"^##\s+(.+)$")
_H3_RE = re.compile(r"^###\s+(.+)$")
_HR_RE = re.compile(r"^---+\s*$")
_UL_RE = re.compile(r"^-\s+(.+)$")


def _inline_md(text: str) -> str:
    escaped = html.escape(text, quote=False)
    escaped = re.sub(r"`([^`]+)`", r"<code>\1</code>", escaped)
    escaped = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", escaped)

    def link_repl(match: re.Match[str]) -> str:
        label = match.group(1)
        href = html.escape(match.group(2), quote=True)
        return (
            f'<a href="{href}" target="_blank" rel="noopener noreferrer">'
            f"{label}</a>"
        )

    return re.sub(r"\[([^\]]+)\]\(([^)]+)\)", link_repl, escaped)


def markdown_body_to_html(body: str) -> str:
    lines = body.splitlines()
    out: list[str] = []
    i = 0

    while i < len(lines):
        line = lines[i].rstrip()

        if not line.strip():
            i += 1
            continue

        if _HR_RE.match(line):
            out.append("<hr />")
            i += 1
            continue

        if line.startswith("```"):
            fence = line.strip()
            i += 1
            code_lines: list[str] = []
            while i < len(lines) and not lines[i].strip().startswith("```"):
                code_lines.append(lines[i])
                i += 1
            if i < len(lines):
                i += 1
            code = html.escape("\n".join(code_lines).strip("\n"))
            out.append(f"<pre><code>{code}</code></pre>")
            continue

        h3 = _H3_RE.match(line)
        if h3:
            out.append(f"<h3>{_inline_md(h3.group(1).strip())}</h3>")
            i += 1
            continue

        h2 = _H2_RE.match(line)
        if h2:
            out.append(f"<h2>{_inline_md(h2.group(1).strip())}</h2>")
            i += 1
            continue

        if _UL_RE.match(line):
            items: list[str] = []
            while i < len(lines):
                item = _UL_RE.match(lines[i].rstrip())
                if not item:
                    break
                items.append(f"<li>{_inline_md(item.group(1).strip())}</li>")
                i += 1
            out.append("<ul>" + "".join(items) + "</ul>")
            continue

        para_lines = [line.strip()]
        i += 1
        while i < len(lines):
            nxt = lines[i].rstrip()
            if (
                not nxt.strip()
                or nxt.startswith("#")
                or nxt.startswith("```")
                or _UL_RE.match(nxt)
                or _HR_RE.match(nxt)
            ):
                break
            para_lines.append(nxt.strip())
            i += 1
        out.append(f"<p>{_inline_md(' '.join(para_lines))}</p>")

    return "\n".join(out)


def parse_trend_blog_markdown(text: str) -> ParsedTrendBlogMarkdown:
    raw = text.strip()
    if not raw:
        raise ValueError("markdown content is empty")

    meta_description = ""
    lines = raw.splitlines()
    idx = 0

    while idx < len(lines) and not lines[idx].strip():
        idx += 1

    meta_match = _META_RE.match(lines[idx]) if idx < len(lines) else None
    if meta_match:
        meta_description = meta_match.group(1).strip()
        idx += 1

    while idx < len(lines) and not lines[idx].strip():
        idx += 1

    headline = ""
    if idx < len(lines):
        h1 = _H1_RE.match(lines[idx].strip())
        if h1:
            headline = h1.group(1).strip()
            idx += 1

    if not headline:
        raise ValueError("markdown must include an H1 title (# ...)")

    body = "\n".join(lines[idx:]).strip()
    content_html = markdown_body_to_html(body)
    if not content_html:
        raise ValueError("markdown body is empty after title")

    return {
        "meta_description": meta_description,
        "headline": headline,
        "content_html": content_html,
    }
