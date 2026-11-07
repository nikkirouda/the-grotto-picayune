# The Grotto Picayune

A private, ad-free news page: it shows what you care about, skips what you don't, and keeps local
sections for the places that matter. Static site on GitHub Pages, rebuilt every hour by GitHub Actions
from free sources that need no login. Works on a laptop or a phone (add it to the home screen).
Search covers the last seven days.

**Public engine, private newspaper.** This repository is public so that GitHub Pages is free, but
nothing personal is in the clear:

| In the open | Encrypted (`private.enc`, key = the `NEWS_PASSPHRASE` secret) | Not in the repo at all |
|---|---|---|
| the code, this README | your extra sources (the places), your preferences (blocked and boosted words, places, lenses, muted sources), your votes | the 14-day archive (lives in the Actions cache), the published bundle is encrypted too |
| `feeds.yml`: generic sources (world, science, hobbies, Rhode Island) | | |

The page asks for the passphrase once per device and decrypts in the browser (AES-256-GCM, key from
PBKDF2-SHA256). Every page is `noindex`, and `robots.txt` says keep out.

## How it works

```
feeds.yml  +  private.enc{sources, preferences, feedback}
        └──► build/fetch.py ──► data/store.json (archive, Actions cache only)
                           └──► site/data/bundle.enc  (last 7 days + weather + prefs + votes)
site/ (index.html, app.js) ──► GitHub Pages
```

- **Sources** are one line each: name, feed URL, section, tags, weight. Every one was checked live on
  2026-11-07; sources that refuse a feed reader or sit behind a paywall were left out. The fetcher
  identifies itself honestly and never pretends to be a browser.
- **Preferences**: blocked words, boosted words, muted sources, the places (with coordinates for
  weather) and the sections. A section can also be a *lens*: a list of `match` terms that pulls
  matching stories from every source (that is how Brown University gets a section without a feed).
  `config/preferences.example.json` shows the shape.
- **The build** fetches all feeds in parallel, de-duplicates, trims tracking parameters, finds a photo
  (feed media first, then the article's `og:image` for up to 80 stories a run), pulls Open-Meteo
  weather for each place, and writes the bundle.
- **The reader.** For up to 250 new stories a run the build also visits the story and keeps its readable
  text (trafilatura), one small encrypted file per story under `site/data/a/`. Tapping a headline then
  opens the story inside the page: text and photo, no ads, no cookie banners, with a *read at source*
  link. Stories whose page gave no usable text (paywalls, teasers, sites that refuse readers) open at
  the source as before. The texts are for your own reading; the files are encrypted like everything
  else and never republished. A source can opt out with `fulltext: false` in `feeds.yml`.
- **Ranking** happens in the browser, one method, in `site/app.js`:
  `score = source weight × (1 + 0.2 × boosted-word hits) × e^(−age/24h) × 2^(learned/3)`
  where `learned` is what your 👍/👎 taught it about the story's source, topics and headline words
  (each part clipped to ±3). A story at or below the hide threshold (default −2) is hidden. Blocked
  words remove a story outright. Each card's grey note says why it ranks where it does.
- **Votes and preferences** live in the browser and travel in the bundle, so a new device gets them
  after unlocking. With a GitHub token in Settings, edits and votes are written back into
  `private.enc` (encrypted in the browser first), so phone and laptop share them and the next hourly
  build uses your latest words.

## Setup (once)

1. Push to a public repository; Settings → Pages → Source: **GitHub Actions**.
2. Settings → Secrets and variables → Actions → new secret **`NEWS_PASSPHRASE`** = the passphrase that
   `private.enc` was made with. (Without it the build cannot read your sources and stops.)
3. Actions → *build* → *Run workflow*. The site appears at `https://<user>.github.io/<repo>/` and asks
   for the passphrase.
4. Optional: a fine-grained personal access token scoped to this repository with
   **Contents: read & write** and **Actions: read & write**; paste it in the site's Settings →
   *Sync between devices*. It enables write-back of votes and preferences and the
   *Refresh the news now* button.

## Everyday

- **For you** ranks everything; **Latest** is chronological; places and topics have their own tabs.
- ★ **Topics** (top right) is where new likes and dislikes go as you think of them: *More of this* floats
  matching stories up; *None of this* removes them. Each chip shows how many of the week's stories it touches.
- A headline marked *in the paper* opens inside the page; ⌘/Ctrl-click still opens the source.
- 👍 / 👎 on any card teaches the ranking; *mute* silences a source; *block…* removes a word everywhere.
- Settings shows what has been learned, the source health from the last build, and backup/restore.
- To add a public source: a line in `feeds.yml`, commit. To add a place or a private source, or to
  change preferences by hand:
  ```bash
  NEWS_PASSPHRASE=… python3 build/private.py show > p.json   # edit p.json
  NEWS_PASSPHRASE=… python3 build/private.py put --from p.json && git commit -am "private: …"
  ```

## Local run

```bash
pip install -r build/requirements.txt
NEWS_PASSPHRASE=… python3 build/fetch.py
python3 -m http.server -d site 8000     # then open http://localhost:8000
```

## Open items

- **Brown University** has no feed a reader can use (brown.edu/news publishes none; the Brown Daily
  Herald and Brown Athletics refuse non-browser clients). Brown is a lens for now.
- Old House Journal and This Old House answered with errors on day one and were kept in case it was
  temporary; source status shows in Settings → Sources after every build.
- Open-Meteo rate-limits shared addresses; a missing weather card means that hour's call was refused.
