#!/usr/bin/env python3
"""从坚果云日语口语目录（橙/黄 Finder 标签 PNG）提取单词并上传到 /api/jp-vocab/upload。"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent


def _load_review_sync():
    path = SCRIPT_DIR / "jp-review-sync.py"
    spec = importlib.util.spec_from_file_location("jp_review_sync", path)
    if spec is None or spec.loader is None:
        raise SystemExit(f"无法加载 {path}")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


_review = _load_review_sync()
DEFAULT_FOLDER = _review.DEFAULT_FOLDER
DEFAULT_UPLOAD_URL = _review.DEFAULT_UPLOAD_URL
HTTP_USER_AGENT = _review.HTTP_USER_AGENT
collect_tagged_images = _review.collect_tagged_images
load_config = _review.load_config
parse_tag_indices = _review.parse_tag_indices
OCR_SWIFT = SCRIPT_DIR / "jp-vocab-ocr.swift"
VOCAB_UPLOAD_URL = DEFAULT_UPLOAD_URL.replace("/jp-review/upload", "/jp-vocab/upload")

# 今日のことば → ことばを使ってみよう 之间为主要单词区
_BLOCK_END_RE = re.compile(r"^ことばを使ってみよう")
_PREFIX_RE = re.compile(r"^[①②③④⑤⑥⑦⑧⑨⑩\d\.\s•]+")
# イギリス（イギリス）＝英国
_WORD_EQ_RE = re.compile(
    r"^(.+?)[（(]([^）)]+)[）)]\s*[＝=]\s*(.+)$"
)
# 三つ（みっつ）、～人（～にん）
_WORD_READING_RE = re.compile(
    r"^(.+?)[（(]([^）)]+)[）)]\s*(?:です)?[。．.]?$"
)
# 纯中文释义行：（表示人数）
_MEANING_ONLY_RE = re.compile(r"^[（(]([^）)]+)[）)]$")
# 含日文的主词行（无读音括号）
_JP_WORD_RE = re.compile(
    r"^[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF〜～ー].{0,24}$"
)
_SKIP_SUBSTR = (
    "読み方",
    "意味",
    "例文",
    "使い方",
    "発音",
    "練習",
    "ポイント",
    "ミニ会話",
    "まとめ",
    "ちがう言い方",
    "メモ",
    "今日の質問",
    "大切",
    "おぼえ",
    "絵を見て",
    "声に出して",
    "A.",
    "B.",
)


def _strip_prefix(line: str) -> str:
    return _PREFIX_RE.sub("", line.strip()).lstrip("＝=").strip()


def _has_japanese(text: str) -> bool:
    return bool(re.search(r"[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]", text))


_MAX_WORD_LEN = 16
_TITLE_SKIP_RE = re.compile(r"はじめての|ことば|国名|絵を|考えよう|使ってみよう")
_JP_READING_RE = re.compile(
    r"^[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFFー～〜\s]+$"
)

# OCR 易错释义人工校正（按单词表原文）
MEANING_CORRECTIONS: dict[str, str] = {
    "はじめまして": "初次见面",
    "失礼ですが": "打扰一下／不好意思",
    "だれ": "谁",
    "えーと": "那个…（思考时用）",
    "たいへんですね": "真不容易／好辛苦",
    "なんばん": "几号",
    "なんぷん": "几分",
    "いかがですか": "怎么样？",
    "三つ": "三个",
    "結構": "不用了／可以了",
    "～人": "表示人数",
    "イギリス": "英国",
    "ドイツ": "德国",
    "ブラジル": "巴西",
    "どようび": "星期六",
    "かようび": "星期二",
    "すいようび": "星期三",
    "やすみ": "休息／假期",
    "けさ": "今天早上",
    "あさって": "后天",
}

# 与だれ重复，保留假名词条即可
_SKIP_WORDS = {"ことば", "ことは", "番", "徳国", "水曜日", "誰"}


def _clean_reading(raw: str | None) -> str | None:
    if not raw:
        return None
    r = raw.strip()
    if re.search(r"[\u4e00-\u9fff]", r):
        # OCR 混进中文释义时，只保留假名部分
        r = re.split(r"[。．.]", r)[0].strip()
    r = normalize_reading(r)
    return r if r and _JP_READING_RE.match(r) else None


def _is_valid_vocab(item: dict[str, str | None]) -> bool:
    word = (item.get("word") or "").strip()
    if not word or len(word) > _MAX_WORD_LEN:
        return False
    if _TITLE_SKIP_RE.search(word):
        return False
    if re.search(r"[？?、「」…]", word):
        return False
    if word in _SKIP_WORDS:
        return False
    if not _has_japanese(word):
        return False
    reading = item.get("reading")
    if reading and not _JP_READING_RE.match(reading):
        return False
    # 至少要有假名读音或中文释义
    if not reading and not item.get("meaning"):
        return False
    return True


def _should_skip(line: str) -> bool:
    if not line or line in {"1", "2", "3", "4", "5"}:
        return True
    if line.startswith(("✕", "♥", "・", "Q：", "A：", "◎", "★")):
        return True
    return any(s in line for s in _SKIP_SUBSTR)


def _find_block(lines: list[str]) -> tuple[int, int]:
    start = 0
    for i, line in enumerate(lines):
        if "今日" in line and "ことば" in line:
            start = i + 1
            break
    end = len(lines)
    for i in range(start, len(lines)):
        if _BLOCK_END_RE.match(lines[i]):
            end = i
            break
    return start, end


def parse_today_words(lines: list[str]) -> list[dict[str, str | None]]:
    """解析「今日のことば」到「ことばを使ってみよう」之间的单词。"""
    start, end = _find_block(lines)
    words: list[dict[str, str | None]] = []
    pending: dict[str, str | None] | None = None

    def flush_pending() -> None:
        nonlocal pending
        if pending and _is_valid_vocab(pending):
            words.append(pending)
        pending = None

    for raw in lines[start:end]:
        line = _strip_prefix(raw)
        if _should_skip(line):
            continue

        eq = _WORD_EQ_RE.match(line)
        if eq:
            flush_pending()
            word = normalize_word(eq.group(1))
            if _has_japanese(word):
                item = {
                    "word": word,
                    "reading": _clean_reading(eq.group(2)),
                    "meaning": eq.group(3).strip(),
                }
                if _is_valid_vocab(item):
                    words.append(item)
            continue

        wr = _WORD_READING_RE.match(line)
        if wr:
            flush_pending()
            word = normalize_word(wr.group(1))
            if not _has_japanese(word):
                continue
            meaning: str | None = None
            reading = _clean_reading(wr.group(2))
            if re.search(r"[\u4e00-\u9fff]", wr.group(2)):
                parts = re.split(r"[。．.]", wr.group(2))
                if len(parts) >= 2 and re.search(r"[\u4e00-\u9fff]", parts[-1]):
                    reading = _clean_reading(parts[0])
                    meaning = parts[-1].strip()
            item = {"word": word, "reading": reading, "meaning": meaning}
            if _is_valid_vocab(item):
                words.append(item)
            else:
                # 读音可能是汉字表记：すいようび（水曜日）
                alt_reading = wr.group(2).strip()
                if re.search(r"[\u3040-\u309F\u30A0-\u30FF]", word) and _has_japanese(
                    alt_reading
                ):
                    item["reading"] = alt_reading if _JP_READING_RE.match(alt_reading) else None
                    if _is_valid_vocab(item):
                        words.append(item)
            pending = None
            continue

        mo = _MEANING_ONLY_RE.match(line)
        if mo:
            meaning = mo.group(1).strip()
            if words and re.search(r"[\u4e00-\u9fff]", meaning):
                last = words[-1]
                if not last.get("meaning"):
                    last["meaning"] = meaning
                elif meaning == last.get("meaning"):
                    pass
            if pending and re.search(r"[\u4e00-\u9fff]", meaning):
                if words and meaning == words[-1].get("meaning"):
                    pending = None
                else:
                    pending["meaning"] = meaning
                    if _is_valid_vocab(pending):
                        words.append(pending)
                    pending = None
            continue

        if (
            _JP_WORD_RE.match(line)
            and "（" not in line
            and "(" not in line
            and len(line) <= _MAX_WORD_LEN
        ):
            flush_pending()
            pending = {"word": normalize_word(line), "reading": None, "meaning": None}
            continue

    if pending and _is_valid_vocab(pending):
        words.append(pending)
    return words


def ocr_image(path: Path) -> list[str]:
    if not OCR_SWIFT.is_file():
        raise SystemExit(f"缺少 OCR 脚本: {OCR_SWIFT}")
    try:
        out = subprocess.check_output(
            ["swift", str(OCR_SWIFT), str(path)],
            text=True,
            stderr=subprocess.STDOUT,
        )
    except subprocess.CalledProcessError as exc:
        raise SystemExit(f"OCR 失败 {path.name}: {exc.output[:300]}") from exc
    return [ln.strip() for ln in out.splitlines() if ln.strip()]


def normalize_reading(raw: str) -> str | None:
    r = raw.strip()
    if not r:
        return None
    if re.fullmatch(r"[a-zA-Z\s\-]+", r):
        return None
    return r


def normalize_word(raw: str) -> str:
    w = raw.strip().strip("。").strip("．").strip(".")
    return w.replace("〜", "～")


def apply_meaning_corrections(
    items: list[dict[str, str | None]],
) -> list[dict[str, str | None]]:
    out: list[dict[str, str | None]] = []
    for item in items:
        word = (item.get("word") or "").strip()
        if not word:
            continue
        meaning = MEANING_CORRECTIONS.get(word, item.get("meaning"))
        out.append({**item, "word": word, "meaning": meaning})
    return out


def dedupe_words(items: list[dict[str, str | None]]) -> list[dict[str, str | None]]:
    seen: set[str] = set()
    out: list[dict[str, str | None]] = []
    for item in items:
        if not _is_valid_vocab(item):
            continue
        word = (item.get("word") or "").strip()
        if not word or word in seen:
            continue
        seen.add(word)
        out.append(
            {
                "word": word,
                "reading": item.get("reading"),
                "meaning": item.get("meaning"),
            }
        )
    return out


def _load_token_from_env_local() -> str:
    env_path = SCRIPT_DIR.parent / ".env.local"
    if not env_path.is_file():
        return ""
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line.startswith("JP_REVIEW_UPLOAD_TOKEN="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def resolve_token(explicit: str, cfg: dict[str, str]) -> str:
    return (
        explicit
        or os.environ.get("JP_REVIEW_UPLOAD_TOKEN", "")
        or cfg.get("JP_REVIEW_UPLOAD_TOKEN", "")
        or _load_token_from_env_local()
    )


def extract_words_from_image(path: Path) -> list[dict[str, str | None]]:
    lines = ocr_image(path)
    words = parse_today_words(lines)
    return dedupe_words(words)


def upload_words(
    words: list[dict[str, str | None]],
    upload_url: str,
    token: str,
    *,
    replace: bool,
) -> dict:
    payload = json.dumps({"replace": replace, "words": words}, ensure_ascii=False).encode(
        "utf-8"
    )
    request = urllib.request.Request(
        upload_url,
        data=payload,
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": HTTP_USER_AGENT,
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        detail = err.read().decode("utf-8", errors="replace")
        raise SystemExit(f"上传失败 HTTP {err.code}: {detail}") from err


def main() -> int:
    cfg = load_config()
    parser = argparse.ArgumentParser(
        description="从 Finder 橙/黄标签的日语单词 PNG 提取词汇并上传到 jp-vocab。"
    )
    parser.add_argument("--folder", default=cfg.get("JP_REVIEW_FOLDER", DEFAULT_FOLDER))
    parser.add_argument(
        "--upload-url",
        default=cfg.get("JP_VOCAB_UPLOAD_URL", VOCAB_UPLOAD_URL),
    )
    parser.add_argument(
        "--token",
        default=os.environ.get("JP_REVIEW_UPLOAD_TOKEN") or cfg.get("JP_REVIEW_UPLOAD_TOKEN", ""),
    )
    parser.add_argument("--tag-indices", default=cfg.get("JP_REVIEW_TAG_INDICES", "6,7"))
    parser.add_argument(
        "--local",
        action="store_true",
        help="仅写入本地 dev API（http://127.0.0.1:3002/api/jp-vocab/upload）",
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--replace",
        action="store_true",
        help="清空全部单词及复习计数后再上传（默认仅追加新词，保留已有进度）",
    )
    args = parser.parse_args()

    folder = Path(args.folder).expanduser()
    if not folder.is_dir():
        print(f"文件夹不存在: {folder}", file=sys.stderr)
        return 1

    upload_url = (
        "http://127.0.0.1:3002/api/jp-vocab/upload" if args.local else args.upload_url
    )

    indices = parse_tag_indices(args.tag_indices)
    images = collect_tagged_images(folder, indices)
    if not images:
        print(f"未找到匹配标签的图片（indices={sorted(indices)}）: {folder}")
        return 0

    all_words: list[dict[str, str | None]] = []
    print(f"从 {len(images)} 张标签图片提取单词:")
    for path in images:
        extracted = extract_words_from_image(path)
        print(f"  - {path.name}: {len(extracted)} 词")
        for w in extracted:
            reading = w.get("reading") or "—"
            meaning = w.get("meaning") or "—"
            print(f"      · {w['word']} / {reading} / {meaning}")
        all_words.extend(extracted)

    words = dedupe_words(all_words)
    words = apply_meaning_corrections(words)
    print(f"\n合计 {len(words)} 个不重复单词")

    if args.dry_run:
        print(json.dumps(words, ensure_ascii=False, indent=2))
        return 0

    token = resolve_token(args.token, cfg)
    if not token:
        print("未找到 JP_REVIEW_UPLOAD_TOKEN（与 PDF 上传共用）", file=sys.stderr)
        return 1

    result = upload_words(words, upload_url, token, replace=args.replace)
    if not result.get("ok"):
        raise SystemExit(f"上传失败: {result.get('error', result)}")

    print("上传成功:", json.dumps(result, ensure_ascii=False))
    print("单词抽问页: https://finance.info-quests.com/jp-vocab")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
