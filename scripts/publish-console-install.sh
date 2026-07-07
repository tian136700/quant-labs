#!/usr/bin/env bash
# 安装 launchd：开机自启本地发布控制台（默认 http://127.0.0.1:17823/）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="com.infoquests.publish-console"
PLIST_DST="$HOME/Library/LaunchAgents/${LABEL}.plist"
SCRIPT="$ROOT/scripts/publish-console-watch.py"
LOG="$HOME/Library/Logs/publish-console.log"
PYTHON="$(command -v python3)"
PORT="${PUBLISH_CONSOLE_PORT:-17823}"
NPM_BIN="$(dirname "$(command -v npm 2>/dev/null || echo /usr/local/bin/npm)")"
PATH_PREFIX="/usr/local/bin:/opt/homebrew/bin:${NPM_BIN}:/usr/bin:/bin"

chmod +x "$SCRIPT" "$ROOT/scripts/publish-console.py"

mkdir -p "$HOME/Library/Logs"

cat > "$PLIST_DST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${PYTHON}</string>
    <string>${SCRIPT}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${ROOT}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${PATH_PREFIX}</string>
    <key>PUBLISH_CONSOLE_PORT</key>
    <string>${PORT}</string>
    <key>PUBLISH_CONSOLE_HOST</key>
    <string>127.0.0.1</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${LOG}</string>
  <key>StandardErrorPath</key>
  <string>${LOG}</string>
</dict>
</plist>
EOF

launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || \
  launchctl unload "$PLIST_DST" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST_DST"
launchctl enable "gui/$(id -u)/${LABEL}" 2>/dev/null || true

echo "[publish-console] 已安装开机自启"
echo "[publish-console] 地址: http://127.0.0.1:${PORT}/"
echo "[publish-console] 日志: ${LOG}"
echo "[publish-console] 手动前台运行: npm run publish:console"
echo "[publish-console] 卸载: npm run publish:console:uninstall"
