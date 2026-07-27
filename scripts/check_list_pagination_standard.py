#!/usr/bin/env python3
"""Regression: list pagination must match JpVocabPagination layout.

Canonical UI (aligned with /jp-vocab table footer):
  [上一页] [每页] 第 {page} / {totalPages} 页 · 显示 {from}–{to} / {total} 条 [下一页]

Admin visits footer (/zh/admin) must use AdminListPagination with the same shape.
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
    admin_pag = read("src/components/admin-dashboard/AdminListPagination.tsx")
    css = read("src/app/globals/globals-seo-admin.css")
    zh = read("src/i18n/messages/zh.ts")
    jp = read("src/components/jp-vocab-page/JpVocabPagination.tsx")

    if "AdminListPagination" not in dash:
        fail("AdminDashboardPage must use AdminListPagination")
    if 'className="admin-pagination"' not in admin_pag:
        fail("AdminListPagination must render nav.admin-pagination")
    if "admin-pagination__controls" not in admin_pag:
        fail("AdminListPagination must render admin-pagination__controls")
    if "admin-pagination__info" not in admin_pag:
        fail("AdminListPagination must render admin-pagination__info")
    if "admin-pagination__size" not in admin_pag:
        fail("AdminListPagination must include page-size select")
    if "summaryMulti" not in admin_pag or "summarySingle" not in admin_pag:
        fail("AdminListPagination must support multi/single summary labels")

    if "admin-pagination-summary" in dash or "admin-pagination-actions" in dash:
        fail("AdminDashboardPage must not use old left-summary / right-actions layout")
    if "justify-content: space-between" in css and ".admin-pagination" in css:
        # only fail if space-between is still on admin-pagination itself
        block_start = css.find(".admin-pagination {")
        if block_start >= 0:
            block = css[block_start : block_start + 400]
            if "space-between" in block:
                fail("admin-pagination must not use space-between (old left/right layout)")

    if ".admin-pagination__controls" not in css:
        fail("globals-seo-admin.css must define .admin-pagination__controls")
    if ".admin-pagination__size-select" not in css:
        fail("globals-seo-admin.css must define page-size select styles")

    if (
        'summaryMulti: "第 {page} / {totalPages} 页 · 显示 {from}–{to} / {total} 条"'
        not in zh
    ):
        fail(
            'zh i18n must keep summaryMulti '
            '"第 {page} / {totalPages} 页 · 显示 {from}–{to} / {total} 条"'
        )
    if 'summarySingle: "显示 {from}–{to} / {total} 条"' not in zh:
        fail('zh i18n must keep summarySingle "显示 {from}–{to} / {total} 条"')
    if 'pageSizeLabel: "每页"' not in zh:
        fail('zh i18n must keep pageSizeLabel "每页"')
    if 'prev: "上一页"' not in zh:
        fail('zh i18n must keep prev "上一页"')
    if 'next: "下一页"' not in zh:
        fail('zh i18n must keep next "下一页"')

    if "上一页" not in jp or "下一页" not in jp:
        fail("JpVocabPagination must keep 上一页 / 下一页")
    if "第 {safePage} / {totalPages} 页" not in jp:
        fail("JpVocabPagination must show 第 X / Y 页")
    if "显示 {pageRangeStart}–{pageRangeEnd}" not in jp:
        fail("JpVocabPagination must show 显示 a–b range")
    if "PageSizeSelect" not in jp:
        fail("JpVocabPagination must keep PageSizeSelect")

    print("OK: list pagination standard (AdminListPagination ≈ JpVocabPagination)")


if __name__ == "__main__":
    main()
