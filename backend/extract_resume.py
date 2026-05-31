#!/usr/bin/env python3
"""Extract text from a resume PDF using pymupdf."""

import sys
import json
import io

# Force UTF-8 stdout to handle Unicode characters from PDFs (e.g. ligatures like \ufb01)
# On Windows, the default console encoding is cp1252 and print() can choke.
if sys.stdout.encoding.casefold() != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

try:
    import pymupdf
except ImportError:
    print("pymupdf not found. Install with: uv pip install --python /c/Users/ansuj/.venvs/interview-coach pymupdf", file=sys.stderr)
    sys.exit(1)


def extract_resume(pdf_path: str) -> dict:
    doc = pymupdf.open(pdf_path)
    pages = []
    full_text = []
    for i, page in enumerate(doc):
        text = page.get_text("text").strip()
        pages.append({"page": i + 1, "text": text})
        full_text.append(text)

    meta = doc.metadata or {}
    return {
        "title": meta.get("title", ""),
        "author": meta.get("author", ""),
        "subject": meta.get("subject", ""),
        "page_count": len(doc),
        "pages": pages,
        "text": "\n\n".join(full_text),
    }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python extract_resume.py <pdf_path> [--json]")
        print("")
        print("Extracts text from a resume PDF.")
        print("Without --json, prints plain text to stdout.")
        print("With --json, prints structured JSON including page count and metadata.")
        sys.exit(1)

    pdf_path = sys.argv[1]
    as_json = "--json" in sys.argv

    result = extract_resume(pdf_path)

    if as_json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(result["text"])
