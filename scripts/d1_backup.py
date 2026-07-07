#!/usr/bin/env python3
"""Cloudflare D1 备份：发布或迁移前自动导出表数据到 tmp/d1-backups/（不提交 Git）。"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Callable

ROOT = Path(__file__).resolve().parents[1]
DB = "strategy-compare-db"
BACKUP_ROOT = ROOT / "tmp" / "d1-backups"
DEPLOY_ENV_FILE = ROOT / ".env.deploy.local"
ANSI_ESCAPE_RE = re.compile(r"\x1b\[[0-9;]*m")
# 备份优先用 wrangler login（OAuth）；.env.deploy.local 里的 API Token 常无 D1 权限导致 7403
CF_AUTH_ENV_KEYS = (
    "CLOUDFLARE_API_TOKEN",
    "CLOUDFLARE_API_KEY",
    "CLOUDFLARE_ACCOUNT_ID",
)

MUTATING_SQL_RE = re.compile(
    r"\b(?:UPDATE|DELETE\s+FROM|ALTER\s+TABLE|DROP\s+(?:TABLE|INDEX)|TRUNCATE)\s+[`\"']?([a-zA-Z_][a-zA-Z0-9_]*)",
    re.I,
)
CREATE_TABLE_RE = re.compile(
    r"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`\"']?([a-zA-Z_][a-zA-Z0-9_]*)",
    re.I,
)
RISKY_PATH_RES = (
    re.compile(r"^scripts/migrate-.*\.(py|sql)$"),
    re.compile(r"^src/lib/.*-db\.ts$"),
    re.compile(r"^src/app/api/.+/route\.ts$"),
)
# 本项目 D1 表均为 snake_case；过滤 from __future__ 等误匹配
TABLE_NAME_RE = re.compile(r"^[a-z][a-z0-9_]*$")
TABLE_NAME_BLOCKLIST = frozenset(
    {
        "if",
        "not",
        "exists",
        "set",
        "select",
        "values",
        "from",
        "into",
        "table",
        "join",
        "where",
        "null",
        "true",
        "false",
        "d1_backup",
        "ensure_remote_backup",
        "maybe_backup_before_deploy",
    }
)


def now_stamp() -> str:
    return datetime.now().strftime("%Y%m%d-%H%M%S")


def strip_ansi(text: str) -> str:
    return ANSI_ESCAPE_RE.sub("", text).strip()


def load_deploy_env() -> None:
    """加载 .env.deploy.local 到当前进程环境（部署脚本用）。"""
    if not DEPLOY_ENV_FILE.is_file():
        return
    for raw in DEPLOY_ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and value and key not in os.environ:
            os.environ[key] = value


def deploy_env_dict() -> dict[str, str]:
    """合并 .env.deploy.local（覆盖同名变量），供 wrangler 子进程使用。"""
    env = os.environ.copy()
    if not DEPLOY_ENV_FILE.is_file():
        return env
    for raw in DEPLOY_ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and value:
            env[key] = value
    return env


def wrangler_subprocess_env(*, remote: bool, prefer_oauth: bool) -> dict[str, str]:
    env = os.environ.copy()
    if remote and prefer_oauth:
        for key in CF_AUTH_ENV_KEYS:
            env.pop(key, None)
    return env


def is_wrangler_auth_error(text: str) -> bool:
    lower = strip_ansi(text).lower()
    return (
        "authentication error" in lower
        or "not authorized" in lower
        or "code: 10000" in lower
        or "code: 7403" in lower
    )


def ensure_wrangler_env(remote: bool) -> None:
    return


def log_line(log_fn: Callable[[str], None] | None, text: str) -> None:
    print(text, flush=True)
    if log_fn:
        log_fn(text)


def run_wrangler(
    remote: bool,
    *,
    command: str | None = None,
    output: Path | None = None,
    prefer_oauth: bool = True,
    log_fn: Callable[[str], None] | None = None,
) -> subprocess.CompletedProcess[str]:
    cmd = ["npx", "wrangler", "d1"]
    if output is not None:
        cmd.extend(["export", DB, "--output", str(output)])
        if remote:
            cmd.append("--remote")
    else:
        cmd.extend(["execute", DB, "--command", command or "", "-y"])
        if remote:
            cmd.append("--remote")
        else:
            cmd.append("--local")

    attempts: list[tuple[str, dict[str, str]]] = []
    if remote and prefer_oauth:
        attempts.append(
            ("wrangler login (OAuth)", wrangler_subprocess_env(remote=True, prefer_oauth=True))
        )
    attempts.append(("API Token / .env.deploy.local", deploy_env_dict()))

    last_proc: subprocess.CompletedProcess[str] | None = None
    for label, env in attempts:
        if remote and len(attempts) > 1:
            log_line(log_fn, f"[d1-backup] 尝试凭据: {label}")
        proc = subprocess.run(cmd, cwd=ROOT, text=True, capture_output=True, env=env)
        last_proc = proc
        if proc.returncode == 0:
            return proc
        err_text = proc.stderr or proc.stdout or ""
        if not is_wrangler_auth_error(err_text):
            return proc

    assert last_proc is not None
    return last_proc


def parse_wrangler_json(stdout: str) -> list[dict]:
    start = stdout.find("[")
    if start < 0:
        return []
    payload = json.loads(stdout[start:])
    if not isinstance(payload, list) or not payload:
        return []
    results = payload[0].get("results")
    return results if isinstance(results, list) else []


def query_table(
    remote: bool,
    table: str,
    log_fn: Callable[[str], None] | None = None,
) -> list[dict]:
    safe_table = validate_table_name(table)
    proc = run_wrangler(remote, command=f"SELECT * FROM {safe_table};", log_fn=log_fn)
    if proc.returncode != 0:
        err = format_wrangler_error(proc.stderr.strip() or proc.stdout.strip() or "wrangler failed")
        raise RuntimeError(f"备份 {safe_table} 失败: {err}")
    return parse_wrangler_json(proc.stdout)


def is_auth_runtime_error(exc: BaseException) -> bool:
    return is_wrangler_auth_error(str(exc))


def list_remote_tables(remote: bool) -> list[str]:
    proc = run_wrangler(
        remote,
        command=(
            "SELECT name FROM sqlite_master "
            "WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' "
            "ORDER BY name;"
        ),
    )
    if proc.returncode != 0:
        err = format_wrangler_error(proc.stderr.strip() or proc.stdout.strip() or "wrangler failed")
        raise RuntimeError(f"读取表列表失败: {err}")
    rows = parse_wrangler_json(proc.stdout)
    return [str(row["name"]) for row in rows if row.get("name")]


def try_full_export(
    remote: bool,
    target: Path,
    log_fn: Callable[[str], None] | None,
) -> bool:
    full_path = target / "full-remote.sql"
    log_line(log_fn, f"[d1-backup] 尝试全库导出 → {full_path.name}")
    proc = run_wrangler(remote, output=full_path)
    if proc.returncode == 0 and full_path.is_file() and full_path.stat().st_size > 0:
        return True
    err = strip_ansi(proc.stderr.strip() or proc.stdout.strip() or "export failed")
    log_line(log_fn, f"[d1-backup] 全库导出跳过（{err}），改按表 SELECT 备份")
    full_path.unlink(missing_ok=True)
    return False


def format_wrangler_error(err: str) -> str:
    err = strip_ansi(err)
    lower = err.lower()
    if "authentication error" in lower or "not authorized" in lower or "code: 10000" in lower or "code: 7403" in lower:
        return (
            f"{err}\n"
            "提示：D1 备份需要 Cloudflare 账号对 D1 的读权限。"
            "请在本机终端执行 npx wrangler login；"
            "或在 .env.deploy.local 填入带 D1 权限的 CLOUDFLARE_API_TOKEN"
            "（模板：Edit Cloudflare Workers，含 D1）。"
            "发布控制台若凭据不可用会跳过备份并继续发布。"
        )
    return err


def validate_table_name(table: str) -> str:
    if not is_plausible_table_name(table):
        raise ValueError(f"非法表名: {table}")
    return table


def sql_literal(value: object) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float)):
        return str(value)
    text = str(value).replace("'", "''")
    return f"'{text}'"


def rows_to_insert_sql(table: str, rows: list[dict]) -> str:
    safe_table = validate_table_name(table)
    if not rows:
        return f"-- {safe_table}: 0 rows\n"
    columns = list(rows[0].keys())
    col_sql = ", ".join(columns)
    lines = [f"-- {safe_table}: {len(rows)} row(s)", f"DELETE FROM {safe_table};"]
    for row in rows:
        vals = ", ".join(sql_literal(row.get(col)) for col in columns)
        lines.append(f"INSERT INTO {safe_table} ({col_sql}) VALUES ({vals});")
    return "\n".join(lines) + "\n"


def is_plausible_table_name(name: str) -> bool:
    if not name or name.lower() in TABLE_NAME_BLOCKLIST:
        return False
    if "__" in name or name.startswith("_"):
        return False
    return bool(TABLE_NAME_RE.fullmatch(name))


def extract_tables_from_text(text: str, *, source_path: str = "") -> set[str]:
    """从源码提取 D1 表名。Python 迁移脚本不用 FROM/INTO，避免误匹配 import。"""
    patterns: list[re.Pattern[str]] = [MUTATING_SQL_RE, CREATE_TABLE_RE]
    if source_path.endswith((".sql", ".ts")):
        patterns.append(
            re.compile(
                r"\b(?:FROM|INTO|JOIN)\s+[`\"']?([a-zA-Z_][a-zA-Z0-9_]*)",
                re.I,
            )
        )
    tables: set[str] = set()
    for pattern in patterns:
        for match in pattern.finditer(text):
            name = match.group(1)
            if is_plausible_table_name(name):
                tables.add(name)
    return tables


def is_risky_path(path: str) -> bool:
    return any(pattern.search(path) for pattern in RISKY_PATH_RES)


def read_repo_file(path: str) -> str:
    file_path = ROOT / path
    if not file_path.is_file():
        return ""
    try:
        return file_path.read_text(encoding="utf-8")
    except OSError:
        return ""


@dataclass
class MutationScan:
    risky_files: list[str] = field(default_factory=list)
    tables: set[str] = field(default_factory=set)

    @property
    def has_risk(self) -> bool:
        return bool(self.risky_files)


def scan_db_mutation_risk(changed_paths: list[str]) -> MutationScan:
    scan = MutationScan()
    for path in changed_paths:
        if not is_risky_path(path):
            continue
        scan.risky_files.append(path)
        scan.tables.update(extract_tables_from_text(read_repo_file(path), source_path=path))
    return scan


@dataclass
class BackupResult:
    backup_dir: Path
    reason: str
    tables: list[str]
    row_counts: dict[str, int]
    full_export: bool
    risky_files: list[str]

    def summary(self) -> str:
        if self.full_export:
            base = f"全库 + {len(self.tables)} 张表"
        else:
            base = f"{len(self.tables)} 张表"
        counts = ", ".join(f"{t}={self.row_counts.get(t, 0)}" for t in self.tables[:6])
        extra = f" …共 {len(self.tables)} 表" if len(self.tables) > 6 else ""
        return f"{base}（{counts}{extra}）→ {self.backup_dir.relative_to(ROOT)}"


def backup_tables(
    remote: bool,
    tables: set[str],
    *,
    reason: str,
    risky_files: list[str] | None = None,
    full_if_empty: bool = True,
    log_fn: Callable[[str], None] | None = None,
) -> BackupResult:
    ensure_wrangler_env(remote)
    target = BACKUP_ROOT / f"{now_stamp()}-{reason}"
    target.mkdir(parents=True, exist_ok=True)

    table_list = sorted(tables)
    full_export = False

    if full_if_empty and not table_list:
        full_export = try_full_export(remote, target, log_fn)
        if not full_export:
            table_list = list_remote_tables(remote)
            log_line(log_fn, f"[d1-backup] 将按表备份 {len(table_list)} 张表")

    if not table_list and full_export:
        manifest = {
            "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "reason": reason,
            "remote": remote,
            "database": DB,
            "risky_files": risky_files or [],
            "tables": [],
            "row_counts": {},
            "full_export": True,
            "restore_hint": "全库恢复: wrangler d1 execute strategy-compare-db --remote --file=tmp/d1-backups/<dir>/full-remote.sql -y",
        }
        (target / "manifest.json").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        result = BackupResult(
            backup_dir=target,
            reason=reason,
            tables=[],
            row_counts={},
            full_export=True,
            risky_files=risky_files or [],
        )
        log_line(log_fn, f"[d1-backup] 完成: 全库 → {target.relative_to(ROOT)}")
        return result

    row_counts: dict[str, int] = {}
    for table in table_list:
        log_line(log_fn, f"[d1-backup] 导出表 {table} …")
        rows = query_table(remote, table, log_fn=log_fn)
        row_counts[table] = len(rows)
        (target / f"{table}.json").write_text(
            json.dumps(rows, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        (target / f"{table}.sql").write_text(rows_to_insert_sql(table, rows), encoding="utf-8")

    manifest = {
        "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "reason": reason,
        "remote": remote,
        "database": DB,
        "risky_files": risky_files or [],
        "tables": table_list,
        "row_counts": row_counts,
        "full_export": full_export,
        "restore_hint": "按表恢复: wrangler d1 execute strategy-compare-db --remote --file=tmp/d1-backups/<dir>/<table>.sql -y",
    }
    (target / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    result = BackupResult(
        backup_dir=target,
        reason=reason,
        tables=table_list,
        row_counts=row_counts,
        full_export=full_export,
        risky_files=risky_files or [],
    )
    log_line(log_fn, f"[d1-backup] 完成: {result.summary()}")
    return result


def maybe_backup_before_deploy(
    changed_paths: list[str],
    *,
    remote: bool = True,
    log_fn: Callable[[str], None] | None = None,
    auth_failure_mode: str = "abort",
) -> BackupResult | None:
    scan = scan_db_mutation_risk(changed_paths)
    if not scan.has_risk:
        log_line(log_fn, "[d1-backup] 未检测到数据库更新/删除相关改动，跳过备份")
        return None
    log_line(
        log_fn,
        f"[d1-backup] 检测到 {len(scan.risky_files)} 个可能改动数据库的文件，发布前先备份…",
    )
    for path in scan.risky_files[:8]:
        log_line(log_fn, f"[d1-backup]   · {path}")
    if len(scan.risky_files) > 8:
        log_line(log_fn, f"[d1-backup]   · …另有 {len(scan.risky_files) - 8} 个文件")
    try:
        return backup_tables(
            remote,
            scan.tables,
            reason="pre-publish",
            risky_files=scan.risky_files,
            log_fn=log_fn,
        )
    except RuntimeError as exc:
        if auth_failure_mode != "warn_skip" or not is_auth_runtime_error(exc):
            raise
        log_line(
            log_fn,
            "[d1-backup] ⚠ 线上备份因 Cloudflare 凭据不可用而跳过，继续发布。"
            "请在终端执行 npx wrangler login，或更新 .env.deploy.local 中带 D1 权限的 API Token。",
        )
        log_line(log_fn, f"[d1-backup] 详情: {strip_ansi(str(exc))}")
        return None


def ensure_remote_backup(
    tables: list[str] | set[str],
    *,
    reason: str,
    log_fn: Callable[[str], None] | None = None,
) -> BackupResult:
    """迁移脚本在执行 UPDATE/DELETE 前应调用此函数。"""
    return backup_tables(
        True,
        set(tables),
        reason=reason,
        full_if_empty=not tables,
        log_fn=log_fn,
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="D1 表备份（本地 tmp/d1-backups，不提交 Git）")
    parser.add_argument("--remote", action="store_true", help="备份线上库（默认）")
    parser.add_argument("--local", action="store_true", help="备份本地库")
    parser.add_argument("--tables", nargs="*", default=[], help="要备份的表名")
    parser.add_argument("--scan", nargs="*", default=[], help="扫描这些改动路径并按需备份")
    parser.add_argument("--reason", default="manual", help="备份目录后缀说明")
    args = parser.parse_args()

    if args.scan:
        maybe_backup_before_deploy(args.scan, remote=not args.local)
        return 0

    remote = not args.local if args.remote or args.local else True
    if args.remote == args.local and not args.scan:
        remote = True

    backup_tables(
        remote,
        set(args.tables),
        reason=args.reason,
        full_if_empty=not args.tables,
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except RuntimeError as exc:
        print(f"[d1-backup] error: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
