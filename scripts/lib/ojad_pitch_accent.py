"""Fetch Japanese pitch accent from OJAD (Online Japanese Accent Dictionary).

Each mora is a <span> with CSS classes:
  - accent_plain → high (black top bar)
  - accent_top   → nucleus (red top bar + drop)
  - neither      → low
"""

from __future__ import annotations

import json
import re
import urllib.parse
from typing import Any

import requests
from bs4 import BeautifulSoup

BASE = "https://www.gavo.t.u-tokyo.ac.jp"
SEARCH = (
    BASE
    + "/ojad/search/index/sortprefix:accent/narabi1:kata_asc/"
    "narabi2:accent_asc/narabi3:mola_asc/yure:visible/curve:invisible/"
    "details:invisible/limit:20/word:{word}"
)
UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)
HTTP_TIMEOUT = 30


def pitch_of_span(class_attr: str | list | None) -> str:
    classes = class_attr if isinstance(class_attr, list) else (class_attr or "").split()
    if "accent_top" in classes:
        return "N"
    if "accent_plain" in classes:
        return "H"
    return "L"


def parse_accented_word(accented) -> dict[str, Any]:
    moras: list[dict[str, Any]] = []
    for span in accented.find_all("span", recursive=False):
        classes = span.get("class") or []
        chars = [c.get_text(strip=True) for c in span.find_all("span", class_="char")]
        if not chars:
            text = span.get_text(strip=True)
            chars = [text] if text else []
        ch = "".join(chars)
        if not ch:
            continue
        moras.append({"c": ch, "p": pitch_of_span(classes)})
    kana = "".join(m["c"] for m in moras)
    pattern = "".join(m["p"] for m in moras)
    return {"kana": kana, "pattern": pattern, "moras": moras}


def parse_search_html(html: str) -> list[dict[str, Any]]:
    soup = BeautifulSoup(html, "html.parser")
    table = soup.select_one("#word_table")
    if not table:
        return []
    rows: list[dict[str, Any]] = []
    for tr in table.select("tbody > tr"):
        midashi = tr.select_one(".midashi_word")
        headword = midashi.get_text(strip=True) if midashi else ""
        forms: list[dict[str, Any]] = []
        for td in tr.select("td.katsuyo"):
            classes = td.get("class") or []
            form_name = "?"
            for c in classes:
                if c.startswith("katsuyo_") and c.endswith("_js"):
                    form_name = c[len("katsuyo_") : -len("_js")]
                    break
            for accented in td.select(".accented_word"):
                parsed = parse_accented_word(accented)
                forms.append({"form": form_name, **parsed})
        if headword or forms:
            rows.append({"headword": headword, "forms": forms})
    return rows


def fetch_ojad_rows(word: str, session: requests.Session | None = None) -> list[dict[str, Any]]:
    sess = session or requests.Session()
    sess.headers.setdefault("User-Agent", UA)
    sess.headers.setdefault("Accept-Language", "ja,en;q=0.8")
    url = SEARCH.format(word=urllib.parse.quote(word))
    r = sess.get(url, timeout=HTTP_TIMEOUT)
    r.raise_for_status()
    r.encoding = r.apparent_encoding or "utf-8"
    return parse_search_html(r.text)


def _normalize_kana(text: str) -> str:
    return re.sub(r"[\s\u3000]", "", text or "")


def pick_jisho_form(
    rows: list[dict[str, Any]], *, reading: str | None = None
) -> dict[str, Any] | None:
    """Pick dictionary-form (jisho) accent; match reading kana when provided."""
    reading_norm = _normalize_kana(reading or "")
    candidates: list[dict[str, Any]] = []
    for row in rows:
        for form in row.get("forms") or []:
            if form.get("form") == "jisho" and form.get("moras"):
                candidates.append(form)
    if not candidates:
        for row in rows:
            for form in row.get("forms") or []:
                if form.get("moras"):
                    candidates.append(form)
    if not candidates:
        return None
    if reading_norm:
        for form in candidates:
            if _normalize_kana(form.get("kana") or "") == reading_norm:
                return form
        for form in candidates:
            kana = _normalize_kana(form.get("kana") or "")
            if kana and (kana in reading_norm or reading_norm in kana):
                return form
    return candidates[0]


def fetch_pitch_accent_for_word(
    word: str,
    *,
    reading: str | None = None,
    session: requests.Session | None = None,
) -> dict[str, Any] | None:
    """Return compact pitch accent dict for DB storage, or None if OJAD has no match."""
    rows = fetch_ojad_rows(word, session=session)
    form = pick_jisho_form(rows, reading=reading)
    if not form or not form.get("moras"):
        return None
    return {
        "kana": form["kana"],
        "pattern": form["pattern"],
        "moras": form["moras"],
    }


def pitch_accent_to_json(data: dict[str, Any]) -> str:
    return json.dumps(data, ensure_ascii=False, separators=(",", ":"))
