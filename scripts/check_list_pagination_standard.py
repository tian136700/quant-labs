#!/usr/bin/env python3
"""Regression: list pagination gold standard must stay at AdminDashboard + i18n copy.

Canonical UI (https://finance.info-quests.com/zh/admin visit logs footer):
  左：第 {page} / {totalPages} 页，共 {total} 条
  右：上一页 / 下一页
  class：admin-pagination

Also checks JpVocabPagination still exposes 上一页/下一页 for vocab tables.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def main() -> None:
    dash = read("src/components/AdminDashboardPage.tsx")
    css = read("src/app/globals/globals-seo-admin.css")
    zh = read("src/i18n/messages/zh.ts")
    jp = read("src/components/jp-vocab-page/JpVocabPagination.tsx")

    if 'className="admin-pagination"' not in dash:
        fail("AdminDashboardPage must render nav.admin-pagination")
    if "admin-pagination-summary" not in dash:
        fail("AdminDashboardPage must render admin-pagination-summary")
    if "admin-pagination-actions" not in dash:
        fail("AdminDashboardPage must render admin-pagination-actions")
    if "adm.visits.pagination.prev" not in dash:
        fail("AdminDashboardPage must use i18n prev label")
    if "adm.visits.pagination.next" not in dash:
        fail("AdminDashboardPage must use i18n next label")

    if ".admin-pagination {" not in css:
        fail("globals-seo-admin.css must define .admin-pagination")
    if "justify-content: space-between" not in css:
        fail("admin-pagination sm layout must use space-between")

    if 'summary: "第 {page} / {totalPages} 页，共 {total} 条"' not in zh:
        fail('zh i18n must keep summary "第 {page} / {totalPages} 页，共 {total} 条"')
    if 'prev: "上一页"' not in zh:
        fail('zh i18n must keep prev "上一页"')
    if 'next: "下一页"' not in zh:
        fail('zh i18n must keep next "下一页"')

    if "上一页" not in jp or "下一页" not in jp:
        fail("JpVocabPagination must keep 上一页 / 下一页")
    if "第 {safePage} / {totalPages} 页" not in jp:
        fail("JpVocabPagination must show 第 X / Y 页")

    print("OK: list pagination standard (admin-pagination + JpVocabPagination)")


if __name__ == "__main__":
    main()
