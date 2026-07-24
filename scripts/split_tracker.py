#!/usr/bin/env python3
"""业务代码行数拆分跟踪：scan / status / mark / verify。

约定（与 .cursor/rules/loc-split-1000.mdc 一致）：
- src 下业务 .ts/.tsx 单文件 ≤1000 行
- 排除 *Styles*、css、i18n/messages、*.card-compact.tsx
- status: 0=待拆，1=已达标

用法：
  python3 scripts/split_tracker.py scan          # 刷新 LOC，新超限项 status=0；已 ≤1000 自动 status=1
  python3 scripts/split_tracker.py status        # 打印队列
  python3 scripts/split_tracker.py mark PATH 1   # 手动标记（一般用 scan 即可）
  python3 scripts/split_tracker.py verify        # 有 status=0 或扫描仍超限 → exit 1
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TRACKER = ROOT / "docs" / "split-tracker.json"
TRACKER_TXT = ROOT / "docs" / "split-tracker.txt"
SRC = ROOT / "src"

SKIP_DIRS = {
    "node_modules",
    ".next",
    ".git",
    "dist",
    "build",
    ".open-next",
    "out",
    "coverage",
    ".wrangler",
    "tmp",
    "__pycache__",
    ".turbo",
    ".history",
}


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def is_excluded(rel: str) -> bool:
    name = Path(rel).name
    if name.endswith("Styles.tsx") or name.endswith("Styles.ts"):
        return True
    if name.endswith(".css"):
        return True
    if rel.replace("\\", "/").endswith("i18n/messages.ts"):
        return True
    if ".card-compact." in name:
        return True
    return False


def count_loc(path: Path) -> int:
    try:
        return sum(1 for _ in path.open(encoding="utf-8", errors="ignore"))
    except OSError:
        return 0


def load_tracker() -> dict:
    if not TRACKER.exists():
        return {
            "version": 1,
            "updated_at": None,
            "policy": {
                "max_loc": 1000,
                "scope": "src/**/*.{ts,tsx}",
                "exclude_globs": [
                    "**/*Styles.tsx",
                    "**/*Styles.ts",
                    "**/*.css",
                    "**/i18n/messages.ts",
                    "**/*.card-compact.tsx",
                ],
                "status_values": {
                    "0": "pending",
                    "1": "done",
                },
            },
            "items": [],
        }
    return json.loads(TRACKER.read_text(encoding="utf-8"))


def save_tracker(data: dict) -> None:
    data["updated_at"] = utc_now()
    TRACKER.parent.mkdir(parents=True, exist_ok=True)
    TRACKER.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    write_tracker_txt(data)


def write_tracker_txt(data: dict) -> None:
    """Human-readable twin of split-tracker.json (same status 0/1)."""
    pending = [i for i in data.get("items", []) if i.get("status") == 0]
    done = [i for i in data.get("items", []) if i.get("status") == 1]
    lines = [
        "# 业务代码拆分跟踪（≤1000 行）",
        f"# updated_at: {data.get('updated_at')}",
        "# status: 0=待拆  1=已达标",
        "# 机器可读：docs/split-tracker.json",
        "# 命令：python3 scripts/split_tracker.py scan|status|mark|verify",
        "",
        f"## pending (status=0)  count={len(pending)}",
    ]
    if not pending:
        lines.append("(none)")
    for i in pending:
        lines.append(f"0  {i.get('loc', '?'):>5}  {i['path']}")
        if i.get("note"):
            lines.append(f"         note: {i['note']}")
        if i.get("split_into"):
            lines.append(f"         split_into: {', '.join(i['split_into'])}")
    lines.append("")
    lines.append(f"## done (status=1)  count={len(done)}")
    if not done:
        lines.append("(none)")
    for i in done:
        extra = ""
        if i.get("split_into"):
            extra = " → " + ", ".join(i["split_into"])
        lines.append(f"1  {i.get('loc', '?'):>5}  {i['path']}{extra}")
        if i.get("note"):
            lines.append(f"         note: {i['note']}")
    lines.append("")
    TRACKER_TXT.write_text("\n".join(lines), encoding="utf-8")


def iter_src_ts() -> list[Path]:
    out: list[Path] = []
    for p in SRC.rglob("*"):
        if not p.is_file():
            continue
        if p.suffix not in {".ts", ".tsx"}:
            continue
        if any(part in SKIP_DIRS for part in p.parts):
            continue
        out.append(p)
    return out


def scan() -> dict:
    data = load_tracker()
    max_loc = int(data.get("policy", {}).get("max_loc", 1000))
    by_path = {item["path"]: item for item in data.get("items", []) if "path" in item}

    current_over: dict[str, int] = {}
    for path in iter_src_ts():
        rel = path.relative_to(ROOT).as_posix()
        if is_excluded(rel):
            continue
        loc = count_loc(path)
        if loc > max_loc:
            current_over[rel] = loc

    # Update existing + add new
    for rel, loc in sorted(current_over.items()):
        if rel in by_path:
            by_path[rel]["loc"] = loc
            # still over → keep pending unless manually done and somehow still over
            if by_path[rel].get("status") == 1:
                # was marked done but grew again
                by_path[rel]["status"] = 0
                by_path[rel]["note"] = "重新超过 1000 行，改回待拆"
        else:
            by_path[rel] = {
                "path": rel,
                "status": 0,
                "loc": loc,
                "split_into": [],
                "note": "",
            }

    # Paths that were tracked and now ≤ max → auto done
    for rel, item in list(by_path.items()):
        path = ROOT / rel
        if not path.is_file():
            # moved/deleted — if had split_into, keep as done archive
            if item.get("status") == 0:
                item["note"] = (item.get("note") or "") + "（路径已不存在，请核对）"
            continue
        if is_excluded(rel):
            item["status"] = 1
            item["loc"] = count_loc(path)
            item["note"] = "已排除（样式/文案类）"
            continue
        loc = count_loc(path)
        item["loc"] = loc
        if loc <= max_loc:
            item["status"] = 1
            if not item.get("split_into") and not item.get("note"):
                item["note"] = "已 ≤1000 行"

    data["items"] = sorted(by_path.values(), key=lambda x: (-int(x.get("loc") or 0), x["path"]))
    save_tracker(data)
    return data


def print_status(data: dict) -> None:
    pending = [i for i in data["items"] if i.get("status") == 0]
    done = [i for i in data["items"] if i.get("status") == 1]
    print(f"split-tracker  updated={data.get('updated_at')}  pending={len(pending)}  done={len(done)}")
    print("\n## pending (status=0)")
    if not pending:
        print("  (none)")
    for i in pending:
        print(f"  [{i.get('loc', '?'):>5}]  {i['path']}")
        if i.get("note"):
            print(f"           note: {i['note']}")
    print("\n## done (status=1)")
    if not done:
        print("  (none)")
    for i in done[:40]:
        extras = ""
        if i.get("split_into"):
            extras = " → " + ", ".join(i["split_into"][:4])
            if len(i["split_into"]) > 4:
                extras += ", …"
        print(f"  [{i.get('loc', '?'):>5}]  {i['path']}{extras}")
    if len(done) > 40:
        print(f"  … +{len(done) - 40} more")


def mark(path: str, status: int, split_into: list[str] | None = None, note: str = "") -> None:
    data = load_tracker()
    rel = path.replace("\\", "/")
    if rel.startswith("./"):
        rel = rel[2:]
    item = next((i for i in data["items"] if i["path"] == rel), None)
    abs_path = ROOT / rel
    loc = count_loc(abs_path) if abs_path.is_file() else 0
    if item is None:
        item = {"path": rel, "status": status, "loc": loc, "split_into": [], "note": note}
        data["items"].append(item)
    else:
        item["status"] = status
        item["loc"] = loc
        if note:
            item["note"] = note
    if split_into is not None:
        item["split_into"] = split_into
    data["items"] = sorted(data["items"], key=lambda x: (-int(x.get("loc") or 0), x["path"]))
    save_tracker(data)
    print(f"marked {rel} status={status} loc={loc}")


def verify(data: dict) -> int:
    pending = [i for i in data["items"] if i.get("status") == 0]
    # re-scan hard violations
    max_loc = int(data.get("policy", {}).get("max_loc", 1000))
    hard = []
    for path in iter_src_ts():
        rel = path.relative_to(ROOT).as_posix()
        if is_excluded(rel):
            continue
        loc = count_loc(path)
        if loc > max_loc:
            hard.append((loc, rel))
    if pending or hard:
        print(f"FAIL pending={len(pending)} hard_over={len(hard)}")
        for loc, rel in sorted(hard, reverse=True)[:20]:
            print(f"  {loc:5d}  {rel}")
        return 1
    print("OK: no business file over 1000 LOC")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    sub = ap.add_subparsers(dest="cmd", required=True)

    sub.add_parser("scan", help="Refresh LOC and auto-flip status")
    sub.add_parser("status", help="Print pending/done")
    sub.add_parser("verify", help="Exit 1 if any pending or over limit")

    p_mark = sub.add_parser("mark", help="Manually set status")
    p_mark.add_argument("path")
    p_mark.add_argument("status", type=int, choices=[0, 1])
    p_mark.add_argument("--split-into", nargs="*", default=None)
    p_mark.add_argument("--note", default="")

    args = ap.parse_args()
    if args.cmd == "scan":
        data = scan()
        print_status(data)
        return 0
    if args.cmd == "status":
        print_status(load_tracker())
        return 0
    if args.cmd == "verify":
        return verify(scan())
    if args.cmd == "mark":
        mark(args.path, args.status, args.split_into, args.note)
        return 0
    return 2


if __name__ == "__main__":
    sys.exit(main())
