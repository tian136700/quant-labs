#!/usr/bin/env python3
"""日语新课板书 Word：list_missing →（缺音调则 OJAD）→ 切行组 docx → upload。

每轮默认处理 1～2 课；适合每分钟 launchd。
抽查门禁 / Worker 1027 / 熔断 由 stage.sh 入口处理。
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts" / "lib"))

from jp_lesson_board_docx_build import (  # noqa: E402
    build_board_docx_bytes,
    build_fingerprint,
    pitch_digest,
    to_hiragana,
)
from ojad_pitch_accent import fetch_pitch_accent_for_word  # noqa: E402
from vocab_fill_circuit_breaker import assert_not_killed  # noqa: E402
from worker_api_guard import skip_if_worker_unavailable  # noqa: E402
from worker_fill_http import post_worker_fill_api  # noqa: E402

DEFAULT_API_URL = "https://finance.info-quests.com/api/jp-lesson/board-docx"
PITCH_API_URL = "https://finance.info-quests.com/api/jp-vocab/fill-pitch-accent"
HTTP_USER_AGENT = "jp-lesson-board-docx/1.0"
OJAD_GAP_SEC = 5.0
FILL_TASK_ID = "jp-lesson-board-docx"


def now_local_str() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def load_env_file(name: str) -> dict[str, str]:
    cfg_path = Path.home() / ".config" / "info-quests" / name
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


def resolve_token(review_cfg: dict[str, str]) -> str:
    return (
        os.environ.get("JP_REVIEW_UPLOAD_TOKEN")
        or review_cfg.get("JP_REVIEW_UPLOAD_TOKEN", "")
    ).strip()


def resolve_api_base(review_cfg: dict[str, str]) -> str:
    return (
        os.environ.get("JP_LESSON_BOARD_DOCX_API_URL")
        or os.environ.get("JP_VOCAB_API_BASE")
        or review_cfg.get("JP_LESSON_BOARD_DOCX_API_URL", "")
        or DEFAULT_API_URL
    ).strip()


def pitch_api_url(board_api: str) -> str:
    if "jp-lesson/board-docx" in board_api:
        return board_api.replace("jp-lesson/board-docx", "jp-vocab/fill-pitch-accent")
    return os.environ.get("JP_VOCAB_FILL_PITCH_ACCENT_API_URL", PITCH_API_URL).strip()


def call_board_api(api_url: str, token: str, payload: dict) -> dict:
    return post_worker_fill_api(
        api_url,
        token,
        payload,
        user_agent=HTTP_USER_AGENT,
        timeout=120,
    )


def download_ref_image(api_base_host: str, ref_key: str, token: str) -> bytes:
    """教案图 inline 无需登录；本地缺文件时回退线上 finance。"""
    root = api_base_host
    if "/api/" in root:
        root = root.split("/api/")[0]
    candidates = [root]
    if "127.0.0.1" in root or "localhost" in root:
        candidates.append("https://finance.info-quests.com")
    last_err: Exception | None = None
    for base in candidates:
        url = f"{base}/api/jp-vocab/ref/{urllib.parse.quote(ref_key, safe='')}"
        req = urllib.request.Request(
            url,
            headers={"User-Agent": HTTP_USER_AGENT, "Authorization": f"Bearer {token}"},
            method="GET",
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                data = resp.read()
                if data:
                    return data
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            continue
    if last_err:
        raise last_err
    raise RuntimeError(f"ref image empty: {ref_key}")


def upload_docx(
    *,
    api_url: str,
    token: str,
    lesson_id: int,
    fingerprint: str,
    docx_bytes: bytes,
) -> dict:
    boundary = f"----BoardDocx{int(time.time())}"
    filename = f"lesson-{lesson_id}-board.docx"
    parts: list[bytes] = []

    def add_field(name: str, value: str) -> None:
        parts.append(
            (
                f"--{boundary}\r\n"
                f'Content-Disposition: form-data; name="{name}"\r\n\r\n'
                f"{value}\r\n"
            ).encode("utf-8")
        )

    add_field("mode", "upload")
    add_field("lesson_id", str(lesson_id))
    add_field("fingerprint", fingerprint)
    parts.append(
        (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
            f"Content-Type: application/vnd.openxmlformats-officedocument"
            f".wordprocessingml.document\r\n\r\n"
        ).encode("utf-8")
    )
    parts.append(docx_bytes)
    parts.append(f"\r\n--{boundary}--\r\n".encode("utf-8"))
    body = b"".join(parts)
    req = urllib.request.Request(
        api_url,
        data=body,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "User-Agent": HTTP_USER_AGENT,
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=180) as resp:
        return json.loads(resp.read().decode("utf-8"))


def ensure_pitches_for_lesson(
    *,
    pitch_url: str,
    token: str,
    words: list[dict[str, Any]],
    ojad_gap: float,
    dry_run: bool,
) -> list[dict[str, Any]]:
    """就地补 words 的 pitch；缺则 OJAD；能写回则 apply。"""
    updated = list(words)
    apply_updates: list[dict[str, Any]] = []
    mark_none: list[int] = []

    for i, w in enumerate(updated):
        surface = str(w.get("word") or "").strip()
        reading_hint = to_hiragana(
            str(w.get("reading") or "").strip() or surface
        )
        digest = pitch_digest(w.get("pitch_accent"), w.get("pitch_accent_source"))
        if digest and digest != "OJAD_NONE":
            # 已有音调：若与课表假名不一致则丢掉重抓（防错配缓存）
            try:
                parsed = json.loads(str(w.get("pitch_accent") or ""))
                stored_kana = to_hiragana(str(parsed.get("kana") or ""))
            except (json.JSONDecodeError, TypeError, AttributeError):
                stored_kana = ""
            if reading_hint and stored_kana and stored_kana != reading_hint:
                print(
                    f"  drop mismatched pitch {surface}: {stored_kana} != {reading_hint}",
                    flush=True,
                )
                digest = ""
                w = dict(w)
                w["pitch_accent"] = None
                w["pitch_accent_source"] = None
                w["pitch_digest"] = ""
                updated[i] = w
            else:
                w = dict(w)
                w["reading"] = reading_hint or w.get("reading")
                w["pitch_digest"] = digest
                updated[i] = w
                continue
        elif digest == "OJAD_NONE":
            w = dict(w)
            w["reading"] = reading_hint or w.get("reading")
            w["pitch_digest"] = digest
            updated[i] = w
            continue
        if not surface:
            continue
        if dry_run:
            continue
        print(f"  OJAD fetch: {surface} (hira={reading_hint})", flush=True)
        try:
            result = fetch_pitch_accent_for_word(
                surface, reading=reading_hint or None
            )
        except Exception as exc:  # noqa: BLE001
            print(f"  OJAD error {surface}: {exc}", flush=True)
            time.sleep(ojad_gap)
            continue
        time.sleep(ojad_gap)
        word_id = w.get("word_id")
        # 拒收与课表表面假名对不上的结果（防「お気をつけて」→「おきにいり」）
        if result:
            result_kana = to_hiragana(str(result.get("kana") or ""))
            if reading_hint and result_kana and result_kana != reading_hint:
                print(
                    f"  OJAD reject mismatch {surface}: got {result_kana}",
                    flush=True,
                )
                result = None
        if not result:
            if word_id:
                mark_none.append(int(word_id))
            w = dict(w)
            w["reading"] = reading_hint or w.get("reading")
            w["pitch_accent_source"] = "OJAD_NONE"
            w["pitch_digest"] = "OJAD_NONE"
            updated[i] = w
            continue
        pitch_obj = {
            "kana": result.get("kana"),
            "pattern": result.get("pattern"),
            "moras": result.get("moras") or [],
        }
        w = dict(w)
        w["reading"] = reading_hint or str(result.get("kana") or "")
        w["pitch_accent"] = json.dumps(pitch_obj, ensure_ascii=False)
        w["pitch_accent_source"] = "OJAD"
        w["pitch_digest"] = pitch_digest(w["pitch_accent"], "OJAD")
        updated[i] = w
        if word_id:
            apply_updates.append(
                {
                    "word_id": int(word_id),
                    "pitch_accent": pitch_obj,
                    "source": "OJAD",
                }
            )

    if apply_updates and not dry_run:
        post_worker_fill_api(
            pitch_url,
            token,
            {"mode": "apply", "updates": apply_updates},
            user_agent=HTTP_USER_AGENT,
            timeout=120,
        )
    if mark_none and not dry_run:
        post_worker_fill_api(
            pitch_url,
            token,
            {"mode": "mark_not_found", "word_ids": mark_none},
            user_agent=HTTP_USER_AGENT,
            timeout=60,
        )
    return updated


def process_one(
    *,
    api_url: str,
    token: str,
    item: dict[str, Any],
    ojad_gap: float,
    dry_run: bool,
    image_file: Path | None = None,
) -> dict[str, Any]:
    from PIL import Image
    import io

    lesson_id = int(item["lesson_id"])
    ref_key = str(item.get("ref_key") or "")
    words = list(item.get("words") or [])
    pitch_url = pitch_api_url(api_url)

    words = ensure_pitches_for_lesson(
        pitch_url=pitch_url,
        token=token,
        words=words,
        ojad_gap=ojad_gap,
        dry_run=dry_run,
    )
    fingerprint = build_fingerprint(
        ref_updated_at=str(item.get("ref_updated_at") or ""),
        content=str(item.get("content") or ""),
        meanings=item.get("meanings"),
        pitch_digests=[
            pitch_digest(w.get("pitch_accent"), w.get("pitch_accent_source"))
            for w in words
        ],
    )

    if image_file and image_file.is_file():
        print(f"  lesson {lesson_id}: use image file {image_file}", flush=True)
        img = Image.open(image_file)
    else:
        print(f"  lesson {lesson_id}: download ref {ref_key}", flush=True)
        img_bytes = download_ref_image(api_url, ref_key, token)
        img = Image.open(io.BytesIO(img_bytes))
    docx_bytes = build_board_docx_bytes(image=img, words=words)
    print(
        f"  lesson {lesson_id}: docx {len(docx_bytes)} bytes fp={fingerprint}",
        flush=True,
    )
    if dry_run:
        out = Path(tempfile.gettempdir()) / f"lesson-{lesson_id}-board-dryrun.docx"
        out.write_bytes(docx_bytes)
        return {
            "ok": True,
            "lesson_id": lesson_id,
            "dry_run": True,
            "fingerprint": fingerprint,
            "out": str(out),
            "bytes": len(docx_bytes),
        }

    up = upload_docx(
        api_url=api_url,
        token=token,
        lesson_id=lesson_id,
        fingerprint=fingerprint,
        docx_bytes=docx_bytes,
    )
    return {"ok": bool(up.get("ok")), "lesson_id": lesson_id, "upload": up}


def main() -> int:
    parser = argparse.ArgumentParser(description="jp-lesson board docx builder")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, default=2)
    parser.add_argument("--lesson-id", type=int, default=0)
    parser.add_argument("--ojad-gap", type=float, default=OJAD_GAP_SEC)
    parser.add_argument("--fixture-dry-run", action="store_true")
    parser.add_argument(
        "--image-file",
        type=str,
        default="",
        help="本地教案图路径（跳过拉 ref；便于本机无 R2 时测 upload）",
    )
    args = parser.parse_args()

    if args.fixture_dry_run:
        from jp_lesson_board_docx_build import dry_run_lesson_148_fixture

        fixture = ROOT / "scripts" / "fixtures" / "jp-lesson-148-word-card-grid.png"
        out = ROOT / "tmp" / "lesson-148-board-dryrun.docx"
        info = dry_run_lesson_148_fixture(fixture, out)
        print(json.dumps(info, ensure_ascii=False, indent=2))
        return 0 if info.get("ok") else 1

    assert_not_killed(FILL_TASK_ID)
    review_cfg = load_env_file("jp-review-sync.env")
    board_cfg = load_env_file("jp-lesson-board-docx.env")
    review_cfg.update(board_cfg)
    token = resolve_token(review_cfg)
    api_url = resolve_api_base(review_cfg)
    if not token:
        print("missing JP_REVIEW_UPLOAD_TOKEN", file=sys.stderr)
        return 1

    skip_if_worker_unavailable(api_url, label=FILL_TASK_ID)

    print(f"{now_local_str()} {FILL_TASK_ID}: list_missing limit={args.limit}", flush=True)
    scan = call_board_api(
        api_url,
        token,
        {"mode": "list_missing", "limit": max(args.limit, 1)},
    )
    if not scan.get("ok"):
        print(f"list_missing error: {scan}", file=sys.stderr)
        return 1
    missing = list(scan.get("missing") or [])
    if args.lesson_id:
        missing = [m for m in missing if int(m.get("lesson_id") or 0) == args.lesson_id]
        if not missing:
            # 强制用单课：仍可 list 全量找，或构造最小项需 API
            print(f"lesson_id={args.lesson_id} not in missing", flush=True)
            return 0

    if not missing:
        print("  无待生成板书 Word", flush=True)
        return 0

    results = []
    image_file = Path(args.image_file) if args.image_file else None
    for item in missing[: max(args.limit, 1)]:
        try:
            results.append(
                process_one(
                    api_url=api_url,
                    token=token,
                    item=item,
                    ojad_gap=args.ojad_gap,
                    dry_run=args.dry_run,
                    image_file=image_file,
                )
            )
        except Exception as exc:  # noqa: BLE001
            print(f"  FAIL lesson {item.get('lesson_id')}: {exc}", file=sys.stderr)
            results.append({"ok": False, "error": str(exc), "lesson_id": item.get("lesson_id")})

    ok_n = sum(1 for r in results if r.get("ok"))
    print(json.dumps({"ok": ok_n > 0, "processed": results}, ensure_ascii=False))
    return 0 if ok_n == len(results) else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except urllib.error.HTTPError as e:
        print(f"HTTPError {e.code}: {e.read()[:500]!r}", file=sys.stderr)
        raise SystemExit(1)
