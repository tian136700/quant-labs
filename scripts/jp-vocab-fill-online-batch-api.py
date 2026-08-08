#!/usr/bin/env python3
"""日语词条：线上付费 API 一词一次补齐（单词 / 语法智能分支）。

与英语 en-vocab-fill-online-batch-api.py 同模式：Mac 调 tokken Anthropic，
Worker 只负责 list_missing / apply（禁止 Worker 内调模型）。

单词缺项：读音、释义、词性、例句、相关构词、口语/考试出现频率（1～10）
语法缺项：用法（含每用法 [口语n|考试m]）、接序、例句（变形课：例句+接续表；usage 空）

仅在 JP_VOCAB_FILL_LLM_BACKEND=1 时由 jp-vocab-fill-unified-stage.sh 调用。
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import re
import sys
import time
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts" / "lib"))

from jp_vocab_fill_common import call_api, resolve_token  # noqa: E402
from jp_vocab_llm_backend import backend_label, is_online_backend  # noqa: E402
from jp_vocab_example_furigana import (  # noqa: E402
    build_furigana_retry_hint,
    describe_chinese_prose_in_examples,
    describe_incomplete_furigana,
    merge_fill_payload,
)
from jp_vocab_frequency import clamp_freq  # noqa: E402
from jp_vocab_online_batch_fixed import (  # noqa: E402
    GRAMMAR_CONJ_KEYS,
    GRAMMAR_PATTERN_KEYS,
    WORD_FREQUENCY_KEYS,
    WORD_REQUIRED_KEYS,
    evaluate_online_batch_fixed,
    full_refresh_needs as _full_refresh_needs,
    merge_needs_from_missing_flags,
    required_keys_from_needs,
    still_missing_detail_from_rows,
)
from jp_vocab_online_batch_runtime import (  # noqa: E402
    acquire_paid_rate_gate,
    load_poison,
    mark_paid_call,
    mark_poison,
    now_local_str,
    report_word_run_to_maintenance_center,
    resolve_min_interval_sec,
)
from paid_anthropic_client import (  # noqa: E402
    build_online_source_label,
    call_anthropic,
)
from vocab_fill_circuit_breaker import (  # noqa: E402
    after_attempt,
    assert_not_killed,
)
from worker_api_guard import skip_if_worker_unavailable  # noqa: E402
from vocab_fill_quiz_gate import skip_if_quiz_gate_quiet  # noqa: E402

BASE = "https://finance.info-quests.com"
READING_URL = f"{BASE}/api/jp-vocab/fill-reading"
MEANING_URL = f"{BASE}/api/jp-vocab/fill-meaning"
USAGE_URL = f"{BASE}/api/jp-vocab/fill-usage"
EXAMPLES_URL = f"{BASE}/api/jp-vocab/fill-example-sentences"

HARD_ONLINE_LIMIT = 1

FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE | re.IGNORECASE)
EXAMPLE_JLPT_TAIL_RE = re.compile(
    r"^(.*?)([。！？…])\s*[（(]\s*N\s*([1-5])\s*[）)]\s*$",
    re.I,
)

WORD_SYSTEM = (
    "你为中文母语的日语 N5/N4 初学者补全「单词」闪卡。"
    "只输出一个 JSON 对象，不要 markdown 围栏、不要解释。"
    "【硬规则】无论库里缺哪一项，每次都必须一次性输出该单词的全部字段，禁止只补缺项："
    "reading（假名读音）、meaning（中文释义）、pos（中文词性）、"
    "example_sentences（例句字符串）、related_compounds（相关构词多行字符串）、"
    "oral_frequency（口语出现频率 1～10 整数）、exam_frequency（考试/JLPT 出现频率 1～10 整数）。"
    "口语=日常会话常见度；考试=JLPT 常见度；两分可不同。禁止输出小数/字符串分。"
    "单词没有接序，禁止输出 connection / usage 字段。"
    "释义：最常用 1～3 个中文义项，用「；」连接，常用在前；"
    "一词多种读音/大义项（与 reading 斜杠对应）用半角 / 分隔，如「前面；以前/前面的；预先的」。"
    "词性：中文（名词/他动词/自动词/动词/い形容词/な形容词/副词…），多词性用 /。"
    "动词尽量区分：他动词→「他动词」；自动词→「自动词」；不分或不清楚→「动词」。"
    "例句：字符串（不要 JSON 数组）。每条日语一行（汉字须半角括号假名），"
    "句末标 JLPT 等级 (N5)/(N4)，下一行必须「译文：」+自然中文。"
    "【译文标签·必守】只用中文「译文：」；禁止日文「訳文：」「訳：」或「译文：訳文：」叠标签。"
    "N5～N4 短句，焦点在本单词，不要塞难语法。"
    "条数：释义含 / 时每段 1 句；否则 max(2, 常用用法数)。"
    "な形容词「〜だ」造句用词干，不必写「だ」。"
    "【一类形容词过去·必守】かった后接です／ですね，禁止叠でした："
    "❌面白かったでした → ✅面白かったです；名词／な形容词过去才用でした。"
    "【例句用词】须自然用到该词条：优先写词条汉字（如「貰う」写成 貰(もら)う），"
    "每个汉字立刻半角括号假名；禁止只用假名读音而完全不出现词条汉字（除非词条本身无汉字）。"
    "【假名全覆盖·必守】句中每一个汉字都要标，不能只标词条："
    "❌私の趣味(しゅみ)は…（「私」漏标）→ ✅私(わたし)の趣味(しゅみ)は…；"
    "常见易漏：私(わたし)、今日(きょう)、音楽(おんがく)、何(なん)/何(なに)、人(ひと)、時(とき)。"
    "漏标时会退回给你点名缺哪句/哪个字，请整份重写例句后再交，不要只改一个字拼进旧句。"
    "【熟语假名·必守】二字以上熟语必须整词标假名，禁止按训读拆开；读音须正确（该连浊必须浊化）："
    "✅出発(しゅっぱつ)／日本語(にほんご)／土曜日(どようび)／図書館(としょかん)；"
    "❌出(で)発(ぱつ)（读成でぱつ，错）、❌日本(にっぽん)語(ご)、❌土曜(どよう)日(ひ)、"
    "❌消防(しょうぼう)車(しょうぼうしゃ)（后字吞掉整词读音）。"
    "连浊：✅入口(いりぐち)／出口(でぐち)／手紙(てがみ)；"
    "❌入口(いりくち)／出口(でくち)／手紙(てかみ)（该浊却标清音，会误导学生）。"
    "【相关构词·同一次输出】related_compounds：含本词汉字的助记词；"
    "单汉字：同读简单词（口→入口）；允许连浊（くち→ぐち、こと→ごと）；禁止不同音读（事=こと 勿写 食事/大事 的じ）；"
    "多字词：必须拆开汉字，原则上每个汉字各配 1 个学生已学过的 N5～N4 基础常用词；"
    "候选不得包含完整原词，禁止把原词加前后缀变成新词组；"
    "例：自然→自分(じぶん)：自己｜名词 + 全然(ぜんぜん)：完全，根本｜副词；"
    "❌自然界／自然科学（只是扩展原词，不能拆字助记）；逐字词允许同位置首字清浊变化（自：し→じ）；"
    "较长词可拆自然部件（会社員→会社(かいしゃ)：公司｜名词 + 店員(てんいん)：店员｜名词）；"
    "【禁止本词】不要把词条本身写进相关构词（研修生≠再写研修生；企業≠再写企業）；相关=别的词；"
    "【整词假名·必守】每行「漢字(かな)：中文｜词性」——假名括号包住整词："
    "✅決まり(きまり)：规定｜名词　❌決(き)まり：规定；✅知らせ(しらせ)：通知｜名词　❌知(し)らせ：通知；"
    "【词性·必填】行末全角「｜」接词性（名词/他动词/自动词/动词/い形容词/な形容词/副词…）；"
    "例：迎え(むかえ)：迎接｜名词；出迎える(でむかえる)：出去迎接｜他动词。"
    "词条本身无汉字（如フランスじん）→ related_compounds 填 \"\"，例句须原样出现词条假名串，"
    "禁止改写成汉字（❌フランス人(じん)）。"
    "与 reading/meaning/pos/example_sentences/oral_frequency/exam_frequency 同一次 JSON，禁止另开请求。"
    "条数：没有自然相关词 → \"\"（禁止硬凑）；只有 1～2 个就写 1～2；多则最多 4～5 条。"
    "一词多义用「，」（目上：上级，长辈｜名词），释义禁止「；」；"
    "优先 N5～N4，禁止商务难词；假名须正确。"
    "例：入口(いりぐち)：入口｜名词\\n出口(でぐち)：出口｜名词\\n目上(めうえ)：上级，长辈｜名词；"
    "多字例：会社(かいしゃ)：公司｜名词\\n店員(てんいん)：店员｜名词。"
)

GRAMMAR_SYSTEM = (
    "你为中文母语的日语 N5～N2 学习者补全「语法」闪卡。"
    "只输出一个 JSON 对象，不要 markdown。"
    "【硬规则】无论库里缺哪一项，每次都必须一次性输出该语法的全部相关字段，禁止只补缺项。"
    "语法没有释义/词性/读音，禁止输出 reading / meaning / pos。"
    "句型语法字段：usage（编号中文用法）、"
    "example_sentences（多用法：与用法严格 1:1；仅 1 种用法：恰好 3 条例句，按接续不同类型各造；日语+译文交替纯文本，不要接序段）、"
    "connection（接序正文，不要【接序】标记）。"
    "【课次难度】若词条有教材课次（如标日初级上册第23课），例句用该课附近词汇，禁止明显超纲（初级勿写中级/N2 难词）。"
    "【用法·必守】必须中文说明；「」内可短引日语形态；句末半角 (N5)/(N4)…；"
    "每条编号后必须带出现分：[口语n|考试m]（各 1～10），例："
    "1. [口语9|考试8] 表示……。(N4)；❌禁止漏掉口语/考试分。"
    "用法正文禁止大段日语、禁止写成接续说明（接在…／构成…放到 connection）。"
    "❌用法正文禁止以「接在…」开头（会被剥光只剩 (N4) → usage_empty_after_strip）："
    "✅「表示某人所在的地方，相当于「……那里」」❌「接在人物名词后，表示…」。"
    "❌用法行禁止 漢字(かな) 假名括注（会被拒 usage_not_chinese）："
    "❌「用(も)于列举」→ ✅「用于列举」；「」内也不要假名括注。"
    "假名括注只允许出现在 example_sentences 的日语行。"
    "【接序·必守】必须含「＋」公式或「用法N:」分行；写清词类："
    "一类动词／二类动词／三类动词／一类形容词／二类形容词／名词；"
    "动词辞书形须写成「动词辞书形（动词原形）」；"
    "动词分类对照（❌禁止左边 → ✅必须写右边）："
    "五段／五段动词／一類動詞 → 一类动词；"
    "一段／一段动词 → 二类动词；"
    "カ变／カ変動詞／サ变／サ変動詞／する・くる不规则 → 三类动词；"
    "❌禁止「一类动词（五段）」括注同义；词类用简体不要「一類動詞」；"
    "❌禁止无「＋」的长散文（会被剥空导致 connection_invalid:empty）→ ✅改成「词类＋接什么｜短说明」；"
    "感叹词/独立表达也须公式：感叹词独立使用＋あっ｜突然想起时放在句首。"
    "句首接续词（しかし／でも／ところが等）也须公式，禁止只写散文「置于后句句首」："
    "前句（动词句／一类形容词句／二类形容词句／名词句）＋しかし｜后句句首，表示转折；"
    "JSON 的 connection 字段禁止省略、禁止空串。"
    "【接序≠用法·必守】connection 只写形态公式（词类＋形＋本语法）；"
    "❌禁止在 connection／「｜」说明列写：主语是谁、主语必须、受益者是谁、给予者是谁、"
    "恩惠流向、必须是第三方、可互换、视角不同、强调好意／获益——那些只写 usage；"
    "「｜」后只允许接续短注（如「给东西」「帮忙做事」）。"
    "多形态用全角「；」且每段自带「＋」；❌不要「が／は」斜杠串助词（会被拆断）。"
    "【对比区别课·必守】词条标题含「区别／对比／辨析」或假名并列"
    "（なに／なん、くれる／もらう、これ／あれ（人を指す）等）："
    "❌禁止拆成 3～7 条场景「1.用法」；❌不要普通句型的 [口语n|考试m]；"
    "✅ usage 先写【区别】一段中文概括（句末 (N5)），再恰好 2 组："
    "1. 「くれる」：…(N5) + 1 条例句；2. 「もらう」：…(N5) + 1 条例句；"
    "connection 示例："
    "用法1: 他人＋が＋我＋に＋名词＋をくれる｜给东西；动词て形＋くれる｜帮忙做事\\n"
    "用法2: 我＋は＋他人＋に＋名词＋をもらう｜得到东西；动词て形＋もらう｜请人做事。"
    "【译文标签·必守】例句下一行只用「译文：」；禁止「訳文：」「訳：」或叠标签。"
    "【一类形容词过去·必守】かった后接です／ですね，禁止叠でした（双过去）："
    "❌面白かったでしたね → ✅面白かったですね；名词／二类形容词才用でした／でしたね。"
    "组数=真实常用用法数；禁止多造例句；例句接续须对应该条用法（た形／原形／て形勿张冠李戴）。"
    "例句只用简单词；句中每个汉字须半角括号假名；译文行禁止写成无标签的中文句（否则会被当成日语漏标）。"
    "语法核是假名时（あたり／ところ）优先写假名；写「辺り／所」亦可但读音须对（あたり≠へん）。"
    "❌禁止在 example_sentences 的日语行写中文教学说明（如「一类动词て形变形时…」「促音便要去掉う加って」）；"
    "规则说明只写 usage 或 connection，例句必须是完整日语句子。"
    "【熟语假名·必守】二字以上熟语整词标假名；该连浊必须浊化："
    "✅出発(しゅっぱつ)／入口(いりぐち)；❌出(で)発(ぱつ)、❌入口(いりくち)、❌日本(にっぽん)語(ご)。"
    "若词条是「变形/ます形规则/て形/ない形/变否定」等活用教学："
    "输出 example_sentences（2～3 条 N5 短句+译文）+ connection（接续表："
    "一类／二类／三类「词类／形态＋变形结果｜短说明」；标本 id=521 风格；"
    "ない形须按词尾「去掉…加…＋ない｜如「…→…」」；"
    "❌「一類動詞（五段動詞）」「う段→あ段」散文 → ✅「一类动词去掉「く」加「かない」＋かない｜如「書く→書かない」」；"
    "❌接序下「例：」行 → ✅例子写在「｜」后说明列）；"
    "usage 必须是空字符串 \"\"（变形课不要编号用法、不要口语/考试分）。"
)


def _load_helper_module(filename: str, alias: str):
    path = ROOT / "scripts" / filename
    spec = importlib.util.spec_from_file_location(alias, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {path}")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def is_conjugation_word(word: str) -> bool:
    grammar_mod = _load_helper_module(
        "jp-vocab-fill-grammar-usage-examples-api.py", "_jp_grammar_helpers"
    )
    return grammar_mod.is_conjugation_word(word)


def is_contrast_word(word: str, reading: str | None = None) -> bool:
    """与 grammar 脚本 / Worker 对齐（含 これ／あれ 内嵌假名并列）。"""
    grammar_mod = _load_helper_module(
        "jp-vocab-fill-grammar-usage-examples-api.py", "_jp_grammar_helpers"
    )
    return grammar_mod.is_contrast_word(word, reading)


def full_refresh_needs(kind: str, word: str) -> dict[str, bool]:
    return _full_refresh_needs(
        kind, word, is_conjugation=is_conjugation_word
    )


GLOSS_LABEL_RE = re.compile(r"^(译文|翻譯|翻译|译|譯|訳文|訳)\s*[:：]\s*")
LEADING_SLASH_RE = re.compile(r"^[\s／/]+")


def normalize_example_jlpt_tail(line: str) -> str:
    text = str(line or "").strip()
    m = EXAMPLE_JLPT_TAIL_RE.match(text)
    if not m:
        return text
    return f"{m.group(1)}{m.group(2)}(N{m.group(3)})"


def format_example_gloss_line(line: str) -> str:
    """剥「訳文：」/叠标签/行首斜杠，统一成「译文：」+中文。

    Claude 常写日文「訳文：」；若不在写库前转成「译文：」，
    apply 会拒 gloss_has_yakuwen_label 并 6h poison。
    """
    body = str(line or "").strip()
    for _ in range(8):
        nxt = GLOSS_LABEL_RE.sub("", body)
        nxt = LEADING_SLASH_RE.sub("", nxt).strip()
        if nxt == body:
            break
        body = nxt
    return f"译文：{body}" if body else ""


def normalize_example_sentences_block(value: Any) -> str:
    if not value:
        return ""
    text = str(value).strip()
    if not text:
        return ""
    lines: list[str] = []
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        # 含日文「訳文：」/「訳：」也必须走译文规范化（旧逻辑只认「译文」会漏掉）
        if GLOSS_LABEL_RE.match(line) or line.startswith(("/", "／")):
            gloss = format_example_gloss_line(line)
            if gloss:
                lines.append(gloss)
            continue
        lines.append(normalize_example_jlpt_tail(line))
    return "\n".join(lines).strip()


def parse_json_object(raw: str) -> dict[str, Any]:
    from llm_json_parse import parse_llm_json_object

    return parse_llm_json_object(raw)


def required_keys_for_row(row: dict[str, Any]) -> tuple[str, ...]:
    return required_keys_from_needs(row, is_conjugation=is_conjugation_word)


def build_prompt(row: dict[str, Any], *, full_bundle: bool = True) -> str:
    word = str(row.get("word") or "").strip()
    kind = str(row.get("kind") or "word")
    kind_label = "语法" if kind == "grammar" else "单词"
    req_keys = required_keys_for_row(row)
    needs = row.get("needs") if isinstance(row.get("needs"), dict) else {}

    if kind == "word":
        bundle_rule = (
            "必须一次性输出 JSON 的全部字段（即使库里只有例句缺失，也要重写"
            "读音/释义/词性/例句/相关构词/口语频率/考试频率）："
            "reading, meaning, pos, example_sentences, related_compounds, "
            "oral_frequency, exam_frequency。"
            "oral_frequency / exam_frequency 为 1～10 整数（口语=会话；考试=JLPT）。"
            "禁止输出 connection、usage（单词没有接序）。"
            "related_compounds 与其它字段同一次输出；格式：每行 漢字(かな)：中文｜词性"
            "（整词假名，❌決(き)まり ✅決まり(きまり)；词性如 名词/他动词/自动词/动词）；"
            "须与本词同读（允许连浊）；不同音读不要写；禁止写本词自己；"
            "没有自然同读相关词填 \"\"（禁止硬凑）；少则 1～2，多则最多 4～5。"
        )
    elif is_conjugation_word(word):
        want_ex = bool(needs.get("example_sentences", True))
        want_conn = bool(needs.get("connection", True))
        parts: list[str] = []
        if want_ex:
            parts.append("example_sentences（2～3 条 N5 短句+译文）")
        if want_conn:
            parts.append(
                "connection（接续表：一类／二类／三类；词类／形态＋变形结果｜短说明）"
            )
        bundle_rule = (
            "变形课："
            + ("必须一次性输出 " + " + ".join(parts) if parts else "按 JSON 键输出")
            + "；usage 必须是空字符串 \"\"；禁止编号用法长文。"
        )
    elif is_contrast_word(word, row.get("reading") if isinstance(row.get("reading"), str) else None):
        bundle_rule = (
            "本条是读音/形态对比课（如 これ／あれ、なに／なん）："
            "必须一次性输出 usage、example_sentences、connection。"
            "usage 必须先写【区别】一段中文（句末 (N4)/(N5)），再恰好 2 组："
            "1. 「形态A」：…(Nn) + 1 条例句；2. 「形态B」：…(Nn) + 1 条例句；"
            "❌禁止普通句型的 [口语n|考试m]；❌禁止拆成 3～7 条场景用法；"
            "connection 用「用法1:」「用法2:」分行，须含「＋」。"
        )
    else:
        bundle_rule = (
            "必须一次性输出 JSON 的全部三项（即使库里只有接序缺失，也要重写用法/例句/接序）："
            "usage, example_sentences, connection。"
            "禁止输出 reading、meaning、pos（语法没有这些字段）。"
            "usage 每条必须：数字. [口语n|考试m] 中文说明。(Nn)；"
            "❌用法正文禁止以「接在…」开头（会被剥光 → usage_empty_after_strip）；"
            "仅 1 种用法时 example_sentences 须恰好 3 句（按接续不同类型）；多用法则 1:1；"
            "有课次时勿超纲；语法核假名（あたり／ところ）优先写假名；"
            "connection 必须含「＋」或「用法N:」，禁止五段/一段/カ变/サ变，禁止无公式长散文；"
            "句首接续词（しかし／でも／ところが）示例："
            "前句（动词句／一类形容词句／二类形容词句／名词句）＋しかし｜后句句首，表示转折。"
        )

    return f"""词条：{word}
类型：{kind_label}
{f"教材课次：{str(row.get('course_label') or '').strip()}（例句难度对齐本课附近，禁止明显超纲）" if str(row.get("course_label") or "").strip() else ""}

{bundle_rule}

参考（可忽略旧值，以你一次性输出的完整内容为准）：
已有读音：{row.get("reading") or "（无）"}
已有释义：{row.get("meaning") or "（无）"}
已有词性：{row.get("pos") or "（无）"}
已有用法：{row.get("usage") or "（无）"}
已有接序：{row.get("connection") or "（无）"}
已有例句：{row.get("example_sentences") or "（无）"}
已有相关构词：{row.get("related_compounds") or "（无）"}
已有口语频率：{row.get("oral_frequency") or "（无）"}
已有考试频率：{row.get("exam_frequency") or "（无）"}
已有课次：{row.get("course_label") or "（无）"}

JSON 必须包含且非空：{", ".join(req_keys)}（变形课 usage 填 ""；单词 related_compounds 可 ""；频率为 1～10 整数）。
只输出 JSON。"""


def fetch_candidates(token: str, *, limit: int) -> list[dict[str, Any]]:
    by_id: dict[int, dict[str, Any]] = {}
    scan_limit = max(limit * 8, 24)

    def merge(rows: list, *, connection_only: bool = False) -> None:
        for row in rows:
            wid = int(row.get("id") or 0)
            if wid <= 0:
                continue
            word = str(row.get("word") or "")
            kind = str(row.get("kind") or "word")
            cur = by_id.get(wid)
            if not cur:
                cur = {
                    "id": wid,
                    "word": word,
                    "kind": kind,
                    "reading": row.get("reading"),
                    "meaning": row.get("meaning"),
                    "pos": row.get("pos"),
                    "usage": row.get("usage"),
                    "connection": row.get("connection"),
                    "example_sentences": row.get("example_sentences"),
                    "course_label": row.get("course_label"),
                    "needs": merge_needs_from_missing_flags(
                        full_refresh_needs(kind, word), row
                    ),
                    "triggered": True,
                }
                by_id[wid] = cur
            else:
                for field in (
                    "reading",
                    "meaning",
                    "pos",
                    "usage",
                    "connection",
                    "example_sentences",
                    "course_label",
                    "kind",
                    "word",
                ):
                    if row.get(field) and not cur.get(field):
                        cur[field] = row.get(field)
                kind = str(cur.get("kind") or kind)
                base_needs = full_refresh_needs(
                    kind, str(cur.get("word") or word)
                )
                # 保留已收窄的 needs，再合并本行 need_*（避免已有例句仍全量重造）
                merged = dict(cur.get("needs") or base_needs)
                for key, val in base_needs.items():
                    merged.setdefault(key, val)
                cur["needs"] = merge_needs_from_missing_flags(merged, row)
            if connection_only and kind == "grammar" and not is_conjugation_word(word):
                cur["needs"]["connection"] = True

    for url in (READING_URL, MEANING_URL, USAGE_URL, EXAMPLES_URL):
        body: dict[str, Any] = {"mode": "list_missing", "limit": scan_limit}
        data = call_api(
            url,
            token,
            body,
            user_agent="jp-vocab-fill-online-batch/1.0",
        )
        merge(list(data.get("missing") or []))

    conn_data = call_api(
        USAGE_URL,
        token,
        {"mode": "list_missing_connection", "limit": scan_limit},
        user_agent="jp-vocab-fill-online-batch/1.0",
    )
    if conn_data.get("mode") == "list_missing_connection":
        merge(list(conn_data.get("missing") or []), connection_only=True)

    poison = load_poison()
    now = time.time()
    rows: list[dict[str, Any]] = []
    for row in by_id.values():
        wid = int(row["id"])
        p = poison.get(str(wid))
        if p and float(p.get("until") or 0) > now:
            continue
        rows.append(row)
    rows.sort(key=lambda r: int(r.get("id") or 0))
    return rows[: max(1, limit)]


def apply_bundle(
    token: str,
    *,
    word_id: int,
    kind: str,
    payload: dict[str, Any],
    needs: dict[str, bool],
    source: str,
    dry_run: bool,
) -> tuple[list[str], list[str]]:
    """写回字段。返回 (done, fail_reasons)。

    单词例句必须走 fill-example-sentences；禁止靠 meaning 的「覆写成功」
    掩盖例句被拒（否则会假成功清零熔断、同一词空烧）。
    """
    done: list[str] = []
    fails: list[str] = []
    if dry_run:
        for k in payload:
            if payload.get(k):
                done.append(f"dry:{k}")
        return done, fails

    def _apply(url: str, body: dict) -> dict:
        return call_api(
            url,
            token,
            body,
            user_agent="jp-vocab-fill-online-batch/1.0",
        )

    if kind == "word":
        if payload.get("reading"):
            r = _apply(
                READING_URL,
                {
                    "mode": "apply",
                    "allow_overwrite": True,
                    "updates": [
                        {"word_id": word_id, "reading": payload["reading"]}
                    ],
                },
            )
            if int(r.get("updated") or 0) > 0:
                done.append("reading")
            else:
                sk = r.get("skipped") or []
                reason = (
                    str(sk[0].get("reason") or "reading_apply_none")
                    if sk
                    else "reading_apply_none"
                )
                fails.append(f"reading:{reason}")

        word_update: dict[str, Any] = {"word_id": word_id, "source": source}
        if payload.get("meaning"):
            word_update["meaning"] = payload["meaning"]
        if payload.get("pos"):
            word_update["pos"] = payload["pos"]
        oral = clamp_freq(payload.get("oral_frequency"))
        exam = clamp_freq(payload.get("exam_frequency"))
        if oral is not None:
            word_update["oral_frequency"] = oral
        if exam is not None:
            word_update["exam_frequency"] = exam
        # 例句不走 meaning：避免 updated>0（只覆写释义）却被当成整词搞定
        if len(word_update) > 2:
            r = _apply(
                MEANING_URL,
                {
                    "mode": "apply",
                    "allow_overwrite": True,
                    "validate_format": False,
                    "source": source,
                    "updates": [word_update],
                },
            )
            if int(r.get("updated") or 0) > 0:
                done.append("word_bundle")
            else:
                sk = r.get("skipped") or []
                reason = (
                    str(sk[0].get("reason") or "meaning_apply_none")
                    if sk
                    else "meaning_apply_none"
                )
                fails.append(f"meaning:{reason}")

        examples = str(payload.get("example_sentences") or "").strip()
        related = str(payload.get("related_compounds") or "").strip()
        related_key_present = "related_compounds" in payload
        if examples or related:
            # 与 meaning 一致：走 online normalize（剥訳文等）；仍拒漏标假名
            ex_update: dict[str, Any] = {"word_id": word_id}
            if examples:
                ex_update["example_sentences"] = examples
            if related:
                ex_update["related_compounds"] = related
            r = _apply(
                EXAMPLES_URL,
                {
                    "mode": "apply",
                    "allow_overwrite": True,
                    "validate_format": False,
                    "source": source,
                    "updates": [ex_update],
                },
            )
            if int(r.get("updated") or 0) > 0:
                if examples:
                    done.append("example_sentences")
                if related:
                    done.append("related_compounds")
            else:
                sk = r.get("skipped") or []
                reason = (
                    str(sk[0].get("reason") or "examples_apply_none")
                    if sk
                    else "examples_apply_none"
                )
                fails.append(f"examples:{reason}")
        else:
            fails.append("examples:missing_in_payload")

        # 模型返回空相关构词：必须 mark source，卡片才显示「已通过AI获取，但暂无相关词汇」
        # ❌ 禁止空结果却只往 applied 塞 related_compounds（维护中心假成功、卡片空白）
        if related_key_present and not related:
            r = _apply(
                EXAMPLES_URL,
                {
                    "mode": "apply",
                    "source": source,
                    "updates": [
                        {
                            "word_id": word_id,
                            "mark_related_compounds_checked": True,
                        }
                    ],
                },
            )
            if int(r.get("updated") or 0) > 0:
                done.append("related_compounds")
            else:
                sk = r.get("skipped") or []
                reason = (
                    str(sk[0].get("reason") or "related_mark_none")
                    if sk
                    else "related_mark_none"
                )
                # 已写过 source（空已查）→ 仍算相关构词已处理，勿假失败
                if reason == "already_filled":
                    done.append("related_compounds")
                else:
                    fails.append(f"related_compounds:{reason}")
        return done, fails

    if kind == "grammar":
        g_update: dict[str, Any] = {"word_id": word_id, "source": source}
        examples = str(payload.get("example_sentences") or "").strip()
        connection = str(payload.get("connection") or "").strip()
        usage_raw = str(payload.get("usage") or "").strip()
        # 仅补接续：不要带 usage:""，否则进不了 Worker connectionOnly，还可能假成功
        connection_only = bool(connection) and not examples and not usage_raw
        if connection_only:
            g_update["connection"] = connection
        else:
            if "usage" in payload or examples:
                g_update["usage"] = usage_raw
            if connection:
                g_update["connection"] = connection
            if examples:
                g_update["example_sentences"] = examples
        if len(g_update) > 2:
            r = _apply(
                USAGE_URL,
                {
                    "mode": "apply",
                    # 禁止 force：否则缺接续仍 updated>0 → 假成功清熔断空烧
                    "force": False,
                    "source": source,
                    "updates": [g_update],
                },
            )
            if int(r.get("updated") or 0) > 0:
                done.append("grammar")
            else:
                sk = r.get("skipped") or []
                reason = (
                    str(sk[0].get("reason") or "grammar_apply_none")
                    if sk
                    else "grammar_apply_none"
                )
                fails.append(f"grammar:{reason}")
        else:
            fails.append("grammar:empty_update")

    return done, fails


def grammar_still_missing_after_apply(
    token: str, word_id: int
) -> tuple[bool, str]:
    """apply 报成功后复查 list_missing；仍在队首 → 假成功。"""
    data = call_api(
        USAGE_URL,
        token,
        {"mode": "list_missing", "limit": 1, "word_id": int(word_id)},
        user_agent="jp-vocab-fill-online-batch/1.0",
    )
    return still_missing_detail_from_rows(
        word_id, list(data.get("missing") or [])
    )


def grammar_connection_has_formula(text: str) -> bool:
    """接序须有「＋」公式或「用法N:」/词类分行；散文会被线上 normalize 剥空。"""
    t = str(text or "").strip()
    if not t:
        return False
    if "＋" in t or "+" in t:
        return True
    if re.search(r"用法\s*\d+\s*[:：]", t):
        return True
    if re.search(r"^(?:一类|二类|三类)", t, flags=re.M):
        return True
    if re.search(r"^(?:否定形|肯定形|疑问形|注意)\s*[:：]", t, flags=re.M):
        return True
    return False


# 与 Worker connectionHasUsageNoise 对齐：接序夹用法说明 → 线上拒 connection_has_usage
CONNECTION_USAGE_NOISE_RE = re.compile(
    r"恩惠(?:流向|从|得到)?|主语是|主语必须|接受方(?:是|为)|给予方(?:是|为)|"
    r"给予者是|受益者是|受益者（|意思相近|可互换|视角不同|从外向内|主动接收|"
    r"说话人一方|强调(?:对方|说话人|我方|该动作|付出|好意|获益|结果)|两句意思|"
    r"带有感谢|受恩的语气|含有感谢|必须是第三方"
)


def grammar_connection_has_usage_noise(text: str) -> bool:
    """接序夹「主语是谁／恩惠流向」等用法说明 → 须重生成，勿直接 apply。"""
    t = str(text or "").replace("\r\n", "\n").strip()
    if not t:
        return False
    for line in t.split("\n"):
        for chunk in re.split(r"[／/]", line):
            segs = re.split(r"(?<=[。．])", chunk)
            for seg in segs:
                s = re.sub(r"[。．]+$", "", seg.strip()).strip()
                if not s:
                    continue
                if CONNECTION_USAGE_NOISE_RE.search(s):
                    return True
                pipe = s.find("｜")
                if pipe < 0:
                    pipe = s.find("|")
                if pipe >= 0:
                    note = s[pipe + 1 :].strip()
                    if note and CONNECTION_USAGE_NOISE_RE.search(note):
                        return True
                    if (
                        note
                        and "＋" not in note
                        and "+" not in note
                        and len(note) >= 18
                        and re.search(r"[\u4e00-\u9fff]{8,}", note)
                        and re.search(
                            r"(?:说话人|对方|我方|感谢|受惠|获益|好意|结果|受益者|给予者|第三方)",
                            note,
                        )
                    ):
                        return True
    return False


# 与 Worker jpVocabUsageLineLooksNonChinese 对齐：用法「」外禁止 漢字(かな)
USAGE_FURIGANA_PAREN_RE = re.compile(r"\([\u3040-\u309Fー]+\)")


def grammar_usage_looks_chinese(text: str) -> bool:
    """用法须中文；「」外出现假名括注或假名过多 → 会触发 usage_not_chinese。"""
    t = str(text or "").strip()
    if not t:
        return False
    no_quotes = re.sub(r"「[^」]*」", "", t)
    no_quotes = re.sub(r'"[^"]*"', "", no_quotes)
    if USAGE_FURIGANA_PAREN_RE.search(no_quotes):
        return False
    kana = re.findall(r"[\u3040-\u30FFー]", no_quotes)
    if len(kana) >= 8:
        return False
    return True


_NUMBERED_USAGE_LINE_RE = re.compile(
    r"^\s*\d+\s*[.、．)\]]\s*(?:\[口语\s*\d+\s*\|\s*考试\s*\d+\s*\]\s*)?(.+)$"
)


def grammar_usage_starts_with_connection_noise(text: str) -> bool:
    """编号用法以「接在…／构成…」开头 → 线上会剥光 → usage_empty_after_strip。"""
    for ln in str(text or "").splitlines():
        m = _NUMBERED_USAGE_LINE_RE.match(ln.strip())
        if not m:
            continue
        body = m.group(1).strip()
        if body.startswith("接在") or body.startswith("构成「"):
            return True
    return False


# 语法假名核 ↔ 常见汉字（与 Worker jpVocabGrammarLemmaAppearsInExamples 对齐）
_GRAMMAR_KANA_KANJI_ALIASES = {
    "あたり": ("辺り",),
    "ところ": ("所", "処"),
}


def grammar_examples_hit_lemma(word: str, examples: str) -> bool:
    """例句是否出现语法假名核（含汉字表记）。"""
    core = str(word or "").strip()
    core = re.sub(r"^[～~〜]+", "", core)
    core = re.sub(r"[～~〜]+$", "", core)
    raw = str(examples or "")
    plain = re.sub(r"[（(][^）)]*[）)]", "", raw)
    long_kana = sorted(
        re.findall(r"[\u3040-\u30FFー]{2,}", core), key=len, reverse=True
    )
    if not long_kana:
        return True
    for n in long_kana:
        variants = [n]
        if len(n) >= 3:
            variants.append(n[:-1])
        for v in variants:
            if v in plain or v in raw:
                return True
            for alias in _GRAMMAR_KANA_KANJI_ALIASES.get(v, ()):
                if alias in plain:
                    return True
        for kana, aliases in _GRAMMAR_KANA_KANJI_ALIASES.items():
            if n.endswith(kana) and any(a in plain for a in aliases):
                return True
    return False


def salvage_connection_from_examples(ex: str) -> str:
    """模型偶把【接序】塞进例句字段；写库前拆出。"""
    text = str(ex or "").replace("\r\n", "\n")
    marker = "【接序】"
    idx = text.find(marker)
    if idx < 0:
        return ""
    after = text[idx + len(marker) :].strip()
    return after if grammar_connection_has_formula(after) else ""


def extract_bundle(data: dict[str, Any], row: dict[str, Any]) -> dict[str, Any]:
    kind = str(row.get("kind") or "word")
    word = str(row.get("word") or "")
    out: dict[str, Any] = {}

    if kind == "word":
        reading = str(data.get("reading") or "").strip()
        meaning = str(data.get("meaning") or "").strip()
        pos = str(data.get("pos") or "").strip()
        ex = normalize_example_sentences_block(data.get("example_sentences"))
        if reading:
            out["reading"] = reading
        if meaning:
            out["meaning"] = meaning
        if pos:
            out["pos"] = pos
        if ex:
            out["example_sentences"] = ex
        # 始终带上键（可 ""）：没有自然相关词填空，禁止模型整段省略该字段
        out["related_compounds"] = str(data.get("related_compounds") or "").strip()
        oral = clamp_freq(data.get("oral_frequency"))
        exam = clamp_freq(data.get("exam_frequency"))
        if oral is not None:
            out["oral_frequency"] = oral
        if exam is not None:
            out["exam_frequency"] = exam
        return out

    if is_conjugation_word(word):
        ex = normalize_example_sentences_block(data.get("example_sentences"))
        if ex:
            out["example_sentences"] = ex
        out["usage"] = ""
        # 变形课必须保留接续表；禁止再强制 connection=""（假成功根因）
        connection = str(data.get("connection") or "").strip()
        if not connection and ex:
            connection = salvage_connection_from_examples(ex)
            if connection:
                # 例句字段里的【接序】勿原样入库
                body, _, _ = ex.partition("【接序】")
                out["example_sentences"] = body.strip()
        if connection:
            out["connection"] = connection
        return out

    usage = str(data.get("usage") or "").strip()
    connection = str(data.get("connection") or "").strip()
    ex = normalize_example_sentences_block(data.get("example_sentences"))
    if not connection and ex:
        salvaged = salvage_connection_from_examples(ex)
        if salvaged:
            connection = salvaged
            body, _, _ = ex.partition("【接序】")
            ex = body.strip()
    if usage:
        out["usage"] = usage
    if connection:
        out["connection"] = connection
    if ex:
        out["example_sentences"] = ex
    return out


def bundle_missing_keys(payload: dict[str, Any], row: dict[str, Any]) -> list[str]:
    missing: list[str] = []
    kind = str(row.get("kind") or "word")
    word = str(row.get("word") or "")

    if kind == "word":
        for key in required_keys_for_row(row):
            if key in WORD_FREQUENCY_KEYS:
                if clamp_freq(payload.get(key)) is None:
                    missing.append(key)
            elif not str(payload.get(key) or "").strip():
                missing.append(key)
        if payload.get("connection") or payload.get("usage"):
            missing.append("forbidden_word_connection_or_usage")
        return missing

    if is_conjugation_word(word):
        for key in required_keys_for_row(row):
            if key == "connection":
                if not grammar_connection_has_formula(
                    str(payload.get("connection") or "")
                ):
                    missing.append(key)
            elif not str(payload.get(key) or "").strip():
                missing.append(key)
        return missing

    for key in ("usage", "connection", "example_sentences"):
        if key == "connection":
            conn_text = str(payload.get("connection") or "")
            if not grammar_connection_has_formula(conn_text):
                missing.append(key)
            elif grammar_connection_has_usage_noise(conn_text):
                missing.append("connection_has_usage")
        elif key == "usage":
            usage_text = str(payload.get("usage") or "").strip()
            if not usage_text or not grammar_usage_looks_chinese(usage_text):
                missing.append(key)
            elif grammar_usage_starts_with_connection_noise(usage_text):
                missing.append("usage_empty_after_strip")
            elif is_contrast_word(
                word,
                row.get("reading") if isinstance(row.get("reading"), str) else None,
            ):
                if "【区别】" not in usage_text and "【區別】" not in usage_text:
                    missing.append("contrast_missing_distinction")
        elif key == "example_sentences":
            ex_text = str(payload.get("example_sentences") or "").strip()
            if not ex_text:
                missing.append(key)
            elif not grammar_examples_hit_lemma(word, ex_text):
                missing.append("grammar_not_used")
        elif not str(payload.get(key) or "").strip():
            missing.append(key)
    if payload.get("reading") or payload.get("meaning") or payload.get("pos"):
        missing.append("forbidden_grammar_reading_meaning_pos")
    return missing


def _log_raw_snippet(raw: str, *, label: str = "raw") -> None:
    snippet = re.sub(r"\s+", " ", (raw or "").strip())[:280]
    if snippet:
        print(f"    {label} snippet: {snippet}", flush=True)


def generate_bundle(row: dict[str, Any], needs: dict[str, bool]) -> dict[str, Any]:
    kind = str(row.get("kind") or "word")
    system = GRAMMAR_SYSTEM if kind == "grammar" else WORD_SYSTEM
    prompt = build_prompt(row)

    def _call(extra: str = "", *, temperature: float = 0.25) -> dict[str, Any]:
        raw = call_anthropic(
            prompt + extra,
            system=system,
            max_tokens=4500,
            temperature=temperature,
            timeout=180,
        )
        try:
            data = parse_json_object(raw)
        except ValueError as err:
            # 坏 JSON（Expecting ',' delimiter 等）：再要一次，避免空烧到熔断
            _log_raw_snippet(raw, label="bad_json")
            print(f"    retry generate after JSON error: {err}", flush=True)
            raw = call_anthropic(
                prompt
                + extra
                + "\n\nCRITICAL: Previous reply was invalid JSON ("
                + str(err)[:120]
                + "). Output ONE valid JSON object only. "
                "Escape every double-quote inside string values as \\\". "
                "Do not put bare /ipa/ or unquoted Chinese quotes inside values.",
                system=system,
                max_tokens=4500,
                temperature=0.1,
                timeout=180,
            )
            try:
                data = parse_json_object(raw)
            except ValueError:
                _log_raw_snippet(raw, label="bad_json_retry")
                raise
        return extract_bundle(data, row)

    payload = _call()
    missing = bundle_missing_keys(payload, row)
    if missing:
        retry_hint = (
            "\n\nCRITICAL: 上次 JSON 不完整或含非法字段。"
            f"缺/错：{', '.join(missing)}。"
        )
        if kind == "word":
            retry_hint += (
                "单词必须一次性给出 reading、meaning、pos、example_sentences，"
                "以及 oral_frequency、exam_frequency（各 1～10 整数）；"
                "禁止 connection、usage。"
            )
        elif is_conjugation_word(str(row.get("word") or "")):
            retry_hint += (
                "变形课须给出 "
                + ", ".join(required_keys_for_row(row))
                + "；usage 填 \"\"；须有接续表（一类／二类／三类）。"
            )
        else:
            retry_hint += (
                "语法必须一次性给出 usage、example_sentences、connection；"
                "禁止 reading、meaning、pos。"
                "connection 必须含「＋」公式（句首接续词如 しかし 也要："
                "前句（动词句／一类形容词句／二类形容词句／名词句）＋しかし｜后句句首，表示转折）；"
                "禁止空 connection、禁止无「＋」散文。"
                "usage 必须纯中文：❌禁止 漢字(かな) 假名括注（如「用(も)于」）；"
                "假名括注只写在 example_sentences。"
                "❌用法禁止以「接在…」开头（会 usage_empty_after_strip）；直接写「表示…」。"
                "对比课（これ／あれ等）usage 必须先【区别】再恰好 2 组。"
                "例句须出现语法假名核（あたり／ところ）；优先写假名。"
            )
            if "contrast_missing_distinction" in missing:
                retry_hint += (
                    "本条是对比课：usage 第一行必须是【区别】，再 1./2. 两侧各 1 句；"
                    "不要写 [口语n|考试m]。"
                )
            if "usage_empty_after_strip" in missing:
                retry_hint += (
                    "用法正文不要以「接在人物/场所名词后」开头；改为「表示……」。"
                )
            if "grammar_not_used" in missing:
                retry_hint += (
                    "例句须自然出现语法核假名（如「あたり」「のところ」）；"
                    "不要只写「辺り」却漏假名核。"
                )
        payload = _call(retry_hint)
        missing = bundle_missing_keys(payload, row)
        if missing:
            raise ValueError(f"incomplete_bundle:{','.join(missing)}")

    # 假名漏标：点名缺哪句/哪个字，退回 Claude 整份重写例句（最多再试 2 次）
    # 再与原稿合并：读音/释义等保留，例句以新稿为准
    for furigana_try in range(1, 3):
        hint = build_furigana_retry_hint(
            str(payload.get("example_sentences") or ""),
            kind=kind,
        )
        if not hint:
            break
        detail = describe_incomplete_furigana(
            str(payload.get("example_sentences") or "")
        )
        print(
            f"    furigana retry {furigana_try}/2: {detail}",
            flush=True,
        )
        payload2 = _call(hint)
        missing2 = bundle_missing_keys(payload2, row)
        if missing2:
            print(
                f"    furigana retry incomplete keys: {','.join(missing2)}",
                flush=True,
            )
            continue
        payload = merge_fill_payload(payload, payload2)

    still_chinese = describe_chinese_prose_in_examples(
        str(payload.get("example_sentences") or "")
    )
    if still_chinese:
        raise ValueError(f"chinese_prose_in_japanese_line:{still_chinese}")

    still_bad = describe_incomplete_furigana(
        str(payload.get("example_sentences") or "")
    )
    if still_bad:
        raise ValueError(f"incomplete_kanji_furigana:{still_bad}")

    return payload


def process_one(
    token: str,
    row: dict[str, Any],
    *,
    index: int,
    total: int,
    dry_run: bool,
    allow_burst: bool,
) -> bool:
    if not acquire_paid_rate_gate(allow_burst=allow_burst):
        min_sec = resolve_min_interval_sec()
        print(f"    rate-gate wait {min_sec}s…", flush=True)
        time.sleep(min_sec)
        if not acquire_paid_rate_gate(allow_burst=allow_burst):
            return False

    wid = int(row["id"])
    word = str(row.get("word") or "")
    kind = str(row.get("kind") or "word")
    needs = dict(row.get("needs") or {})
    req_keys = required_keys_for_row(row)
    print(
        f"  [{index}/{total}] id={wid} kind={kind} word={word!r} "
        f"full_bundle={list(req_keys)}",
        flush=True,
    )
    report_word_run_to_maintenance_center(
        {
            "word_id": wid,
            "word": word,
            "kind": kind,
            "status": "running",
            "started_at": now_local_str(),
        }
    )

    source = build_online_source_label()
    mark_paid_call()
    try:
        payload = generate_bundle(row, needs)
    except Exception as err:
        print(f"    fail generate: {err}", flush=True)
        report_word_run_to_maintenance_center(
            {
                "word_id": wid,
                "word": word,
                "kind": kind,
                "status": "failed",
                "error": f"generate:{err}",
                "finished_at": now_local_str(),
            }
        )
        mark_poison(wid, word, f"generate:{err}")
        after_attempt(
            scope="jp-online",
            word_id=wid,
            word=word,
            fixed=False,
            detail=f"generate:{err}",
        )
        return False

    if not payload:
        mark_poison(wid, word, "empty_payload")
        after_attempt(
            scope="jp-online",
            word_id=wid,
            word=word,
            fixed=False,
            detail="empty_payload",
        )
        return False

    preview = {
        k: (str(v)[:72] + ("…" if len(str(v)) > 72 else ""))
        for k, v in payload.items()
    }
    print(f"    got={preview}", flush=True)

    if dry_run:
        return True

    done, fails = apply_bundle(
        token,
        word_id=wid,
        kind=kind,
        payload=payload,
        needs=needs,
        source=source,
        dry_run=False,
    )
    print(f"    applied={done} source={source}", flush=True)
    if fails:
        print(f"    apply_fails={fails}", flush=True)

    req_keys = required_keys_for_row(row)
    still_missing: bool | None = None
    still_detail = ""
    if kind == "grammar" and done and not fails:
        still_missing, still_detail = grammar_still_missing_after_apply(token, wid)
        if still_missing:
            print(f"    still_missing_after_apply: {still_detail}", flush=True)

    fixed, fail_detail = evaluate_online_batch_fixed(
        kind=kind,
        word=word,
        done=done,
        fails=fails,
        payload=payload,
        required=req_keys,
        still_missing=still_missing,
        still_detail=still_detail,
    )

    preview_text = json.dumps(preview, ensure_ascii=False)
    report_word_run_to_maintenance_center(
        {
            "word_id": wid,
            "word": word,
            "kind": kind,
            "status": "success" if fixed else "failed",
            "source": source,
            "applied": str(done),
            "preview": preview_text,
            "error": "" if fixed else (fail_detail or "apply_none"),
            "finished_at": now_local_str(),
        }
    )
    if not fixed:
        mark_poison(wid, word, fail_detail or "apply_none")
        after_attempt(
            scope="jp-online",
            word_id=wid,
            word=word,
            fixed=False,
            detail=fail_detail or "apply_none",
        )
        return False
    after_attempt(
        scope="jp-online",
        word_id=wid,
        word=word,
        fixed=True,
        detail="applied",
    )
    return True


def main() -> int:
    assert_not_killed("jp-online-batch")
    skip_if_quiz_gate_quiet("jp-online-batch")
    if not is_online_backend():
        print(
            "[jp-vocab-fill-online] JP_VOCAB_FILL_LLM_BACKEND≠1，"
            "请改 scripts/lib/jp_vocab_llm_backend.py 或 env",
            flush=True,
        )
        return 2

    token = resolve_token()
    if not token:
        raise SystemExit("缺少 JP_REVIEW_UPLOAD_TOKEN")

    skip_if_worker_unavailable(BASE, label="jp-vocab-fill-online")

    parser = argparse.ArgumentParser(
        description="日语词条：线上付费一词一次补齐"
    )
    parser.add_argument("--limit", type=int, default=HARD_ONLINE_LIMIT)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--allow-burst", action="store_true")
    parser.add_argument("--word-id", type=int, default=0)
    parser.add_argument(
        "--force",
        action="store_true",
        help="即使开关为本地也运行（调试）",
    )
    args = parser.parse_args()

    if not args.force and not is_online_backend():
        return 2

    limit = max(1, min(int(args.limit or HARD_ONLINE_LIMIT), HARD_ONLINE_LIMIT))
    print(
        f"[jp-vocab-fill-online] backend={backend_label()} limit={limit}",
        flush=True,
    )

    if args.word_id and args.word_id > 0:
        rows = fetch_candidates(token, limit=50)
        rows = [r for r in rows if int(r["id"]) == int(args.word_id)]
        if not rows:
            print(
                f"[jp-vocab-fill-online] word_id={args.word_id} 不在缺项队列",
                flush=True,
            )
            return 0
    else:
        rows = fetch_candidates(token, limit=limit)

    if not rows:
        print("[jp-vocab-fill-online] 无待补词条", flush=True)
        return 0

    ok = process_one(
        token,
        rows[0],
        index=1,
        total=len(rows),
        dry_run=args.dry_run,
        allow_burst=args.allow_burst,
    )
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
