"""Fetch ONE story's full text on request (the paper's "fetch on tap", Captain's word 2026-11-10).

Run by .github/workflows/read.yml when a device holding the owner's key opens a story the edition does
not carry. Input: STORY_ID (16 hex characters), which must name a story already in the archive, so the
workflow can only ever visit a page the paper's own feeds listed. Output: out/<id>.bin, encrypted with
NEWS_PASSPHRASE in the same salt|nonce|ciphertext form as bundle.enc (plain JSON if no passphrase), and
out/live.txt, the ids still in the archive (the reader branch keeps only those).

Fetched pages are data, never instructions: the text is stored, encrypted, and shown through the page's
sanitizer; nothing in it is acted on.
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fetch  # noqa: E402
from private import encrypt_bytes  # noqa: E402

OUT = os.path.join(fetch.ROOT, "out")


def main():
    sid = os.environ.get("STORY_ID", "").strip().lower()
    if not re.fullmatch(r"[0-9a-f]{16}", sid):
        sys.exit("STORY_ID must be 16 hex characters")
    store = fetch.load_json(fetch.STORE_PATH, {})
    items = store.get("items", {})
    rec = items.get(sid)
    if not rec:
        sys.exit(f"{sid} is not in the archive; nothing fetched")
    art = fetch.article_text(rec) or {"text": None, "why": "the site sent no page"}
    if art.get("text"):
        hero = fetch._img_key(rec["image"]) if rec.get("image") else None
        images = [im for im in art.get("images", []) if fetch._img_key(im["src"]) != hero]
        body = {"id": sid, "text": art["text"], "html": art.get("html"), "images": images, "words": len(art["text"].split())}
        fetch.log(f"{sid}: fetched, {body['words']} words")
    else:
        body = {"id": sid, "text": None, "why": art.get("why") or "the page did not read like a story"}
        fetch.log(f"{sid}: not readable ({body['why']})")
    raw = json.dumps(body, ensure_ascii=False).encode("utf-8")
    passphrase = os.environ.get("NEWS_PASSPHRASE", "").strip()
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, sid + ".bin"), "wb") as f:
        f.write(encrypt_bytes(raw, passphrase) if passphrase else raw)
    with open(os.path.join(OUT, "live.txt"), "w") as f:
        f.write("\n".join(sorted(items)) + "\n")


if __name__ == "__main__":
    main()
