#!/usr/bin/env python3
"""日语语法：用法+例句同一次付费调用（1 词 1 次；1:1 配对）。

防烧钱硬规则：
  - 每轮只写回 1 条语法；用法与例句同一次 Anthropic 调用
  - 禁止并行 / 禁止一次开多进程补；必须队列串行：补完一条再下一条
  - 禁止拆成「先 usage 再 examples」两次打钱
  - 付费间隔 ≥1s；进程互斥锁；失败毒丸 6h
  - 禁止 --allow-burst 写进定时
  - 定时（每分钟）：只跑默认「缺则补 1 条」；忙则跳过（--skip-if-busy）
  - 全量重表：--refill-ids 按 id 列表逐条 clear+补，绝不一次打爆

用法：
  python3 scripts/jp-vocab-fill-grammar-usage-examples-api.py --status
  python3 scripts/jp-vocab-fill-grammar-usage-examples-api.py --skip-if-busy   # 定时：最多 1 条
  python3 scripts/jp-vocab-fill-grammar-usage-examples-api.py --max-rounds 2
  python3 scripts/jp-vocab-fill-grammar-usage-examples-api.py --word-id 418
  python3 scripts/jp-vocab-fill-grammar-usage-examples-api.py --refill-ids 60,72,73
"""

from __future__ import annotations

import argparse
import fcntl
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts" / "lib"))

from paid_anthropic_client import (  # noqa: E402
    anthropic_model,
    build_online_source_label,
    call_anthropic,
)
from vocab_fill_circuit_breaker import (  # noqa: E402
    after_attempt,
    assert_not_killed,
)
from worker_api_guard import (  # noqa: E402
    looks_rate_limited_body,
    record_worker_unavailable,
    skip_if_worker_unavailable,
)
from worker_fill_http import post_worker_fill_api  # noqa: E402
from jp_vocab_frequency import extract_jp_vocab_frequencies  # noqa: E402

DEFAULT_API_URL = "https://finance.info-quests.com/api/jp-vocab/fill-usage"
HTTP_USER_AGENT = "jp-vocab-fill-grammar-usage-examples/2.0"
DEFAULT_MIN_INTERVAL_SEC = 1
DEFAULT_POISON_SEC = 6 * 3600
FILL_PER_ROUND = 1
LIST_CANDIDATE_LIMIT = 20

CFG_DIR = Path.home() / ".config" / "info-quests"
RATE_GATE_PATH = CFG_DIR / "jp-vocab-fill-grammar.last_paid_call"
POISON_PATH = CFG_DIR / "jp-vocab-fill-grammar.poison.json"
RUN_LOCK_PATH = CFG_DIR / "jp-vocab-fill-grammar.run.lock"

HAN_RE = re.compile(r"[\u4E00-\u9FFF]")
NUMBERED_LINE_RE = re.compile(r"^\s*(\d+)\s*[.、．)\]]\s*(.+)$")
FENCE_RE = re.compile(r"^```(?:\w+)?\s*|\s*```$", re.MULTILINE)

PAIR_SYSTEM = (
    "你为中文母语的日语 N5～N2 学习者一次写完语法「用法+例句+接序」。"
    "第一行必须直接是「1.」中文用法，不要总标题。"
    "用法说明必须是中文；可在中文里用「」短引日语形态，且「」内不要假名括注。"
    "❌ 用法行禁止写接序清单（动词て形＋…）；接序只写在文末【接序】段。"
    "每条中文用法句末句号后必须紧跟半角等级括号，如。(N5) 或 .(N4).(N3).(N2).(N1)；按该条用法难度估。"
    "若词条含「变形」「变化规则」「形规则」「变ます」「ます形规则」「ない形」「て形」等活用教学："
    "禁止任何编号用法长文；输出 2～3 条 N5 短句+译文，文末必须有【接序】接续表（标本 id=521：词类／形态＋变形结果｜短说明；一类／二类／三类用；串）。"
    "若词条是读音/形态对比（如「何（なん／なに）」或标题含「区别」）："
    "禁止拆成 5～7 条场景「用法」清单；先写【区别】概括差异，再恰好 2 组对照（「なに」侧 +「なん」侧），每侧 1 条例句。"
    "只用本词条本身；禁止把其它语法点（如たことがある）塞进本条凑组数。"
    "非变形词条：每一条编号中文用法下面必须立刻跟恰好 1 条短日语例句和 1 行「译文：」。"
    "严格 1:1：有几条用法就几条例句；禁止给某一用法多造几句（否则卡片会错挂）。"
    "第 N 条用法与第 N 条例句语义必须对齐：否定推断→否定句；肯定推断→肯定句；"
    "用法「」/（）里点名的形态（如はずがない、はずなのに）必须出现在该条例句；禁止只凑条数张冠李戴。"
    "例句接续必须对应该条用法：た形用法→た形例句；辞书形／有时候→原形例句；て形→て形。禁止张冠李戴。"
    "组数=真实常用用法数：只有 1 种就 1 组，有几种写几组，禁止硬凑 2 组。"
    "例句只用简单词、不叠更难语法。不要 markdown；不要写「JLPT」「能力考」字样。"
    "全部写完后另起一行「【接序】」。接序对学生友好：能写「原形＋本语法」就写「原形」，"
    "少用「普通形」「现在肯定为词干」；な／名词特殊时短句说明（不加だ／加だ）。"
    "词类标签必须简体中文（动词／一类形容词／名词／词干）；禁止「動詞(どうし)」「一類形容詞」这类繁体+读音。"
    "形态必须带词类：写「动词た形／动词原形」，禁止裸「た形」「原形」（学生不知道是哪类词）。"
    "多用法且接续不同时用「用法1:」「用法2:」分行。"
)

CONJ_PAIR_SYSTEM = (
    "这是日语活用「变形」教学词条。学生自己记怎么变。"
    "禁止写任何编号「1.用法」长文、中文标签、行首编号。"
    "不要套普通句型的多义「1.用法」清单。"
    "先输出 2～3 条 N5 口语短句；每条下一行「译文：」+中文；每个汉字后半角括号假名。"
    "文末必须有【接序】接续表：标准标本同 id=521「～かもしれない」——"
    "每段「词类／形态＋变形结果｜短说明」，多种词类用全角「；」；卡片三列词类／形态、＋接什么、说明。"
    "て形示例（第一列写清去掉…加…；含一类／二类形容词、名词）：一类动词去掉「く」加「いて」＋いて｜如「書く→書いて」；二类动词去掉「る」加「て」＋て｜如「食べる→食べて」；一类形容词去掉「い」加「くて」＋くて｜如「高い→高くて」；二类形容词去掉「だ」加「で」＋で｜如「静か→静かで」；名词加「で」＋で｜如「学生→学生で」。"
    "禁止散文「将词尾变为…」；说明内勿用「／」。"
)

CONTRAST_PAIR_SYSTEM = (
    "这是日语读音/形态「对比区别」课（如 何＝なに／なん），不是多义句型用法清单。"
    "卡片会用表格展示（何时用 / 接续；形态写在何时用开头如「くれる：…」，不要另造读法列、不要用「我方」等中文当形态），表下再跟例句。"
    "❌ 禁止拆成 5～7 条「1.用法：…」场景清单。"
    "✅ 先写【区别】一段中文概括两者何时用、各表示什么（句末 (N5)）。"
    "再恰好 2 组：1.「なに」：…(N5) + 1 条例句+译文；2.「なん」：…(N5) + 1 条例句+译文。"
    "文末必须有【接序】（可用用法1:/用法2:）；再附【出现频率】。"
    "用法必须中文；例句汉字后半角括号假名；不要 markdown。"
)

CONNECTION_ONLY_SYSTEM = (
    "你只写日语语法的「接序」（接续形态），供中文母语初学者看卡片。"
    "第一行必须是「【接序】」，下面 2～6 行。"
    "写清词类：动词原形／一类形容词原形／二类形容词原形／名词＋本语法；禁止只写笼统「原形＋」；少用「普通形」「现在肯定为词干」。"
    "词类标签必须简体中文（动词／一类形容词／名词／词干）；禁止日语繁体词类字（動詞／形容詞／名詞／一類／語幹）；"
    "禁止词类旁假名读音括注如「動詞(どうし)」「普通形(ふつうけい)」。"
    "形态必须带词类：写「动词た形／动词原形」，禁止裸「た形」「原形」。"
    "な形容词／名词特殊时短句说明（不加だ／加だ）；多用法不同则「用法1:」「用法2:」分行。标准标本同 id=521「～かもしれない」：每段「词类／形态＋本语法｜短说明」，说明须按形态区分（辞书形≠た形），禁止多段同一句用法大意；多词类用全角「；」，多用法「用法N:」分行；卡片三列词类／形态、＋接什么、说明。"
    "日语形态用「」短引；不要假名括注；不要写用法长文、不要写例句、不要 markdown。"
)

CONNECTION_MARKER = "【接序】"


def is_conjugation_word(word: str) -> bool:
    w = str(word or "").strip()
    if not w or w.startswith(("～", "~", "〜")):
        return False
    return bool(
        re.search(
            r"变形|变化规则|形规则|变ます|変ます|ます形规则|活用规则|活用变形|ない形|て形|た形|辞書形|变否定|变过去|过去式规则|否定形规则",
            w,
        )
    )


def is_contrast_word(word: str, reading: str | None = None) -> bool:
    """读音/形态对比课：何（なん／なに）、标题含区别等。"""
    w = str(word or "").strip()
    r = str(reading or "").strip()
    if not w and not r:
        return False
    if is_conjugation_word(w):
        return False
    blob = f"{w}\n{r}"
    if re.search(
        r"[（(][^）)]*[\u3040-\u309fー]+[／/][\u3040-\u309fー]+[^）)]*[）)]",
        blob,
        re.I,
    ):
        return True
    if re.fullmatch(r"[\u3040-\u309fー]+[／/][\u3040-\u309fー]+", r):
        return True
    if re.search(r"区别|对比|対比|辨析", w):
        return True
    return False


def is_grammar_pair_still_missing(row: dict) -> bool:
    """活用变形课：须例句+接续表。句型课：用法+例句+接序。
    对比课：须已是【区别】+2 组格式（否则仍缺，避免 7 条场景用法脏数据永驻）。"""
    word = str(row.get("word") or "")
    reading = row.get("reading")
    need_examples = bool(row.get("need_examples"))
    need_usage = bool(row.get("need_usage"))
    need_connection = bool(row.get("need_connection", True))
    if "need_connection" not in row:
        need_connection = True
    if is_conjugation_word(word):
        return need_examples or need_connection
    if is_contrast_word(word, reading if isinstance(reading, str) else None):
        usage = str(row.get("usage") or "")
        has_distinction = "【区别】" in usage or "【區別】" in usage
        # 编号行超过 2 → 仍当缺失（旧 7 条场景清单）
        numbered = [
            ln
            for ln in usage.splitlines()
            if NUMBERED_LINE_RE.match(ln.strip())
        ]
        if not has_distinction or len(numbered) != 2:
            return True
    return need_usage or need_examples or need_connection


def filter_missing_pairs(missing: list) -> list:
    return [row for row in missing if is_grammar_pair_still_missing(row)]


def split_connection_section(raw: str) -> tuple[str, str | None]:
    """拆出【接序】段 → (body, connection)。"""
    text = str(raw or "").replace("\r\n", "\n").strip()
    if not text:
        return "", None
    idx = text.find(CONNECTION_MARKER)
    if idx < 0:
        return text, None
    body = text[:idx].strip()
    after = text[idx + len(CONNECTION_MARKER) :].strip()
    lines = [
        ln.strip()
        for ln in after.splitlines()
        if ln.strip() and ln.strip() != CONNECTION_MARKER
    ]
    connection = "\n".join(lines).strip() or None
    return body, connection


def parse_conjugation_examples(raw: str) -> tuple[str, str] | None:
    """变形课：只收日语+译文；usage 为空。调用前应先 split_connection_section。"""
    lines = [
        ln.strip()
        for ln in FENCE_RE.sub("", str(raw or "")).splitlines()
        if ln.strip() and not ln.strip().startswith("```")
    ]
    if not lines:
        return None
    for line in lines:
        m = NUMBERED_LINE_RE.match(line)
        if not m:
            continue
        body = m.group(2).strip()
        # 中文用法行（带或不带 (N5)）→ 拒
        if HAN_RE.search(body) and not re.search(r"\([\u3040-\u309fー]+\)", body):
            kana = re.findall(r"[\u3040-\u30ffー]", body)
            if len(kana) < 8:
                return None
    out: list[str] = []
    i = 0
    while i < len(lines):
        jp = lines[i]
        m = NUMBERED_LINE_RE.match(jp)
        if m:
            jp = m.group(2).strip()
        i += 1
        if i >= len(lines):
            return None
        gloss = lines[i]
        if not (gloss.startswith("译文") or gloss.startswith("譯文")):
            return None
        out.extend([jp, gloss])
        i += 1
    if not (4 <= len(out) <= 6):
        return None
    return "", "\n".join(out)


def load_env_file(name: str) -> dict[str, str]:
    cfg_path = CFG_DIR / name
    data: dict[str, str] = {}
    if not cfg_path.is_file():
        return data
    for line in cfg_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        data[k.strip()] = v.strip().strip('"').strip("'")
    return data


def load_token() -> str:
    token = (
        os.getenv("JP_REVIEW_UPLOAD_TOKEN")
        or load_env_file("jp-review-sync.env").get("JP_REVIEW_UPLOAD_TOKEN")
        or ""
    ).strip()
    if not token:
        raise SystemExit(
            "缺少 JP_REVIEW_UPLOAD_TOKEN（~/.config/info-quests/jp-review-sync.env）"
        )
    return token


def resolve_api_url() -> str:
    cfg = load_env_file("jp-vocab-fill.env")
    return (
        cfg.get("JP_VOCAB_FILL_USAGE_URL")
        or os.getenv("JP_VOCAB_FILL_USAGE_URL")
        or DEFAULT_API_URL
    ).strip()


def resolve_min_interval_sec() -> int:
    raw = (
        os.getenv("JP_VOCAB_FILL_GRAMMAR_MIN_INTERVAL_SEC")
        or load_env_file("jp-vocab-fill.env").get(
            "JP_VOCAB_FILL_GRAMMAR_MIN_INTERVAL_SEC"
        )
        or str(DEFAULT_MIN_INTERVAL_SEC)
    )
    try:
        return max(1, int(raw))
    except ValueError:
        return DEFAULT_MIN_INTERVAL_SEC


def resolve_poison_sec() -> int:
    raw = (
        os.getenv("JP_VOCAB_FILL_GRAMMAR_POISON_SEC")
        or load_env_file("jp-vocab-fill.env").get("JP_VOCAB_FILL_GRAMMAR_POISON_SEC")
        or str(DEFAULT_POISON_SEC)
    )
    try:
        return max(60, int(raw))
    except ValueError:
        return DEFAULT_POISON_SEC


@contextmanager
def acquire_run_lock(*, skip_if_busy: bool = False) -> Iterator[None]:
    """进程互斥。定时任务传 skip_if_busy=True：有人在补就立刻退出，绝不排队叠烧。"""
    RUN_LOCK_PATH.parent.mkdir(parents=True, exist_ok=True)
    with RUN_LOCK_PATH.open("a+", encoding="utf-8") as fh:
        try:
            fcntl.flock(fh.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            if skip_if_busy:
                print(
                    "[jp-grammar-fill] 前一任务仍在跑，本分钟跳过（防叠烧）",
                    flush=True,
                )
                raise SystemExit(0)
            print("[jp-grammar-fill] 前一任务仍在跑，等待锁…", flush=True)
            fcntl.flock(fh.fileno(), fcntl.LOCK_EX)
        fh.seek(0)
        fh.truncate()
        fh.write(str(os.getpid()))
        fh.flush()
        try:
            yield
        finally:
            fcntl.flock(fh.fileno(), fcntl.LOCK_UN)


def acquire_paid_rate_gate(*, allow_burst: bool) -> None:
    if allow_burst:
        return
    min_sec = resolve_min_interval_sec()
    RATE_GATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    now = time.time()
    last = 0.0
    if RATE_GATE_PATH.is_file():
        try:
            last = float(RATE_GATE_PATH.read_text(encoding="utf-8").strip() or 0)
        except ValueError:
            last = 0.0
    wait = min_sec - (now - last)
    if wait > 0:
        print(
            f"[jp-grammar-fill] rate-gate: 距上次付费仅 {now - last:.1f}s "
            f"< {min_sec}s，等待 {wait:.1f}s…",
            flush=True,
        )
        time.sleep(wait)


def mark_paid_call() -> None:
    RATE_GATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    RATE_GATE_PATH.write_text(str(time.time()), encoding="utf-8")


def load_poison() -> dict[str, dict]:
    if not POISON_PATH.is_file():
        return {}
    try:
        raw = json.loads(POISON_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}
    now = time.time()
    out: dict[str, dict] = {}
    for k, v in (raw or {}).items():
        try:
            until = float(v.get("until") or 0)
        except (TypeError, ValueError):
            continue
        if until > now:
            out[str(k)] = v
    return out


def save_poison(data: dict[str, dict]) -> None:
    POISON_PATH.parent.mkdir(parents=True, exist_ok=True)
    POISON_PATH.write_text(
        json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def poison_word(word_id: int, reason: str) -> None:
    data = load_poison()
    data[str(word_id)] = {
        "until": time.time() + resolve_poison_sec(),
        "reason": reason,
    }
    save_poison(data)
    print(
        f"[jp-grammar-fill] poison id={word_id} reason={reason!r} "
        f"({resolve_poison_sec()}s)",
        flush=True,
    )


def call_api(*, api_url: str, token: str, body: dict, retries: int = 6) -> dict:
    return post_worker_fill_api(
        api_url,
        token,
        body,
        user_agent=HTTP_USER_AGENT,
        timeout=120,
        retries=retries,
    )


def parse_pair_output(raw: str) -> tuple[str, str] | None:
    """拆「编号用法 + 日语 + 译文」块 → (usage, example_sentences)。"""
    lines = [
        ln.strip()
        for ln in FENCE_RE.sub("", str(raw or "")).splitlines()
        if ln.strip() and not ln.strip().startswith("```")
    ]
    if not lines:
        return None
    blocks: list[dict] = []
    cur: dict | None = None
    started = False
    for line in lines:
        m = NUMBERED_LINE_RE.match(line)
        if m:
            started = True
            if cur:
                blocks.append(cur)
            cur = {"n": int(m.group(1)), "usage": m.group(2).strip(), "body": []}
            continue
        if not started:
            continue
        if cur is None:
            return None
        cur["body"].append(line)
    if cur:
        blocks.append(cur)
    if len(blocks) < 1:
        return None
    for i, b in enumerate(blocks):
        if b["n"] != i + 1:
            return None
        if not b["usage"] or not HAN_RE.search(b["usage"]):
            return None
        # 用法须中文：只检查「」外；引号外假名括注或假名过多 → 拒
        usage = b["usage"]
        no_quotes = re.sub(r"「[^」]*」", "", usage)
        if re.search(r"\([\u3040-\u309fー]+\)", no_quotes):
            return None
        kana = re.findall(r"[\u3040-\u30ffー]", no_quotes)
        if len(kana) >= 8:
            return None
        if len(b["body"]) < 2:
            return None
        if not any(x.startswith("译文") or x.startswith("譯文") for x in b["body"]):
            return None
        # 句末须有 (N5)～(N1)（与线上 apply 对齐）
        level_m = re.search(r"^(.*)[（(]\s*N\s*([1-5])\s*[）)]\s*$", usage, re.I)
        if not level_m:
            return None
        b["usage"] = f"{level_m.group(1).rstrip()}(N{level_m.group(2)})"
    usage = "\n".join(f"{i + 1}. {b['usage']}" for i, b in enumerate(blocks))
    examples = "\n".join("\n".join(b["body"]) for b in blocks)
    return usage, examples


def pick_row(missing: list, poison: dict) -> tuple[dict | None, int]:
    skipped = 0
    for row in missing:
        wid = str(int(row["id"]))
        if wid in poison:
            skipped += 1
            print(
                f"[jp-grammar-fill] skip poisoned id={wid} "
                f"reason={poison[wid].get('reason')!r}",
                flush=True,
            )
            continue
        return row, skipped
    return None, skipped


def run_clear_pair(*, api_url: str, token: str, word_id: int, dry_run: bool) -> dict:
    payload = call_api(
        api_url=api_url,
        token=token,
        body={"mode": "clear_pair", "word_id": word_id, "dry_run": dry_run},
    )
    if payload.get("mode") != "clear_pair":
        raise SystemExit("线上尚未部署 clear_pair。请等部署完成后再清单条。")
    print(
        f"[jp-grammar-fill] clear_pair id={word_id} "
        f"cleared={payload.get('cleared')} dry_run={dry_run}",
        flush=True,
    )
    return payload


def run_clear_examples(*, api_url: str, token: str, dry_run: bool) -> dict:
    payload = call_api(
        api_url=api_url,
        token=token,
        body={"mode": "clear_grammar_examples", "dry_run": dry_run},
    )
    if payload.get("mode") != "clear_grammar_examples":
        raise SystemExit(
            "线上尚未部署 clear_grammar_examples。请等部署完成后再清。"
        )
    print(
        f"[jp-grammar-fill] clear_grammar_examples "
        f"cleared={payload.get('cleared')} dry_run={dry_run}",
        flush=True,
    )
    return payload


def run_status(*, api_url: str, token: str) -> None:
    scan = call_api(
        api_url=api_url,
        token=token,
        body={"mode": "list_missing", "limit": 1},
    )
    print(
        f"[jp-grammar-fill] status missing_pair={scan.get('total_missing')} "
        f"(usage 或缺例句，一词一次成对补)",
        flush=True,
    )


def run_one_pair(
    *,
    api_url: str,
    token: str,
    dry_run: bool,
    allow_burst: bool,
    target_word_id: int | None = None,
) -> dict:
    assert_not_killed("jp-grammar-fill")
    acquire_paid_rate_gate(allow_burst=allow_burst)
    body: dict = {"mode": "list_missing", "limit": LIST_CANDIDATE_LIMIT}
    if target_word_id and target_word_id > 0:
        # 定点重补：必须带 word_id，否则会误补 list 里别的缺例句词条
        body["word_id"] = int(target_word_id)
        body["limit"] = 1
    scan = call_api(
        api_url=api_url,
        token=token,
        body=body,
    )
    if not scan.get("ok"):
        raise SystemExit(f"API error: {scan.get('error', scan)}")
    missing = scan.get("missing") or []
    raw_total = int(scan.get("total_missing") or 0)
    missing = filter_missing_pairs(missing)
    # 旧线上 total_missing 会把「变形课已有例句」算进去；客户端按本批比例修正
    if raw_total > 0 and (scan.get("missing") or []):
        kept = len(missing)
        raw_batch = len(scan.get("missing") or [])
        total_missing = (
            max(kept, int(round(raw_total * kept / raw_batch)))
            if raw_batch > 0
            else raw_total
        )
    else:
        total_missing = len(missing) if missing else 0
    if target_word_id and target_word_id > 0:
        missing = [r for r in missing if int(r.get("id") or 0) == int(target_word_id)]
        if not missing:
            print(
                f"[jp-grammar-fill] pair 指定 id={target_word_id} 不在缺失列表"
                f"（可能已有用法+例句，或 clear 失败） total_missing={total_missing}",
                flush=True,
            )
            return {
                "ok": True,
                "updated": 0,
                "skipped_run": True,
                "reason": "target_not_missing",
                "total_missing": total_missing,
            }
    if not missing:
        print(
            f"[jp-grammar-fill] pair 无缺失（total_missing={total_missing}）",
            flush=True,
        )
        return {**scan, "total_missing": 0}

    row, skipped_poison = pick_row(missing, load_poison())
    if row is None:
        print(
            f"[jp-grammar-fill] pair 本批均毒丸（跳过 {skipped_poison}）",
            flush=True,
        )
        return {
            "ok": True,
            "skipped_run": True,
            "reason": "all_poisoned",
            "total_missing": total_missing,
        }

    word_id = int(row["id"])
    if target_word_id and target_word_id > 0 and word_id != int(target_word_id):
        raise SystemExit(
            f"内部错误：期望重补 id={target_word_id}，实际拿到 id={word_id}"
        )
    word = str(row["word"])
    is_conj = is_conjugation_word(word)
    is_contrast = (not is_conj) and is_contrast_word(
        word, str(row.get("reading") or "") or None
    )
    prompt = str(row.get("prompt") or "").strip()
    if not prompt:
        prompt = (
            f"词条：{word}\n类型：语法\n\n"
            + (
                "只写 2～3 条 N5 短句+译文；禁止用法说明与行首编号。"
                if is_conj
                else (
                    "先写【区别】概括差异，再恰好 2 组对照（各 1 条例句+译文）；禁止多条场景用法清单。"
                    if is_contrast
                    else "请一次写完：每条编号「中文」用法下紧跟 1 条例句（日语+译文：）。"
                    "组数=真实常用用法数（1 种就 1 组，禁止硬凑 2 组）。"
                )
            )
        )
    print(
        f"[jp-grammar-fill] pair {FILL_PER_ROUND}/{total_missing}: "
        f"id={word_id} {word!r} model={anthropic_model()} "
        f"conj={is_conj} contrast={is_contrast} need_usage={row.get('need_usage')} "
        f"need_examples={row.get('need_examples')} "
        f"need_connection={row.get('need_connection')}",
        flush=True,
    )
    if dry_run:
        return {
            "ok": True,
            "updated": 0,
            "dry_run": True,
            "total_missing": total_missing,
        }

    only_connection = (
        bool(row.get("need_connection"))
        and not bool(row.get("need_usage"))
        and not bool(row.get("need_examples"))
    )
    system = (
        CONNECTION_ONLY_SYSTEM
        if only_connection
        else (
            CONJ_PAIR_SYSTEM
            if is_conj
            else (CONTRAST_PAIR_SYSTEM if is_contrast else PAIR_SYSTEM)
        )
    )
    try:
        raw = call_anthropic(
            prompt,
            system=system,
            max_tokens=4096,
            temperature=0.2,
            timeout=180,
        )
    except Exception as exc:  # noqa: BLE001
        mark_paid_call()
        poison_word(word_id, f"anthropic_error:{exc}")
        after_attempt(
            scope="jp-grammar",
            word_id=word_id,
            word=word,
            fixed=False,
            detail=f"anthropic_error:{exc}",
        )
        return {"ok": True, "updated": 0, "error": str(exc), "total_missing": total_missing}

    mark_paid_call()

    oral_freq: int | None = None
    exam_freq: int | None = None

    def retry_pair(reason: str) -> tuple[str, str, str | None] | None:
        print(f"  {reason}，追加 CRITICAL 再试 1 次…", flush=True)
        acquire_paid_rate_gate(allow_burst=allow_burst)
        core = re.sub(r"^[～~〜]+|[～~〜]+$", "", word)
        if only_connection:
            retry_prompt = (
                prompt
                + "\n\nCRITICAL:\n"
                + f"- 第一行必须是「{CONNECTION_MARKER}」。\n"
                + "- 只写接序；不要用法、不要例句。\n"
            )
            sys_msg = CONNECTION_ONLY_SYSTEM
        elif is_conj:
            retry_prompt = (
                prompt
                + "\n\nCRITICAL:\n"
                + "- 禁止任何编号用法/规则/中文标签/行首编号。\n"
                + "- 只输出 2～3 条日语短句，每条下一行「译文：」。\n"
                + "- 汉字后半角括号假名；N5 口语。\n"
                + f"- 文末必须有「{CONNECTION_MARKER}」接续表（词类／形态＋变形结果｜短说明；一类／二类／三类）。\n"
            )
            sys_msg = CONJ_PAIR_SYSTEM
        elif is_contrast:
            retry_prompt = (
                prompt
                + "\n\nCRITICAL:\n"
                + "- 先写【区别】一段中文（句末 (N5)）。\n"
                + "- 恰好 2 组对照：1.「なに」… + 例句+译文；2.「なん」… + 例句+译文。\n"
                + "- 禁止拆成多条场景「用法」清单。\n"
                + f"- 文末必须有「{CONNECTION_MARKER}」接序段。\n"
            )
            sys_msg = CONTRAST_PAIR_SYSTEM
        else:
            retry_prompt = (
                prompt
                + "\n\nCRITICAL:\n"
                + "- 第一行必须是「1.」中文用法；每组必须完整：中文用法 + 日语例句 + 译文：\n"
                + "- 用法必须中文；「」短引日语形态时「」内不要假名括注；用法禁止写接序清单。\n"
                + f"- 例句必须自然用到「{core}」（中文教学标题除外）；汉字后半角括号假名。\n"
                + "- 组数=真实常用用法数（1 种就 1 组，禁止硬凑）。\n"
                + f"- 文末必须有「{CONNECTION_MARKER}」接序段。\n"
            )
            sys_msg = PAIR_SYSTEM
        try:
            raw2 = call_anthropic(
                retry_prompt,
                system=sys_msg,
                max_tokens=4096,
                temperature=0.15,
                timeout=180,
            )
        except Exception as exc:  # noqa: BLE001
            mark_paid_call()
            poison_word(word_id, f"anthropic_retry_error:{exc}")
            return None
        mark_paid_call()
        return parse_fill_output(
            raw2,
            is_conj=is_conj,
            only_connection=only_connection,
        )

    def parse_fill_output(
        text: str, *, is_conj: bool, only_connection: bool
    ) -> tuple[str, str, str | None] | None:
        nonlocal oral_freq, exam_freq
        text, o, e = extract_jp_vocab_frequencies(text)
        if o is not None:
            oral_freq = o
        if e is not None:
            exam_freq = e
        body, connection = split_connection_section(text)
        if only_connection:
            if not connection:
                # 整段可能就是接序（模型忘了写标记）
                connection = body.strip() or None
                body = ""
            if not connection:
                return None
            return "", "", connection
        if is_conj:
            parsed = parse_conjugation_examples(body or text)
            if not parsed:
                return None
            usage, examples = parsed
            # 变形课也须接续表（标本 id=521 式一类／二类／三类）
            if not connection:
                return None
            return usage, examples, connection
        if not connection:
            return None
        parsed = parse_pair_output(body)
        if not parsed:
            return None
        usage, examples = parsed
        return usage, examples, connection

    parsed = parse_fill_output(raw, is_conj=is_conj, only_connection=only_connection)
    if not parsed:
        print(f"  成对/接序解析失败 raw={str(raw)[:200]!r}", flush=True)
        parsed = retry_pair("成对/接序解析失败")
        if not parsed:
            poison_word(word_id, "invalid:pair_parse")
            after_attempt(
                scope="jp-grammar",
                word_id=word_id,
                word=word,
                fixed=False,
                detail="invalid:pair_parse",
            )
            return {"ok": True, "updated": 0, "total_missing": total_missing}

    usage, examples, connection = parsed
    source = build_online_source_label()
    print(
        f"  {word_id} {word!r} -> usage_ok examples_len={len(examples)} "
        f"connection_len={len(connection or '')} source={source}",
        flush=True,
    )

    def do_apply(u: str, ex: str, conn: str | None) -> dict:
        update: dict = {
            "word_id": word_id,
            "source": source,
            "connection": conn,
        }
        if only_connection:
            update["usage"] = ""
        else:
            update["usage"] = u
            update["example_sentences"] = ex
        if oral_freq is not None:
            update["oral_frequency"] = oral_freq
        if exam_freq is not None:
            update["exam_frequency"] = exam_freq
        return call_api(
            api_url=api_url,
            token=token,
            body={
                "mode": "apply",
                "source": source,
                "updates": [update],
            },
        )

    payload = do_apply(usage, examples, connection)
    if not payload.get("ok"):
        poison_word(word_id, "apply_failed")
        after_attempt(
            scope="jp-grammar",
            word_id=word_id,
            word=word,
            fixed=False,
            detail="apply_failed",
        )
        raise SystemExit(f"API error: {payload.get('error', payload)}")
    skipped = payload.get("skipped") or []
    if skipped and not payload.get("updated"):
        reason = str(skipped[0].get("reason") or "apply_skipped")
        if "invalid_format" in reason:
            parsed2 = retry_pair(f"apply 拒收 {reason}")
            if not parsed2:
                poison_word(word_id, f"apply_skipped:{reason}")
                after_attempt(
                    scope="jp-grammar",
                    word_id=word_id,
                    word=word,
                    fixed=False,
                    detail=f"apply_skipped:{reason}",
                )
                return {"ok": True, "updated": 0, "total_missing": total_missing}
            usage, examples, connection = parsed2
            payload = do_apply(usage, examples, connection)
            skipped = payload.get("skipped") or []
            if skipped and not payload.get("updated"):
                poison_word(word_id, f"apply_skipped:{skipped[0].get('reason')}")
            else:
                print("  重试写回成功", flush=True)
        else:
            poison_word(word_id, f"apply_skipped:{reason}")

    updated_n = int(payload.get("updated") or 0)
    # 客户端判定是否真正搞定（变形课有例句+接序即可；勿因 usage 空反复计数空烧）
    fixed = False
    fail_detail = "no_update"
    if updated_n > 0 and not (payload.get("skipped") or []):
        still = is_grammar_pair_still_missing(
            {
                "word": word,
                "need_usage": (not str(usage or "").strip()) and not is_conj,
                "need_examples": not str(examples or "").strip(),
                "need_connection": not str(connection or "").strip(),
            }
        )
        fixed = not still
        if still:
            fail_detail = (
                "apply_ok_but_still_missing:"
                f"conj={is_conj} usage_len={len(str(usage or ''))} "
                f"examples_len={len(str(examples or ''))} "
                f"connection_len={len(str(connection or ''))}"
            )
        else:
            fail_detail = "updated"
    elif updated_n > 0:
        # apply 部分成功但有 skipped → 未搞定
        fixed = False
        sk = payload.get("skipped") or []
        fail_detail = f"apply_partial_skipped:{sk[0].get('reason') if sk else 'unknown'}"
    after_attempt(
        scope="jp-grammar",
        word_id=word_id,
        word=word,
        fixed=fixed,
        detail=fail_detail if not fixed else "updated",
    )

    remaining = max(0, total_missing - (1 if updated_n else 0))
    print(
        f"[jp-grammar-fill] pair apply updated={payload.get('updated')} "
        f"remaining≈{remaining}",
        flush=True,
    )
    return {**payload, "total_missing": remaining}


def parse_refill_ids(raw: str) -> list[int]:
    ids: list[int] = []
    seen: set[int] = set()
    for part in re.split(r"[\s,;]+", str(raw or "").strip()):
        if not part:
            continue
        try:
            wid = int(part)
        except ValueError as exc:
            raise SystemExit(f"--refill-ids 含非法 id: {part!r}") from exc
        if wid <= 0 or wid in seen:
            continue
        seen.add(wid)
        ids.append(wid)
    if not ids:
        raise SystemExit("--refill-ids 为空")
    return ids


def refill_ids_one_by_one(
    *,
    api_url: str,
    token: str,
    word_ids: list[int],
    dry_run: bool,
    allow_burst: bool,
) -> None:
    """全量/指定列表：严格一条一条 clear + 成对补。绝不并行。"""
    total = len(word_ids)
    print(
        f"[jp-grammar-fill] refill 队列共 {total} 条；"
        f"串行：补完一条再下一条（禁止并行）",
        flush=True,
    )
    ok_n = 0
    fail_n = 0
    for i, word_id in enumerate(word_ids, start=1):
        print(
            f"\n======== [{i}/{total}] CLEAR+REFILL id={word_id} ========",
            flush=True,
        )
        try:
            run_clear_pair(
                api_url=api_url,
                token=token,
                word_id=word_id,
                dry_run=dry_run,
            )
            if dry_run:
                continue
            result = run_one_pair(
                api_url=api_url,
                token=token,
                dry_run=False,
                allow_burst=allow_burst,
                target_word_id=word_id,
            )
            if int(result.get("updated") or 0) > 0:
                ok_n += 1
                print(f"[jp-grammar-fill] [{i}/{total}] id={word_id} 成功", flush=True)
            else:
                fail_n += 1
                print(
                    f"[jp-grammar-fill] [{i}/{total}] id={word_id} 未写回 "
                    f"reason={result.get('reason') or result.get('error') or 'unknown'}",
                    flush=True,
                )
        except SystemExit as exc:
            fail_n += 1
            print(
                f"[jp-grammar-fill] [{i}/{total}] id={word_id} 失败: {exc}",
                flush=True,
            )
        except Exception as exc:  # noqa: BLE001
            fail_n += 1
            print(
                f"[jp-grammar-fill] [{i}/{total}] id={word_id} 异常 "
                f"{type(exc).__name__}: {exc}",
                flush=True,
            )
    print(
        f"\n[jp-grammar-fill] refill 结束：成功 {ok_n} / 失败 {fail_n} / 共 {total}",
        flush=True,
    )


# --loop：有待补 3 分钟一轮；暂无 / 毒丸冷却 10 分钟再扫（禁止秒级空转打 Worker）
LOOP_BUSY_SEC = 3 * 60
LOOP_IDLE_SEC = 10 * 60


def loop_pair(
    *,
    api_url: str,
    token: str,
    dry_run: bool,
    allow_burst: bool,
    max_rounds: int,
) -> None:
    rounds = 0
    print(
        f"[jp-grammar-fill] loop pair(用法+例句同次) "
        f"busy={LOOP_BUSY_SEC}s idle={LOOP_IDLE_SEC}s "
        f"(paid_gate≥{resolve_min_interval_sec()}s) "
        f"max_rounds={max_rounds or '∞'}",
        flush=True,
    )
    while True:
        rounds += 1
        if max_rounds > 0 and rounds > max_rounds:
            print(
                f"[jp-grammar-fill] 达到 max_rounds={max_rounds}，停止"
                f"（请确认无误后再 --loop 全量）",
                flush=True,
            )
            break
        try:
            result = run_one_pair(
                api_url=api_url,
                token=token,
                dry_run=dry_run,
                allow_burst=allow_burst,
            )
        except SystemExit as exc:
            wait = LOOP_BUSY_SEC
            print(
                f"[jp-grammar-fill] 本轮失败（{exc}），{wait}s 后继续…",
                flush=True,
            )
            time.sleep(wait)
            continue
        except Exception as exc:  # noqa: BLE001
            wait = LOOP_BUSY_SEC
            print(
                f"[jp-grammar-fill] 本轮异常 {type(exc).__name__}: {exc}，"
                f"{wait}s 后继续…",
                flush=True,
            )
            time.sleep(wait)
            continue

        if result.get("skipped_run") and result.get("reason") == "all_poisoned":
            wait = LOOP_IDLE_SEC
            print(
                f"[jp-grammar-fill] 毒丸冷却中，{wait}s 后再扫…",
                flush=True,
            )
            time.sleep(wait)
            continue
        # 注意：0 是 falsy，禁止 `or -1`（会当成 -1 永不 idle）
        left_raw = result.get("total_missing")
        left = int(left_raw) if left_raw is not None else -1
        if left == 0:
            wait = LOOP_IDLE_SEC
            print(
                f"[jp-grammar-fill] 暂无待补，{wait}s 后再扫…",
                flush=True,
            )
            time.sleep(wait)
            continue
        wait = LOOP_BUSY_SEC
        print(
            f"[jp-grammar-fill] pair 仍缺约 {left}，{wait}s 后下一轮…",
            flush=True,
        )
        time.sleep(wait)


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "日语语法用法+例句：一词一次付费成对写回（禁止拆成两次模型调用）"
        )
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--clear-examples", action="store_true")
    parser.add_argument(
        "--word-id",
        type=int,
        default=0,
        help="先 clear_pair 再成对重补这一条（修日语用法/硬凑组数后用）",
    )
    parser.add_argument("--status", action="store_true")
    parser.add_argument(
        "--skip-if-busy",
        action="store_true",
        help="拿不到互斥锁则立刻退出（定时任务必须开，防叠烧）",
    )
    parser.add_argument(
        "--refill-ids",
        type=str,
        default="",
        help="逗号/空格分隔 id：严格一条一条 clear+成对补（全量重表用）",
    )
    parser.add_argument(
        "--loop",
        action="store_true",
        help="只补「缺用法或缺例句」的；务必先 --max-rounds 2～3 冒烟",
    )
    parser.add_argument(
        "--max-rounds",
        type=int,
        default=0,
        help="最多补几条（冒烟用 2～3；0=不限制，仅 --loop 时）",
    )
    parser.add_argument(
        "--allow-burst",
        action="store_true",
        help="跳过 1s 门禁（仅调试；禁止写进定时）",
    )
    parser.add_argument(
        "--phase",
        choices=["pair"],
        default="pair",
        help="仅保留 pair（用法+例句同次）；旧 usage/examples 分阶段已废弃",
    )
    args = parser.parse_args()

    token = load_token()
    api_url = resolve_api_url()

    # 定时每分钟唤醒；命中 1027 后负缓存 10 分钟，避免反复探首页/打 API
    if not args.status and skip_if_worker_unavailable(
        api_url, label="jp-grammar-fill"
    ):
        return 0

    with acquire_run_lock(skip_if_busy=args.skip_if_busy):
        if args.status:
            run_status(api_url=api_url, token=token)
            return 0

        if args.refill_ids.strip():
            refill_ids_one_by_one(
                api_url=api_url,
                token=token,
                word_ids=parse_refill_ids(args.refill_ids),
                dry_run=args.dry_run,
                allow_burst=args.allow_burst,
            )
            return 0

        if args.clear_examples:
            run_clear_examples(api_url=api_url, token=token, dry_run=args.dry_run)
            if not args.loop and args.max_rounds <= 0 and args.word_id <= 0:
                return 0

        if args.word_id > 0:
            run_clear_pair(
                api_url=api_url,
                token=token,
                word_id=args.word_id,
                dry_run=args.dry_run,
            )
            if args.dry_run:
                return 0
            # 清完后立刻成对补这一条（必须带 word_id，禁止误补 list 里其它词）
            run_one_pair(
                api_url=api_url,
                token=token,
                dry_run=False,
                allow_burst=args.allow_burst,
                target_word_id=args.word_id,
            )
            return 0

        if args.loop or args.max_rounds > 0:
            max_rounds = args.max_rounds
            if args.loop and max_rounds <= 0:
                print(
                    "[jp-grammar-fill] 警告：全量 --loop 无 max_rounds。"
                    "若尚未冒烟，请 Ctrl+C，改用 --max-rounds 2",
                    flush=True,
                )
            loop_pair(
                api_url=api_url,
                token=token,
                dry_run=args.dry_run,
                allow_burst=args.allow_burst,
                max_rounds=max_rounds if max_rounds > 0 else (1 if not args.loop else 0),
            )
            return 0

        # 默认 / 定时：只补 1 条缺失（用法或缺例句）
        run_one_pair(
            api_url=api_url,
            token=token,
            dry_run=args.dry_run,
            allow_burst=args.allow_burst,
        )
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
