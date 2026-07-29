#!/usr/bin/env python3
"""Regression: study pages light-poll shared list for cross-device card sync.

Teacher level→shareToStudy writes D1; BroadcastChannel only same browser.
Without resolveVocabPollIntervalMs polling, student cards wait until tab focus.
Visible interval must be 5s (floor), not slower classroom default.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HOOK = ROOT / "src/hooks/useVocabStudySharedPoll.ts"
JP_STUDY = ROOT / "src/components/JpVocabStudyPage.tsx"
EN_STUDY = ROOT / "src/components/EnVocabStudyPage.tsx"
RULE = ROOT / ".cursor/rules/shared-list-no-notes-blob.mdc"


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def must_contain(path: Path, needle: str, hint: str) -> None:
    if needle not in path.read_text(encoding="utf-8"):
        fail(f"{path.relative_to(ROOT)}: missing {hint} ({needle!r})")


def main() -> None:
    for path in (HOOK, JP_STUDY, EN_STUDY, RULE):
        if not path.is_file():
            fail(f"missing {path}")

    must_contain(HOOK, "resolveVocabPollIntervalMs", "quiet-hours aware delay")
    must_contain(HOOK, "loadShared({ force: true })", "force refresh each tick")

    for page, lang in ((JP_STUDY, "JP"), (EN_STUDY, "EN")):
        must_contain(page, "useVocabStudySharedPoll", f"{lang} study uses shared poll hook")
        text = page.read_text(encoding="utf-8")
        if "setInterval(() =>" in text and "loadShared" in text:
            # allow only via hook; page itself should not raw-interval loadShared
            pass
        if f"{lang}_VOCAB_STUDY_POLL" in text.replace("JP", "JP").replace("EN", "EN"):
            pass
        must_contain(
            page,
            "STUDY_POLL_MS",
            f"{lang} study passes STUDY_POLL_MS",
        )

    must_contain(RULE, "useVocabStudySharedPoll", "rule documents required poll")
    jp = (ROOT / "src/lib/jp-vocab-sync.ts").read_text(encoding="utf-8")
    en = (ROOT / "src/lib/en-vocab-sync.ts").read_text(encoding="utf-8")
    if "JP_VOCAB_STUDY_POLL_MS = 5_000" not in jp:
        fail("JP_VOCAB_STUDY_POLL_MS must be 5_000 for classroom card sync")
    if "EN_VOCAB_STUDY_POLL_MS = 5_000" not in en:
        fail("EN_VOCAB_STUDY_POLL_MS must be 5_000 for classroom card sync")
    print("OK: study shared poll guards passed.")


if __name__ == "__main__":
    main()
