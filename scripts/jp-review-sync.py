#!/usr/bin/env python3
"""Merge Finder-tagged Japanese lesson PNGs into one PDF and upload to Cloudflare."""

from __future__ import annotations

import argparse
import json
import os
import plistlib
import re
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
from pathlib import Path

DEFAULT_FOLDER = (
    "/Users/Admin/Library/CloudStorage/坚果云-493701289@qq.com/我的坚果云/学习/日语口语"
)
DEFAULT_UPLOAD_URL = "https://finance.info-quests.com/api/jp-review/upload"
# Cloudflare Bot 防护会拦截 Python 默认 UA（403 / error 1010）
HTTP_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)
IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".heic", ".tif", ".tiff"}
TAG_XATTR = "com.apple.metadata:_kMDItemUserTags"

# macOS 彩色标签索引：6=黄，7=橙（Finder 里常被说成「黄色」的往往是橙色标签）
DEFAULT_TAG_INDICES = {6, 7}


def load_config() -> dict[str, str]:
    cfg_path = Path.home() / ".config" / "info-quests" / "jp-review-sync.env"
    data: dict[str, str] = {}
    if not cfg_path.is_file():
        return data
    for line in cfg_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        data[key.strip()] = value.strip().strip('"').strip("'")
    return data


def parse_tag_indices(raw: str | None) -> set[int]:
    if not raw:
        return set(DEFAULT_TAG_INDICES)
    indices: set[int] = set()
    for part in raw.split(","):
        part = part.strip().lower()
        if not part:
            continue
        if part in {"yellow", "黄", "黄色"}:
            indices.add(6)
        elif part in {"orange", "橙", "橙色"}:
            indices.add(7)
        elif part.isdigit():
            indices.add(int(part))
    return indices or set(DEFAULT_TAG_INDICES)


def natural_key(name: str) -> list[object]:
    return [int(chunk) if chunk.isdigit() else chunk.lower() for chunk in re.split(r"(\d+)", name)]


def read_finder_tags(path: Path) -> list[str]:
    try:
        raw = subprocess.check_output(
            ["xattr", "-px", TAG_XATTR, str(path)],
            stderr=subprocess.DEVNULL,
        )
        data = bytes.fromhex(raw.decode().replace("\n", "").replace(" ", ""))
        tags = plistlib.loads(data)
        if isinstance(tags, list):
            return [str(t) for t in tags]
    except (subprocess.CalledProcessError, plistlib.InvalidFileException, ValueError):
        pass
    return []


def tag_matches(tag: str, indices: set[int]) -> bool:
    lowered = tag.lower()
    if any(name in lowered for name in ("yellow", "黄")):
        return 6 in indices
    if any(name in lowered for name in ("orange", "橙")):
        return 7 in indices
    match = re.search(r"(\d+)\s*$", tag)
    if match:
        return int(match.group(1)) in indices
    return False


def collect_tagged_images(folder: Path, indices: set[int]) -> list[Path]:
    files: list[Path] = []
    for path in sorted(folder.iterdir(), key=lambda p: natural_key(p.name)):
        if not path.is_file() or path.suffix.lower() not in IMAGE_SUFFIXES:
            continue
        tags = read_finder_tags(path)
        if any(tag_matches(tag, indices) for tag in tags):
            files.append(path)
    return files


def build_pdf(image_paths: list[Path], out_path: Path) -> None:
    try:
        import img2pdf
    except ImportError as exc:
        raise SystemExit(
            "缺少 img2pdf。请运行：pip3 install -r scripts/jp-review-requirements.txt"
        ) from exc

    with out_path.open("wb") as handle:
        handle.write(img2pdf.convert([str(p) for p in image_paths]))


def upload_pdf(pdf_path: Path, source_files: list[str], upload_url: str, token: str) -> dict:
    boundary = "----JpReviewBoundary7MA4YWxkTrZu0gW"
    file_bytes = pdf_path.read_bytes()
    meta = json.dumps(source_files, ensure_ascii=False).encode("utf-8")

    body = b"".join(
        [
            f"--{boundary}\r\n".encode(),
            b'Content-Disposition: form-data; name="source_files"\r\n\r\n',
            meta,
            b"\r\n",
            f"--{boundary}\r\n".encode(),
            b'Content-Disposition: form-data; name="file"; filename="jp-review-latest.pdf"\r\n',
            b"Content-Type: application/pdf\r\n\r\n",
            file_bytes,
            b"\r\n",
            f"--{boundary}--\r\n".encode(),
        ]
    )

    request = urllib.request.Request(
        upload_url,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "User-Agent": HTTP_USER_AGENT,
            "Accept": "application/json",
        },
    )

    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        detail = err.read().decode("utf-8", errors="replace")
        raise SystemExit(f"上传失败 HTTP {err.code}: {detail}") from err

    if not payload.get("ok"):
        raise SystemExit(f"上传失败: {payload.get('error', payload)}")
    return payload


def main() -> int:
    cfg = load_config()
    parser = argparse.ArgumentParser(description="Sync tagged Japanese lesson images to Cloudflare PDF.")
    parser.add_argument("--folder", default=cfg.get("JP_REVIEW_FOLDER", DEFAULT_FOLDER))
    parser.add_argument("--upload-url", default=cfg.get("JP_REVIEW_UPLOAD_URL", DEFAULT_UPLOAD_URL))
    parser.add_argument("--token", default=os.environ.get("JP_REVIEW_UPLOAD_TOKEN") or cfg.get("JP_REVIEW_UPLOAD_TOKEN", ""))
    parser.add_argument("--tag-indices", default=cfg.get("JP_REVIEW_TAG_INDICES", "6,7"))
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    folder = Path(args.folder).expanduser()
    if not folder.is_dir():
        print(f"文件夹不存在: {folder}", file=sys.stderr)
        return 1

    indices = parse_tag_indices(args.tag_indices)
    images = collect_tagged_images(folder, indices)
    if not images:
        print(f"未找到匹配标签的图片（indices={sorted(indices)}）: {folder}")
        return 0

    print(f"将合并 {len(images)} 张图片:")
    for path in images:
        print(f"  - {path.name}")

    if args.dry_run:
        return 0

    if not args.token:
        print(
            "请设置上传 Token：\n"
            "  1) ~/.config/info-quests/jp-review-sync.env 中 JP_REVIEW_UPLOAD_TOKEN=...\n"
            "  2) 或环境变量 JP_REVIEW_UPLOAD_TOKEN",
            file=sys.stderr,
        )
        return 1

    with tempfile.TemporaryDirectory(prefix="jp-review-") as tmp:
        pdf_path = Path(tmp) / "jp-review-latest.pdf"
        build_pdf(images, pdf_path)
        result = upload_pdf(
            pdf_path,
            [p.name for p in images],
            args.upload_url,
            args.token,
        )

    print(
        "上传成功:",
        json.dumps(result, ensure_ascii=False),
    )
    print("老师下载页: https://finance.info-quests.com/jp-review")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
