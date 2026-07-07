#!/usr/bin/env python3
"""根据暂存区改动自动生成中文 Git 提交说明。"""

from __future__ import annotations

import json
import os
import re
import subprocess
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MAX_DIFF_CHARS = 12_000
MAX_MESSAGE_LEN = 72


@dataclass
class FileChange:
    path: str
    status: str  # A | M | D | R | ...


def _run_git(*args: str) -> str:
    proc = subprocess.run(
        ["git", *args],
        cwd=ROOT,
        text=True,
        capture_output=True,
    )
    if proc.returncode != 0:
        return ""
    return proc.stdout


def staged_changes() -> list[FileChange]:
    text = _run_git("diff", "--cached", "--name-status")
    changes: list[FileChange] = []
    for line in text.splitlines():
        parts = line.split("\t")
        if len(parts) < 2:
            continue
        status = parts[0].strip()[:1]
        path = parts[-1].strip()
        if path:
            changes.append(FileChange(path=path, status=status))
    return changes


def staged_diff_excerpt() -> str:
    diff = _run_git("diff", "--cached", "-U1", "--no-color")
    if not diff:
        return ""
    if len(diff) > MAX_DIFF_CHARS:
        return diff[:MAX_DIFF_CHARS] + "\n…"
    return diff


def worktree_changes() -> list[FileChange]:
    """暂存 + 未暂存 + 未跟踪，供发布页预览提交说明。"""
    seen: set[str] = set()
    changes: list[FileChange] = []

    def add_from_name_status(text: str) -> None:
        for line in text.splitlines():
            parts = line.split("\t")
            if len(parts) < 2:
                continue
            status = parts[0].strip()[:1]
            path = parts[-1].strip()
            if path and path not in seen:
                seen.add(path)
                changes.append(FileChange(path=path, status=status))

    add_from_name_status(_run_git("diff", "--cached", "--name-status"))
    add_from_name_status(_run_git("diff", "--name-status"))
    for path in _run_git("ls-files", "--others", "--exclude-standard").splitlines():
        path = path.strip()
        if path and path not in seen:
            seen.add(path)
            changes.append(FileChange(path=path, status="A"))
    return changes


def worktree_diff_excerpt() -> str:
    parts = [
        _run_git("diff", "--cached", "-U1", "--no-color"),
        _run_git("diff", "-U1", "--no-color"),
    ]
    diff = "\n".join(part for part in parts if part.strip())
    if not diff:
        return ""
    if len(diff) > MAX_DIFF_CHARS:
        return diff[:MAX_DIFF_CHARS] + "\n…"
    return diff


def _summarize(changes: list[FileChange], diff: str) -> str:
    _load_env_keys()
    ai = _ai_message(changes, diff)
    if ai:
        return ai
    return _heuristic_message(changes, diff)[:MAX_MESSAGE_LEN]


def _basename(path: str) -> str:
    return Path(path).name


def _area_label(path: str) -> str | None:
    rules: list[tuple[str, str]] = [
        (r"jp-lesson.*schedule|JpLessonSchedule|manual-schedule", "日语日程"),
        (r"jp-lesson|JpLesson", "日语新课"),
        (r"jp-vocab|JpVocab", "日语单词"),
        (r"jp-review", "日语复习"),
        (r"en-lesson|EnLesson", "英语新课"),
        (r"en-vocab|EnVocab", "英语单词"),
        (r"admin/jp-lesson-teachers|AdminJpLessonTeachers", "日语老师管理"),
        (r"admin/en-lesson-teachers|AdminEnLessonTeachers", "英语老师管理"),
        (r"admin/users|AdminUsers", "用户管理"),
        (r"admin/rbac|AdminRbac", "权限管理"),
        (r"admin/tool-codes|AdminToolCodes", "工具码管理"),
        (r"admin/trends|AdminTrends", "趋势管理"),
        (r"tool-dot|ToolDot", "在线工具"),
        (r"store-review|StoreReview", "外卖评价"),
        (r"trend-blog|TrendBlog", "趋势博客"),
        (r"compare|Compare", "策略对比"),
        (r"english-teacher-review", "英语老师评价"),
        (r"publish-console", "发布控制台"),
        (r"git-auto-push|git-quick-commit|git_commit_message", "Git 自动提交"),
        (r"gitignore", "Git 忽略规则"),
        (r"schema\.sql|migrate-", "数据库"),
        (r"wrangler\.toml|cloudflare-env", "Cloudflare 配置"),
        (r"mobile\.css|responsive", "响应式样式"),
        (r"package\.json|package-lock", "依赖配置"),
        (r"README", "文档"),
    ]
    for pattern, label in rules:
        if re.search(pattern, path, re.I):
            return label
    if "/api/" in path or path.endswith("route.ts"):
        return "API"
    if path.endswith((".tsx", ".jsx")):
        return "页面"
    if path.endswith((".css",)):
        return "样式"
    if path.endswith((".py",)):
        return "脚本"
    return None


def _action_phrase(changes: list[FileChange], diff: str) -> str:
    statuses = {c.status for c in changes}
    added = sum(1 for c in changes if c.status == "A")
    deleted = sum(1 for c in changes if c.status == "D")
    modified = sum(1 for c in changes if c.status == "M")

    joined = " ".join(c.path for c in changes) + "\n" + diff

    hints: list[tuple[str, str]] = [
        (r"manual.schedule|手动日程|jp_lesson_manual_schedule", "手动日程服务端持久化"),
        (r"publish-console|发布控制台", "本地发布控制台"),
        (r"CLOUDFLARE_API_TOKEN|deploy|部署", "部署流程"),
        (r"gitignore|\.history|remote-d1-snapshot", "清理不应公开的文件"),
        (r"mobile\.css|@media", "移动端适配"),
        (r"CREATE TABLE|migrate-", "数据库迁移"),
        (r"teacher|老师", "老师相关"),
        (r"schedule|日程", "日程相关"),
        (r"auth|login|登录", "登录鉴权"),
        (r"upload|上传", "上传功能"),
        (r"fix|修复|bug", "问题修复"),
        (r"refactor|重构", "代码重构"),
    ]
    for pattern, phrase in hints:
        if re.search(pattern, joined, re.I):
            return phrase

    if added and not modified and not deleted:
        if added == 1:
            return f"新增 {_basename(changes[0].path)}"
        return f"新增 {added} 个文件"
    if deleted and not modified and not added:
        return f"删除 {deleted} 个文件"
    if modified == 1 and added == 0 and deleted == 0:
        return f"更新 {_basename(changes[0].path)}"
    if "A" in statuses and "M" in statuses:
        return "功能更新"
    if modified:
        return f"更新 {modified} 个文件"
    return "代码更新"


def _heuristic_message(changes: list[FileChange], diff: str) -> str:
    if not changes:
        return "代码更新"

    areas: list[str] = []
    for change in changes:
        label = _area_label(change.path)
        if label and label not in areas:
            areas.append(label)

    action = _action_phrase(changes, diff)

    if not areas:
        return action
    if len(areas) == 1:
        return f"{areas[0]}：{action}"
    primary = areas[0]
    if len(areas) <= 3:
        return f"{primary}等：{action}"
    return f"{primary}等 {len(areas)} 处：{action}"


def _load_env_keys() -> None:
    for name in (".env.local", ".env.deploy.local"):
        path = ROOT / name
        if not path.is_file():
            continue
        for raw in path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and value and key not in os.environ:
                os.environ[key] = value


def _ai_message(changes: list[FileChange], diff: str) -> str | None:
    if os.environ.get("GIT_COMMIT_AI", "1").strip().lower() in ("0", "false", "no"):
        return None

    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        return None

    files = "\n".join(f"- [{c.status}] {c.path}" for c in changes[:40])
    if len(changes) > 40:
        files += f"\n- … 共 {len(changes)} 个文件"

    prompt = (
        "你是 Git 提交说明助手。根据下面改动，写一条简洁的中文 commit message。\n"
        "要求：一行、不超过 50 个汉字、不用引号、不要句号、说明「做了什么」而非文件名列表。\n\n"
        f"文件：\n{files}\n\n"
        f"diff 摘要：\n{diff or '（无 diff）'}"
    )

    body = json.dumps(
        {
            "model": os.environ.get("GIT_COMMIT_AI_MODEL", "gpt-4o-mini"),
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": 80,
            "temperature": 0.2,
        },
        ensure_ascii=False,
    ).encode("utf-8")

    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        content = payload["choices"][0]["message"]["content"].strip()
        content = content.strip('"\'「」')
        content = re.sub(r"\s+", " ", content)
        if content:
            return content[:MAX_MESSAGE_LEN]
    except (urllib.error.URLError, KeyError, IndexError, json.JSONDecodeError, TimeoutError):
        return None
    return None


def summarize_commit_message(paths: list[str] | None = None) -> str:
    """生成提交说明：优先 AI（若配置了 OPENAI_API_KEY），否则启发式分析 diff。"""
    changes = staged_changes()
    if not changes and paths:
        changes = [FileChange(path=p, status="M") for p in paths if p]
    return _summarize(changes, staged_diff_excerpt())


def summarize_worktree_commit_message() -> str:
    """根据工作区全部待提交改动生成说明（发布页预览用）。"""
    changes = worktree_changes()
    if not changes:
        return "代码更新"
    return _summarize(changes, worktree_diff_excerpt())


if __name__ == "__main__":
    print(summarize_commit_message())
