"""Make the Type Case puzzles (site/play/typecase.json): one seven-letter tray per day for 400 days.

    python3 build/make_typecase.py /path/to/enable1.txt     (needs: pip install wordfreq)

Words come from the public-domain ENABLE list, kept only if reasonably common (wordfreq), so the answers are
words a reader knows. Deterministic: the same inputs give the same file. Run by hand when a fresh year is wanted.
"""
import json, os, random, sys
from wordfreq import zipf_frequency as z

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUDE = {"anal","anus","arse","bitch","boob","cock","coon","crap","cunt","damn","dick","dildo","dyke","fag","fuck","homo","jism","kike","nazi","negro","nigga","piss","porn","pube","rape","scat","sexed","shit","slut","smut","spic","tits","turd","twat","wank","whore"}
words = [w.strip().lower() for w in open(sys.argv[1]) if w.strip().isalpha()]
words = [w for w in words if len(w) >= 4 and len(set(w)) <= 7 and not any(r in w for r in RUDE)]
freq = {w: z(w, "en") for w in words}
common = [w for w in words if freq[w] >= 2.7]
seeds = sorted({"".join(sorted(set(w))) for w in common if len(set(w)) == 7 and "s" not in w and freq[w] >= 3.2})
rng = random.Random(20261128); rng.shuffle(seeds)
out, used = [], set()
for letters in seeds:
    if len(out) >= 400: break
    ls = set(letters)
    fits = [w for w in common if set(w) <= ls]
    keys = list(letters); rng.shuffle(keys)
    for key in keys:
        ans = sorted(w for w in fits if key in w)
        full = [w for w in ans if set(w) == ls]
        if 22 <= len(ans) <= 55 and full and (letters, key) not in used:
            used.add((letters, key))
            rare = sorted(w for w in words if set(w) <= ls and key in w and freq[w] < 2.7)   # real but uncommon: accepted as a bonus
            out.append({"key": key, "letters": "".join(c for c in letters if c != key), "words": ans, "more": rare})
            break
json.dump({"start": "2026-11-28", "puzzles": out}, open(os.path.join(ROOT, "site", "play", "typecase.json"), "w"), separators=(",", ":"))
print(len(out), "puzzles; words per puzzle", min(len(p["words"]) for p in out), "to", max(len(p["words"]) for p in out))
