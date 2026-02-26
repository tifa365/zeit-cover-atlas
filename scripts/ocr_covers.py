#!/usr/bin/env python3
"""
OCR all ZEIT covers and produce a search index.

Usage:
    python scripts/ocr_covers.py [--covers-dir public/covers] [--out public/search-data/ocr-index.json]

Requires: pytesseract, Pillow (+ system tesseract-ocr with deu language pack)
"""

import argparse
import json
import sys
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

import pytesseract
from PIL import Image


def ocr_cover(image_path: str) -> dict:
    """Run Tesseract OCR on a single cover image and return structured result."""
    img = Image.open(image_path)

    # Downscale to 400px width — sweet spot for speed vs quality
    max_w = 400
    if img.width > max_w:
        ratio = max_w / img.width
        img = img.resize((max_w, int(img.height * ratio)), Image.LANCZOS)

    # Simple string extraction (much faster than image_to_data)
    text = pytesseract.image_to_string(img, lang="deu").strip()

    if not text:
        return {"headline": "", "allText": "", "confidence": 0.0}

    lines = [l.strip() for l in text.splitlines() if l.strip()]

    # Headline heuristic: first non-trivial line (skip "DIE ZEIT" masthead)
    headline = ""
    for line in lines:
        # Skip masthead and very short fragments
        if line.upper().replace(" ", "").startswith("DIEZEIT"):
            continue
        if len(line) < 3:
            continue
        headline = line
        break

    all_text = " ".join(lines)

    return {
        "headline": headline,
        "allText": all_text,
        "confidence": 0.5,  # no per-word confidence in string mode
    }


def process_one(img_path_str: str) -> dict:
    """Process a single cover (used by ProcessPoolExecutor)."""
    path = Path(img_path_str)
    try:
        result = ocr_cover(img_path_str)
        return {"id": path.stem, **result}
    except Exception as e:
        return {"id": path.stem, "headline": "", "allText": "", "confidence": 0.0, "error": str(e)}


def main():
    parser = argparse.ArgumentParser(description="OCR ZEIT covers for search index")
    parser.add_argument(
        "--covers-dir",
        default="public/covers",
        help="Directory containing cover images (default: public/covers)",
    )
    parser.add_argument(
        "--out",
        default="public/search-data/ocr-index.json",
        help="Output JSON path (default: public/search-data/ocr-index.json)",
    )
    parser.add_argument(
        "--resume",
        action="store_true",
        help="Resume from existing partial output (skip already-processed covers)",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=4,
        help="Number of parallel workers (default: 4)",
    )
    args = parser.parse_args()

    covers_dir = Path(args.covers_dir)
    out_path = Path(args.out)

    if not covers_dir.exists():
        print(f"Error: covers directory '{covers_dir}' not found.", file=sys.stderr)
        sys.exit(1)

    # Collect all cover images, sorted by filename
    image_files = sorted(
        f
        for f in covers_dir.iterdir()
        if f.suffix.lower() in {".webp", ".jpg", ".jpeg", ".png"}
    )

    if not image_files:
        print(f"Error: no image files found in '{covers_dir}'.", file=sys.stderr)
        sys.exit(1)

    print(f"Found {len(image_files)} cover images in {covers_dir}", flush=True)

    # Load existing results if resuming
    existing: dict[str, dict] = {}
    if args.resume and out_path.exists():
        with open(out_path) as f:
            for entry in json.load(f):
                existing[entry["id"]] = entry
        print(f"Resuming: {len(existing)} covers already processed", flush=True)

    # Split into already-done and to-process
    to_process = []
    results_by_id: dict[str, dict] = dict(existing)
    for img_path in image_files:
        if img_path.stem not in existing:
            to_process.append(img_path)

    if not to_process:
        print("All covers already processed!")
        return

    print(f"Processing {len(to_process)} covers with {args.workers} workers...", flush=True)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    start = time.time()
    done = 0
    errors = 0

    with ProcessPoolExecutor(max_workers=args.workers) as executor:
        futures = {
            executor.submit(process_one, str(p)): p for p in to_process
        }

        for future in as_completed(futures):
            entry = future.result()
            results_by_id[entry["id"]] = entry
            done += 1
            if "error" in entry:
                errors += 1
                print(f"  Error: {entry['id']}: {entry['error']}", file=sys.stderr, flush=True)

            # Progress + periodic save every 50 covers
            if done % 50 == 0 or done == len(to_process):
                elapsed = time.time() - start
                rate = done / elapsed if elapsed > 0 else 0
                eta = (len(to_process) - done) / rate if rate > 0 else 0
                print(f"  {done}/{len(to_process)} ({rate:.1f}/s, ETA {eta/60:.0f}min)", flush=True)

                # Save in filename-sorted order
                ordered = [results_by_id[f.stem] for f in image_files if f.stem in results_by_id]
                with open(out_path, "w") as f:
                    json.dump(ordered, f, ensure_ascii=False)

    # Final save in filename-sorted order
    ordered = [results_by_id[f.stem] for f in image_files if f.stem in results_by_id]
    with open(out_path, "w") as f:
        json.dump(ordered, f, ensure_ascii=False)

    elapsed = time.time() - start
    print(f"\nDone! {len(ordered)} entries in {elapsed:.0f}s ({errors} errors)")
    print(f"File size: {out_path.stat().st_size / 1024:.1f} KB")


if __name__ == "__main__":
    main()
