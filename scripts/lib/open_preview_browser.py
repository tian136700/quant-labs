"""在系统默认浏览器里打开预览 URL：关掉旧预览标签，只留最新一次。

覆盖本地 debug 卡 / 音调样例等预览页，避免 Agent 反复 open 堆一堆标签。
"""
from __future__ import annotations

import subprocess
from urllib.parse import urlparse

# 关掉这些 path 前缀的旧标签（仅本机 127.0.0.1 / localhost）
PREVIEW_PATH_MARKERS = (
    "/debug-jp-vocab-card",
    "/debug-pitch-accent",
)


def _is_local_preview_url(url: str) -> bool:
    try:
        p = urlparse(url)
    except Exception:
        return False
    host = (p.hostname or "").lower()
    if host not in ("127.0.0.1", "localhost"):
        return False
    path = p.path or ""
    return any(path.startswith(m) or m in path for m in PREVIEW_PATH_MARKERS)


def _apple_script_escape(s: str) -> str:
    return s.replace("\\", "\\\\").replace('"', '\\"')


def _close_and_open_chrome(url: str) -> bool:
    markers = ", ".join(f'"{_apple_script_escape(m)}"' for m in PREVIEW_PATH_MARKERS)
    target = _apple_script_escape(url)
    script = f'''
tell application "Google Chrome"
  if not (exists) then
    activate
  end if
  set markerList to {{{markers}}}
  set windowList to every window
  repeat with w in windowList
    try
      set tabCount to count of tabs of w
      set i to tabCount
      repeat while i ≥ 1
        try
          set u to URL of tab i of w
          set shouldClose to false
          repeat with m in markerList
            if u contains m then
              set shouldClose to true
            end if
          end repeat
          if shouldClose then
            close tab i of w
          end if
        end try
        set i to i - 1
      end repeat
    end try
  end repeat
  open location "{target}"
  activate
end tell
'''
    try:
        r = subprocess.run(
            ["osascript", "-e", script],
            capture_output=True,
            text=True,
            timeout=20,
            check=False,
        )
        return r.returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return False


def _close_and_open_safari(url: str) -> bool:
    markers = ", ".join(f'"{_apple_script_escape(m)}"' for m in PREVIEW_PATH_MARKERS)
    target = _apple_script_escape(url)
    script = f'''
tell application "Safari"
  if not (exists) then
    activate
  end if
  set markerList to {{{markers}}}
  set windowList to every window
  repeat with w in windowList
    try
      set tabCount to count of tabs of w
      set i to tabCount
      repeat while i ≥ 1
        try
          set u to URL of tab i of w
          set shouldClose to false
          repeat with m in markerList
            if u contains m then
              set shouldClose to true
            end if
          end repeat
          if shouldClose then
            close tab i of w
          end if
        end try
        set i to i - 1
      end repeat
    end try
  end repeat
  open location "{target}"
  activate
end tell
'''
    try:
        r = subprocess.run(
            ["osascript", "-e", script],
            capture_output=True,
            text=True,
            timeout=20,
            check=False,
        )
        return r.returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return False


def open_preview_url(url: str) -> None:
    """打开预览页：先关旧的本地 debug 预览标签，再打开最新 URL。"""
    url = (url or "").strip()
    if not url:
        return
    if _is_local_preview_url(url):
        if _close_and_open_chrome(url):
            return
        if _close_and_open_safari(url):
            return
    subprocess.run(["open", url], check=False)
