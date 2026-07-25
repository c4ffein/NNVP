#!/usr/bin/env python3
"""Prepare the text corpora behind the TinyShakespeare / GutenbergPoetry datasets.

Downloads the two public-domain sources, normalizes them down to EXACTLY the
fixed character vocabulary the client uses ('\\n' + printable ASCII 32..126 —
keep in sync with nnvp-client-vue/src/lib/JSDatasets/text-vocab.ts), and writes:

    <out>/tinyshakespeare/tinyshakespeare.txt
    <out>/gutenberg_poetry/gutenberg_poetry.txt

then prints each file's size and SRI integrity string ("sha256-<base64>").

To publish:
  1. upload each directory to the datasets CDN, preserving the layout above
     (they end up next to mnist/, cifar10/, ... under the cdnDir);
  2. paste the printed integrity strings into the matching `textChecksum`
     fields of nnvp-client-vue/src/lib/JSDatasets/datasets-sources.ts
     (they ship as null until then, which skips subresource integrity).

Sources:
  - Tiny Shakespeare: karpathy/char-rnn (public domain text).
  - Gutenberg Poetry Corpus v001 by Allison Parrish — ~3M lines of
    public-domain poetry from Project Gutenberg, served as gzipped ndjson.
    Whole books are taken in corpus order until the size budget is reached,
    so the corpus keeps long runs of one voice instead of shuffled lines.
"""

import argparse
import base64
import gzip
import hashlib
import json
import sys
import unicodedata
import urllib.request
from pathlib import Path

SHAKESPEARE_URL = (
    "https://raw.githubusercontent.com/karpathy/char-rnn/master/data/tinyshakespeare/input.txt"
)
GUTENBERG_URL = "http://static.decontextualize.com/gutenberg-poetry-v001.ndjson.gz"
# Shakespeare's Sonnets, Project Gutenberg ebook #1041 (~100KB): the tiny
# fine-tuning corpus of the curriculum demo — too small to train from scratch,
# perfect to specialize a poetry-pretrained model onto.
SONNETS_URL = "https://www.gutenberg.org/cache/epub/1041/pg1041.txt"

# A few common non-ASCII characters worth mapping instead of dropping.
TRANSLITERATIONS = {
    "‘": "'", "’": "'", "‚": "'", "‛": "'",
    "“": '"', "”": '"', "„": '"',
    "–": "-", "—": "-", "―": "-",
    "…": "...",
    " ": " ",
}


def normalize(text: str) -> str:
    """Force `text` into the client's fixed vocabulary: \\n + ASCII 32..126."""
    for source, replacement in TRANSLITERATIONS.items():
        text = text.replace(source, replacement)
    # Strip accents (NFKD base letters survive), then drop whatever remains
    # outside the vocabulary.
    text = unicodedata.normalize("NFKD", text)
    kept = []
    for char in text:
        if char == "\n" or 32 <= ord(char) <= 126:
            kept.append(char)
    text = "".join(kept)
    # Collapse the blank-line runs the dropped characters may have left.
    while "\n\n\n" in text:
        text = text.replace("\n\n\n", "\n\n")
    return text


def fetch(url: str) -> bytes:
    print(f"downloading {url} ...", flush=True)
    with urllib.request.urlopen(url) as response:  # noqa: S310 - fixed https/http URLs above
        return response.read()


def prepare_shakespeare(out_dir: Path) -> Path:
    text = normalize(fetch(SHAKESPEARE_URL).decode("utf-8"))
    path = out_dir / "tinyshakespeare" / "tinyshakespeare.txt"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="ascii")
    return path


def prepare_sonnets(out_dir: Path) -> Path:
    raw = fetch(SONNETS_URL).decode("utf-8-sig")
    # Strip the Project Gutenberg boilerplate around the actual text.
    start = raw.find("*** START OF")
    start = raw.find("\n", start) + 1 if start != -1 else 0
    end = raw.find("*** END OF")
    if end == -1:
        end = len(raw)
    text = normalize(raw[start:end].strip() + "\n")
    path = out_dir / "shakespeare_sonnets" / "shakespeare_sonnets.txt"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="ascii")
    return path


def prepare_gutenberg(out_dir: Path, budget_bytes: int, name: str = "gutenberg_poetry") -> Path:
    raw = gzip.decompress(fetch(GUTENBERG_URL))
    lines_by_book: dict[str, list[str]] = {}
    book_order: list[str] = []
    for raw_line in raw.splitlines():
        if not raw_line:
            continue
        entry = json.loads(raw_line)
        gid = str(entry["gid"])
        if gid not in lines_by_book:
            lines_by_book[gid] = []
            book_order.append(gid)
        lines_by_book[gid].append(entry["s"])

    chunks: list[str] = []
    total = 0
    books_taken = 0
    for gid in book_order:
        book = normalize("\n".join(lines_by_book[gid])) + "\n\n"
        chunks.append(book)
        total += len(book)
        books_taken += 1
        if total >= budget_bytes:
            break
    print(f"kept {books_taken} books out of {len(book_order)}")

    path = out_dir / name / f"{name}.txt"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(chunks), encoding="ascii")
    return path


def report(path: Path) -> None:
    data = path.read_bytes()
    integrity = "sha256-" + base64.b64encode(hashlib.sha256(data).digest()).decode("ascii")
    print(f"{path}")
    print(f"  size:      {len(data) / 1e6:.2f} MB")
    print(f"  integrity: {integrity}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--out", type=Path, default=Path("dist-datasets"),
        help="output directory (default: ./dist-datasets)",
    )
    parser.add_argument(
        "--gutenberg-budget-mb", type=float, default=3.0,
        help="approximate size of the Gutenberg poetry subset (default: 3.0)",
    )
    parser.add_argument(
        "--gutenberg-name", default="gutenberg_poetry",
        help="output dir/file stem for the Gutenberg subset — e.g. gutenberg_poetry_xl "
             "for the 25MB tier (default: gutenberg_poetry)",
    )
    parser.add_argument("--skip-shakespeare", action="store_true")
    parser.add_argument("--skip-gutenberg", action="store_true")
    parser.add_argument("--skip-sonnets", action="store_true")
    args = parser.parse_args()

    paths = []
    if not args.skip_shakespeare:
        paths.append(prepare_shakespeare(args.out))
    if not args.skip_sonnets:
        paths.append(prepare_sonnets(args.out))
    if not args.skip_gutenberg:
        paths.append(prepare_gutenberg(
            args.out, int(args.gutenberg_budget_mb * 1e6), args.gutenberg_name,
        ))
    print()
    for path in paths:
        report(path)
    print("\nUpload the directories to the datasets CDN, then paste the integrity")
    print("strings into datasets-sources.ts (textChecksum fields).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
