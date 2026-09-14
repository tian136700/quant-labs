#!/usr/bin/env python3
"""Regression: English vocab rejects STT/Agent probe lemmas on upload + fill."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    sys.exit(1)


def must_contain(path: Path, needle: str, label: str | None = None) -> None:
    text = path.read_text(encoding="utf-8")
    if needle not in text:
        fail(f"{label or path.relative_to(ROOT)} missing {needle!r}")


def main() -> None:
    must_contain(
        ROOT / "src/lib/en-vocab-local-upload.ts",
        "isEnVocabProbeOrTestLemma",
    )
    must_contain(
        ROOT / "src/lib/en-vocab-local-upload.ts",
        "stt_probe",
    )
    must_contain(
        ROOT / "src/lib/en-vocab-local-upload.ts",
        "never_exist",
    )
    must_contain(
        ROOT / "src/lib/en-vocab-local-upload.ts",
        "partitionEnVocabUploadWordsAgainstProbes",
    )
    must_contain(
        ROOT / "src/app/api/en-vocab/local-upload/route.ts",
        "rejected_probe_words",
    )
    must_contain(
        ROOT / "src/app/api/en-vocab/local-upload/route.ts",
        "partitionEnVocabUploadWordsAgainstProbes",
    )
    must_contain(
        ROOT / "src/app/api/en-vocab/upload/route.ts",
        "partitionEnVocabUploadWordsAgainstProbes",
    )
    must_contain(
        ROOT / "src/lib/en-vocab-db/words.ts",
        "isEnVocabProbeOrTestLemma",
    )
    must_contain(
        ROOT / "src/lib/en-vocab-db/words.ts",
        "probe_lemma_rejected",
    )
    must_contain(
        ROOT / "src/app/api/en-vocab/add/route.ts",
        "probe_lemma_rejected",
    )
    must_contain(
        ROOT / "src/lib/en-vocab-fill-next-candidate.ts",
        "isEnVocabProbeOrTestLemma",
    )
    must_contain(
        ROOT / "docs/en-vocab-local-upload-api.txt",
        "rejected_probe_words",
    )
    must_contain(
        ROOT / ".cursor/rules/en-vocab-probe-lemma-reject.mdc",
        "__stt_probe_never_exist_xyz__",
    )
    print("OK: en-vocab probe lemma reject wired")


if __name__ == "__main__":
    main()
