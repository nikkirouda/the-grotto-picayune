"""Make the Stop Press word lists (site/play/stoppress.json): daily five-letter answers and every allowed guess.

    python3 build/make_stoppress.py /path/to/enable1.txt     (needs: pip install wordfreq)

Answers are common words (no plain plurals or -ed forms); guesses are every five-letter word in ENABLE.
"""
import json, os, random, sys
from wordfreq import zipf_frequency as z
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUDE = {"anal","anus","arse","bitch","boob","cock","coon","crap","cunt","damn","dick","dildo","dyke","fag","fuck","homo","jism","kike","nazi","negro","nigga","piss","porn","pube","rape","scat","sexed","shit","slut","smut","spic","tits","turd","twat","wank","whore"}
five = sorted({w.strip().lower() for w in open(sys.argv[1]) if len(w.strip()) == 5 and w.strip().isalpha()})
allset = set(five)
ok = lambda w: not any(r in w for r in RUDE)
answers = [w for w in five if ok(w) and z(w, "en") >= 3.7]
four = {w.strip().lower() for w in open(sys.argv[1]) if len(w.strip()) in (3, 4)}
answers = [w for w in answers if not (w.endswith("s") and not w.endswith("ss") and w[:-1] in four) and not (w.endswith("ed") and (w[:-2] in four or w[:-1] in four))]
random.Random(1128).shuffle(answers)
json.dump({"start": "2026-11-28", "answers": answers, "guesses": "".join(w for w in five if ok(w))},
          open(os.path.join(ROOT, "site", "play", "stoppress.json"), "w"), separators=(",", ":"))
print(len(answers), "answers;", len(five), "guesses; first five:", answers[:5])
