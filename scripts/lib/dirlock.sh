#!/bin/bash
# mkdir 目录锁：写入 pid，退出自动释放；持有者已死或超时则自动回收，避免永久 skip。
#
# 用法：
#   # shellcheck source=scripts/lib/dirlock.sh
#   source "$ROOT/scripts/lib/dirlock.sh"
#   dirlock_acquire "$LOCK_DIR" "fill-reading" 1800
#   # 拿到锁后继续业务；进程退出时自动清理

dirlock_mtime() {
  local path="$1"
  # launchd 下 PATH 可能很短，用绝对路径
  if /usr/bin/stat -f %m "$path" >/dev/null 2>&1; then
    /usr/bin/stat -f %m "$path"
  else
    /usr/bin/stat -c %Y "$path"
  fi
}

dirlock_age_seconds() {
  local path="$1"
  local mtime now
  mtime="$(dirlock_mtime "$path")"
  now="$(/bin/date +%s)"
  echo $((now - mtime))
}

dirlock_pid_alive() {
  local pid="${1:-}"
  [[ "$pid" =~ ^[0-9]+$ ]] || return 1
  /bin/kill -0 "$pid" 2>/dev/null
}

# 若锁可安全回收则删除并返回 0，否则返回 1（仍被占用）
dirlock_try_reclaim() {
  local lock_dir="$1"
  local label="$2"
  local stale_seconds="$3"
  local pid_file="${lock_dir}/pid"
  local age reason="" pid=""

  if [[ ! -d "$lock_dir" ]]; then
    return 0
  fi

  age="$(dirlock_age_seconds "$lock_dir")"
  if [[ -f "$pid_file" ]]; then
    pid="$(tr -d '[:space:]' <"$pid_file" 2>/dev/null || true)"
    if [[ -n "$pid" ]] && dirlock_pid_alive "$pid"; then
      if [[ "$age" -ge "$stale_seconds" ]]; then
        reason="pid=${pid} alive but lock age ${age}s >= stale ${stale_seconds}s"
      else
        echo "$(/bin/date '+%F %T') ${label}: already running (pid=${pid}, age=${age}s), skip"
        return 1
      fi
    else
      reason="holder pid ${pid:-missing} not running (age=${age}s)"
    fi
  else
    if [[ "$age" -ge "$stale_seconds" ]]; then
      reason="no pid file, lock age ${age}s >= stale ${stale_seconds}s"
    else
      echo "$(/bin/date '+%F %T') ${label}: already running (no pid, age=${age}s < stale ${stale_seconds}s), skip"
      return 1
    fi
  fi

  echo "$(/bin/date '+%F %T') ${label}: reclaiming stale lock (${reason})" >&2
  /bin/rm -f "${lock_dir}/pid" "${lock_dir}/started_at" 2>/dev/null || true
  /bin/rmdir "$lock_dir" 2>/dev/null || /bin/rm -rf "$lock_dir"
  return 0
}

dirlock_acquire() {
  local lock_dir="$1"
  local label="$2"
  local stale_seconds="${3:-1800}"

  if ! [[ "$stale_seconds" =~ ^[0-9]+$ ]] || [[ "$stale_seconds" -le 0 ]]; then
    stale_seconds=1800
  fi

  if /bin/mkdir "$lock_dir" 2>/dev/null; then
    :
  else
    if ! dirlock_try_reclaim "$lock_dir" "$label" "$stale_seconds"; then
      exit 0
    fi
    if ! /bin/mkdir "$lock_dir" 2>/dev/null; then
      echo "$(/bin/date '+%F %T') ${label}: lock race after reclaim, skip"
      exit 0
    fi
  fi

  echo $$ >"${lock_dir}/pid"
  /bin/date +%s >"${lock_dir}/started_at"

  # 必须在设置 trap 时展开路径：函数返回后 local 变量不可用
  # shellcheck disable=SC2064
  trap "/bin/rm -f '${lock_dir}/pid' '${lock_dir}/started_at' 2>/dev/null || true; /bin/rmdir '${lock_dir}' 2>/dev/null || true" EXIT
}

# 若 last_success 过旧则告警（不中断）
dirlock_warn_if_success_stale() {
  local state_file="$1"
  local label="$2"
  local max_age_seconds="${3:-7200}"
  local age

  if [[ ! -f "$state_file" ]]; then
    echo "$(/bin/date '+%F %T') ${label}: WARNING no last_success file yet (${state_file})" >&2
    return 0
  fi
  age="$(dirlock_age_seconds "$state_file")"
  if [[ "$age" -ge "$max_age_seconds" ]]; then
    echo "$(/bin/date '+%F %T') ${label}: WARNING last_success is ${age}s old (>= ${max_age_seconds}s)" >&2
  fi
}
