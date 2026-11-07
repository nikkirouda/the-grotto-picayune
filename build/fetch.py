#!/usr/bin/env python3
"""Fetch every source in feeds.yml, normalise, de-duplicate, find a photo for each story,
pull the weather for each place, and write the bundle the site reads.

Run from the repo root:  python3 build/fetch.py
Environment:
  NEWS_PASSPHRASE   unlocks private.enc (your extra sources, preferences and votes) and encrypts the
                    published bundle (site/data/bundle.enc). The site asks for it once per device.
                    Without it, and without a private.enc, the build runs on feeds.yml plus
                    config/preferences.json (or the example file) and publishes in the clear.
  STORE_PATH        where the 14-day archive lives (default data/store.json; kept in the Actions cache)
  OG_BUDGET         how many article pages to visit for a missing photo per run (default 80)
  ARTICLE_BUDGET    how many new stories get their full text fetched per run (default 250)
"""
import concurrent.futures as cf
import datetime as dt
import hashlib
import html
import json
import os
import re
import sys
import time
from urllib.parse import urlparse, urlunparse, parse_qsl, urlencode, urljoin

import feedparser
import requests
import yaml

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from private import encrypt_bytes, load_private, derive_key, encrypt_with_key  # noqa: E402
import base64  # noqa: E402
import shutil  # noqa: E402
try:
    import trafilatura  # noqa: E402
except ImportError:  # the build installs it; a bare local run still works without the reader
    trafilatura = None

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STORE_PATH = os.environ.get("STORE_PATH") or os.path.join(ROOT, "data", "store.json")
ARTICLES_DIR = os.path.join(os.path.dirname(STORE_PATH), "articles")   # full texts, one JSON per story, cache only
MAX_ARTICLE_CHARS = 40_000
UA = "household-news/0.1 (personal RSS reader; +https://github.com/nikkirouda)"
KEEP_DAYS = 14          # how long a story stays in the store (searchable history)
PUBLISH_DAYS = 7        # how much of it the site receives
MAX_SUMMARY = 320
NOW = dt.datetime.now(dt.timezone.utc)

def log(*a):
    print(*a, file=sys.stderr, flush=True)

def load_json(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return default

# ---------------------------------------------------------------- helpers
TRACKING = {"utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id",
            "fbclid", "gclid", "mc_cid", "mc_eid", "ref", "source", "cmpid", "ns_mchannel", "ns_campaign", "ns_source"}

def canonical(url):
    try:
        p = urlparse(url.strip())
        q = [(k, v) for k, v in parse_qsl(p.query, keep_blank_values=True) if k.lower() not in TRACKING]
        host = p.netloc.lower()
        if host.startswith("www."):
            host = host[4:]
        path = p.path.rstrip("/") or "/"
        return urlunparse(("https", host, path, "", urlencode(q), ""))
    except Exception:
        return url

TAG_RE = re.compile(r"<[^>]+>")
WS_RE = re.compile(r"\s+")
IMG_RE = re.compile(r"""<img[^>]+src=["']([^"']+)["']""", re.I)

def clean_text(s):
    if not s:
        return ""
    s = TAG_RE.sub(" ", s)
    s = html.unescape(s)
    s = WS_RE.sub(" ", s).strip()
    return s

def trim(s, n=MAX_SUMMARY):
    if len(s) <= n:
        return s
    cut = s[:n].rsplit(" ", 1)[0]
    return cut.rstrip(" ,;:-") + "…"

def norm_title(t):
    t = re.sub(r"[^a-z0-9 ]", " ", t.lower())
    return WS_RE.sub(" ", t).strip()

def entry_time(e):
    for key in ("published_parsed", "updated_parsed", "created_parsed"):
        tp = e.get(key)
        if tp:
            try:
                return dt.datetime(*tp[:6], tzinfo=dt.timezone.utc)
            except Exception:
                pass
    return None

def entry_image(e):
    # media:content / media:thumbnail
    for key in ("media_content", "media_thumbnail"):
        for m in e.get(key, []) or []:
            u = m.get("url")
            if u and (m.get("medium") in (None, "image") or str(m.get("type", "")).startswith("image")):
                if not re.search(r"\.(mp4|mp3|m4a|webm)(\?|$)", u, re.I):
                    return u
    for l in (e.get("enclosures") or []) + (e.get("links") or []):
        if str(l.get("type", "")).startswith("image") and l.get("href"):
            return l["href"]
    blobs = [c.get("value", "") for c in e.get("content", []) or []] + [e.get("summary", "")]
    for b in blobs:
        m = IMG_RE.search(b or "")
        if m:
            u = m.group(1)
            if "feedburner" in u or "pixel" in u or u.endswith(".gif") or "1x1" in u:
                continue
            return u
    return None

def abs_url(base, u):
    if not u:
        return u
    if u.startswith("//"):
        return "https:" + u
    if u.startswith("/"):
        p = urlparse(base)
        return f"{p.scheme}://{p.netloc}{u}"
    return u

# ---------------------------------------------------------------- fetching
def fetch_source(src, http_cache):
    sid = src["id"]
    headers = {"User-Agent": UA, "Accept": "application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.8"}
    cache = http_cache.get(sid, {})
    if cache.get("etag"):
        headers["If-None-Match"] = cache["etag"]
    if cache.get("last_modified"):
        headers["If-Modified-Since"] = cache["last_modified"]
    t0 = time.time()
    try:
        r = requests.get(src["url"], headers=headers, timeout=25)
    except Exception as ex:
        return sid, None, f"error {type(ex).__name__}", time.time() - t0, cache
    if r.status_code == 304:
        return sid, [], "unchanged", time.time() - t0, cache
    if r.status_code != 200:
        return sid, None, f"http {r.status_code}", time.time() - t0, cache
    feed = feedparser.parse(r.content)
    new_cache = {"etag": r.headers.get("ETag"), "last_modified": r.headers.get("Last-Modified"), "checked": NOW.isoformat()}
    items = []
    for e in feed.entries:
        link = e.get("link") or ""
        title = clean_text(e.get("title", ""))
        if not link or not title:
            continue
        when = entry_time(e)
        summary = ""
        for c in e.get("content", []) or []:
            summary = clean_text(c.get("value", ""))
            if summary:
                break
        if not summary:
            summary = clean_text(e.get("summary", ""))
        if summary.lower().startswith(title.lower()):
            summary = summary[len(title):].lstrip(" .-–—:")
        img = abs_url(link, entry_image(e))
        items.append({
            "url": canonical(link),
            "orig_url": link,
            "title": title,
            "summary": trim(summary),
            "image": img,
            "published": when.isoformat() if when else None,
            "source": sid,
        })
    return sid, items, f"ok {len(items)}", time.time() - t0, new_cache

def og_image(url):
    """Visit an article page and return its og:image, or '' if none. Honest UA, small read."""
    try:
        r = requests.get(url, headers={"User-Agent": UA, "Accept": "text/html"}, timeout=10, stream=True)
        if r.status_code != 200 or "html" not in r.headers.get("Content-Type", ""):
            return ""
        head = r.raw.read(200_000, decode_content=True).decode("utf-8", "ignore")
        for pat in (r"""<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']""",
                    r"""<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']""",
                    r"""<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']"""):
            m = re.search(pat, head, re.I)
            if m:
                return abs_url(url, html.unescape(m.group(1)))
        return ""
    except Exception:
        return ""

ARTICLE_VERSION = 2
ALLOWED_TAGS = {"p", "h2", "h3", "h4", "ul", "ol", "li", "blockquote", "strong", "em", "b", "i", "br", "img", "figure", "figcaption"}
BAD_IMG = re.compile(r"logo|icon|avatar|sprite|badge|pixel|1x1|spacer|placeholder|emoji|\.svg(\?|$)|/ads?/|doubleclick|gravatar", re.I)
BAD_MEDIA = re.compile(r"\.(mp4|m3u8|flv|webm|mov|mp3)(\?|$)|/video/|hlsvod|/flv/", re.I)
BAD_ZONE = re.compile(r"related|recommend|teaser|promo|sidebar|footer|nav|share|comment|newsletter|subscribe|trending|popular|most-read|cookie|banner|author|byline|widget", re.I)

def _biggest_from_srcset(srcset):
    best, best_w = None, -1
    for part in srcset.split(","):
        bits = part.strip().split()
        if not bits:
            continue
        w = 0
        if len(bits) > 1 and bits[1].endswith("w"):
            try:
                w = int(bits[1][:-1])
            except ValueError:
                w = 0
        if w > best_w:
            best, best_w = bits[0], w
    return best

def _img_key(u):
    """Loose identity for an image URL: host+path without size/query noise."""
    try:
        p = urlparse(u)
        path = re.sub(r"(\.(jpe?g|png|webp|avif|gif))+$", "", p.path, flags=re.I)
        return (p.netloc.lower().replace("www.", "") + re.sub(r"[-_/]\d{2,4}x\d{2,4}|[-_]\d{3,4}$", "", path)).lower()
    except Exception:
        return u

def page_images(doc, base_url, limit=6):
    """Content photos from the page itself: inside article/main when present, never in nav, aside,
    header, footer or anything that smells like related links; lazy-loaded and srcset images included."""
    roots = doc.xpath("//article | //main") or [doc]
    out, seen = [], set()
    for root in roots:
        for el in root.iter("img", "source"):
            par = el.getparent()
            if el.tag == "source" and (par is None or par.tag != "picture"):
                continue                      # <video>/<audio> sources are not pictures
            anc = el
            bad = False
            while anc is not None and anc is not root:
                tag = anc.tag if isinstance(anc.tag, str) else ""
                if tag in ("nav", "aside", "header", "footer", "form", "noscript", "button", "a") and tag != "a":
                    bad = True; break
                cls = (anc.get("class") or "") + " " + (anc.get("id") or "")
                if tag in ("nav", "aside", "header", "footer", "form") or BAD_ZONE.search(cls):
                    bad = True; break
                anc = anc.getparent()
            if bad:
                continue
            src = None
            for attr in ("srcset", "data-srcset"):
                if el.get(attr):
                    src = _biggest_from_srcset(el.get(attr)); break
            if not src:
                for attr in ("data-src", "data-lazy-src", "data-original", "src"):
                    if el.get(attr) and not el.get(attr).startswith("data:"):
                        src = el.get(attr); break
            if not src or src.startswith("data:") or BAD_IMG.search(src) or BAD_MEDIA.search(src):
                continue
            try:
                w = int(re.sub(r"\D", "", el.get("width") or "0") or 0)
                h = int(re.sub(r"\D", "", el.get("height") or "0") or 0)
            except ValueError:
                w = h = 0
            if (w and w < 300) or (h and h < 200):
                continue
            src = urljoin(base_url, src)
            key = _img_key(src)
            if key in seen:
                continue
            seen.add(key)
            alt = (el.get("alt") or "").strip()
            if not alt and el.tag == "source":
                sib = el.getparent().find(".//img") if el.getparent() is not None else None
                alt = (sib.get("alt") or "").strip() if sib is not None else ""
            fig = el
            cap = ""
            for _ in range(4):
                fig = fig.getparent()
                if fig is None:
                    break
                fc = fig.find(".//figcaption")
                if fc is not None:
                    cap = " ".join(fc.itertext()).strip(); break
            out.append({"src": src, "alt": alt[:200], "caption": cap[:300]})
            if len(out) >= limit:
                return out
    return out

def sanitize_article(html_text, base_url):
    """Keep only simple tags from the extractor's HTML, absolutize image URLs, drop the title."""
    from lxml import html as LH
    try:
        doc = LH.fromstring(html_text)
    except Exception:
        return "", ""
    for bad in doc.xpath("//script|//style|//iframe|//form|//noscript|//h1|//object|//embed|//video|//audio|//svg"):
        bad.drop_tree()
    for el in list(doc.iter()):
        if not isinstance(el.tag, str):
            continue
        if el.tag == "img":
            src = el.get("src") or el.get("data-src") or ""
            if not src or src.startswith("data:") or BAD_IMG.search(src):
                el.drop_tree(); continue
            el.attrib.clear(); el.set("src", urljoin(base_url, src))
            if el.getparent() is not None and el.getparent().tag == "figure":
                pass
            continue
        if el.tag in ("html", "body"):
            continue
        if el.tag in ALLOWED_TAGS:
            keep_alt = el.get("alt")
            el.attrib.clear()
            if keep_alt and el.tag == "img":
                el.set("alt", keep_alt[:200])
        else:
            el.drop_tag()   # unwrap: keep the text, lose the tag
    body = doc.find("body") if doc.tag == "html" else doc
    if body is None:
        body = doc
    inner = "".join(LH.tostring(c, encoding="unicode") if isinstance(c.tag, str) else "" for c in body) if len(body) else ""
    if body.text and body.text.strip():
        inner = "<p>" + html.escape(body.text.strip()) + "</p>" + inner
    text = " ".join(body.itertext()).strip()
    return inner, text

def article_text(url):
    """Visit the story and return {'html', 'text', 'images'} or None: readable text with the pictures
    the extractor kept in place, plus other content photos found on the page (with captions).
    Honest UA, 12 s, 1.5 MB cap. A short result means a teaser or a blocked page: treated as none."""
    if trafilatura is None:
        return None
    try:
        r = requests.get(url, headers={"User-Agent": UA, "Accept": "text/html"}, timeout=12, stream=True)
        if r.status_code != 200 or "html" not in r.headers.get("Content-Type", ""):
            return None
        html_text = r.raw.read(1_500_000, decode_content=True).decode(r.encoding or "utf-8", "ignore")
        out = trafilatura.extract(html_text, url=url, output_format="html", include_images=True, include_links=False,
                                  include_comments=False, include_tables=False, favor_precision=True)
        if not out:
            return None
        body_html, text = sanitize_article(out, url)
        if len(text) < 400:
            return None
        images = []
        try:
            from lxml import html as LH
            images = page_images(LH.fromstring(html_text), url)
        except Exception:
            images = []
        inline_keys = {_img_key(u) for u in re.findall(r'src="([^"]+)"', body_html)}
        images = [im for im in images if _img_key(im["src"]) not in inline_keys]
        return {"html": body_html[:MAX_ARTICLE_CHARS * 2], "text": text[:MAX_ARTICLE_CHARS], "images": images}
    except Exception:
        return None

def weather_for(place, attempt=0):
    """Open-Meteo, no key. Returns a small dict or None. One retry on a slow or rate-limited answer."""
    try:
        r = requests.get("https://api.open-meteo.com/v1/forecast", params={
            "latitude": place["lat"], "longitude": place["lon"], "timezone": place.get("tz", "auto"),
            "current": "temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m",
            "daily": "temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code,sunrise,sunset",
            "temperature_unit": "fahrenheit", "wind_speed_unit": "mph", "forecast_days": 3,
        }, headers={"User-Agent": UA}, timeout=15)
        if r.status_code != 200:
            if attempt == 0:
                time.sleep(3)
                return weather_for(place, 1)
            return None
        d = r.json()
        cur, day = d.get("current", {}), d.get("daily", {})
        return {
            "temp": cur.get("temperature_2m"), "code": cur.get("weather_code"), "wind": cur.get("wind_speed_10m"),
            "humidity": cur.get("relative_humidity_2m"),
            "days": [{"date": day["time"][i], "hi": day["temperature_2m_max"][i], "lo": day["temperature_2m_min"][i],
                      "pop": (day.get("precipitation_probability_max") or [None]*3)[i], "code": day["weather_code"][i]}
                     for i in range(len(day.get("time", [])))],
            "sunrise": (day.get("sunrise") or [None])[0], "sunset": (day.get("sunset") or [None])[0],
            "fetched": NOW.isoformat(),
        }
    except Exception as ex:
        if attempt == 0:
            time.sleep(3)
            return weather_for(place, 1)
        log("weather", place["id"], type(ex).__name__)
        return None

# ---------------------------------------------------------------- main
def main():
    passphrase = os.environ.get("NEWS_PASSPHRASE", "").strip()
    feeds = yaml.safe_load(open(os.path.join(ROOT, "feeds.yml"), encoding="utf-8"))["sources"]
    private = load_private(passphrase)
    if private:
        feeds = feeds + list(private.get("sources", []))
        prefs = private.get("preferences", {})
        feedback = private.get("feedback", {"votes": {}})
        log(f"private.enc: {len(private.get('sources', []))} sources, {len(prefs.get('blocked_terms', []))} blocked terms, {len(feedback.get('votes', {}))} votes")
    else:
        prefs = load_json(os.path.join(ROOT, "config", "preferences.json"), None) or load_json(os.path.join(ROOT, "config", "preferences.example.json"), {})
        feedback = {"votes": {}}
    seen_ids = set()
    feeds = [s for s in feeds if not (s["id"] in seen_ids or seen_ids.add(s["id"]))]
    store = load_json(STORE_PATH, {})
    store.setdefault("items", {}); store.setdefault("images", {}); store.setdefault("http", {}); store.setdefault("health", {})
    by_id = {s["id"]: s for s in feeds}

    # 1. fetch all feeds
    results = {}
    with cf.ThreadPoolExecutor(max_workers=16) as ex:
        for sid, items, status, secs, cache in ex.map(lambda s: fetch_source(s, store["http"]), feeds):
            results[sid] = (items, status)
            store["http"][sid] = cache
            h = store["health"].setdefault(sid, {})
            h["last_status"] = status; h["last_checked"] = NOW.isoformat()
            if items is not None:
                h["last_ok"] = NOW.isoformat()
            log(f"{sid:18} {status:14} {secs:4.1f}s")

    # 2. merge into the store
    new_ids = []
    for sid, (items, status) in results.items():
        if not items:
            continue
        src = by_id[sid]
        for it in items:
            iid = hashlib.sha1(it["url"].encode()).hexdigest()[:16]
            pub = it["published"]
            if pub and dt.datetime.fromisoformat(pub) < NOW - dt.timedelta(days=KEEP_DAYS):
                continue
            old = store["items"].get(iid)
            if old:
                # refresh mutable bits, keep first-seen
                old["title"] = it["title"] or old["title"]
                old["summary"] = it["summary"] or old["summary"]
                old["image"] = old.get("image") or it["image"]
                if pub and not old.get("published"):
                    old["published"] = pub
                continue
            rec = {
                "id": iid, "url": it["url"], "title": it["title"], "summary": it["summary"], "image": it["image"],
                "published": pub or NOW.isoformat(), "seen": NOW.isoformat(), "source": sid,
                "section": src["section"], "tags": sorted(set(src.get("tags", []) + ([src["place"]] if src.get("place") else []))),
                "place": src.get("place"),
            }
            store["items"][iid] = rec
            new_ids.append(iid)
    log(f"new stories: {len(new_ids)}  store: {len(store['items'])}")

    # 3. prune the store
    cutoff = NOW - dt.timedelta(days=KEEP_DAYS)
    for iid in [k for k, v in store["items"].items() if dt.datetime.fromisoformat(v["published"]) < cutoff]:
        store["items"].pop(iid, None); store["images"].pop(iid, None)

    # 4. photos for stories that came without one (newest first, bounded)
    budget = int(os.environ.get("OG_BUDGET", "80"))
    want = [store["items"][i] for i in new_ids if not store["items"][i].get("image") and i not in store["images"]]
    want.sort(key=lambda r: r["published"], reverse=True)
    want = want[:budget]
    if want:
        with cf.ThreadPoolExecutor(max_workers=12) as ex:
            for rec, img in zip(want, ex.map(lambda r: og_image(r["url"]), want)):
                store["images"][rec["id"]] = img or ""
                if img:
                    rec["image"] = img
        log(f"photos looked up: {len(want)}, found: {sum(1 for r in want if r.get('image'))}")

    # 4b. full text for new stories (newest first, bounded); kept in the cache next to the store
    os.makedirs(ARTICLES_DIR, exist_ok=True)
    abudget = int(os.environ.get("ARTICLE_BUDGET", "250"))
    def _article_state(iid):
        ap = os.path.join(ARTICLES_DIR, iid + ".json")
        if not os.path.exists(ap):
            return 0                      # never fetched
        rec = load_json(ap, {})
        if rec.get("v", 1) >= ARTICLE_VERSION or not rec.get("text"):
            return 2                      # current, or known-unreadable: leave it
        return 1                          # older text-only record: refresh when there is room
    cands = [v for v in store["items"].values() if by_id.get(v["source"], {}).get("fulltext", True)
             and dt.datetime.fromisoformat(v["published"]) >= NOW - dt.timedelta(days=PUBLISH_DAYS)]
    cands = [(v, _article_state(v["id"])) for v in cands]
    fresh = sorted([v for v, st in cands if st == 0], key=lambda r: r["published"], reverse=True)
    stale = sorted([v for v, st in cands if st == 1], key=lambda r: r["published"], reverse=True)
    want = (fresh + stale)[:abudget]
    got = 0
    if want:
        with cf.ThreadPoolExecutor(max_workers=12) as ex:
            for rec, art in zip(want, ex.map(lambda r: article_text(r["url"]), want)):
                with open(os.path.join(ARTICLES_DIR, rec["id"] + ".json"), "w", encoding="utf-8") as f:
                    json.dump(dict(art or {"text": None}, v=ARTICLE_VERSION, fetched=NOW.isoformat()), f, ensure_ascii=False)
                got += bool(art)
        log(f"full text fetched for {len(want)} stories, readable: {got}, with extra pictures: {sum(1 for _ in want)}")
    for name in os.listdir(ARTICLES_DIR):
        if name[:-5] not in store["items"]:
            os.remove(os.path.join(ARTICLES_DIR, name))

    # 5. weather
    weather = {}
    for place in prefs.get("places", []):
        w = weather_for(place)
        if w:
            weather[place["id"]] = w

    # 6. publish bundle (last PUBLISH_DAYS, muted sources removed; blocking happens in the browser
    #    from the same preferences, so an edit there takes effect without a rebuild)
    muted = set(prefs.get("muted_sources", []))
    pub_cutoff = NOW - dt.timedelta(days=PUBLISH_DAYS)
    items = [v for v in store["items"].values() if v["source"] not in muted and dt.datetime.fromisoformat(v["published"]) >= pub_cutoff]
    # collapse the same story from several sources
    seen_titles = {}
    for v in sorted(items, key=lambda r: by_id.get(r["source"], {}).get("weight", 1), reverse=True):
        key = norm_title(v["title"])
        if key in seen_titles:
            seen_titles[key].setdefault("also", []).append(v["source"])
            v["_dup"] = True
        else:
            seen_titles[key] = v
    items = [v for v in items if not v.pop("_dup", False)]
    items.sort(key=lambda r: r["published"], reverse=True)
    adir = os.path.join(ROOT, "site", "data", "a")
    shutil.rmtree(adir, ignore_errors=True)
    os.makedirs(adir, exist_ok=True)
    # one stable salt per site (kept with the archive), so a page opened before a rebuild still unlocks articles
    salt_path = os.path.join(os.path.dirname(STORE_PATH), "salt.bin")
    try:
        with open(salt_path, "rb") as f:
            salt = f.read()
        assert len(salt) == 16
    except Exception:
        salt = os.urandom(16)
        os.makedirs(os.path.dirname(salt_path), exist_ok=True)
        with open(salt_path, "wb") as f:
            f.write(salt)
    ckey = derive_key(passphrase, salt) if passphrase else None
    readable = 0
    for r in items:
        ap = os.path.join(ARTICLES_DIR, r["id"] + ".json")
        art = load_json(ap, {}) if os.path.exists(ap) else {}
        txt = art.get("text")
        if not txt:
            continue
        hero = _img_key(r["image"]) if r.get("image") else None
        images = [im for im in art.get("images", []) if _img_key(im["src"]) != hero]
        body = json.dumps({"id": r["id"], "text": txt, "html": art.get("html"), "images": images}, ensure_ascii=False).encode("utf-8")
        with open(os.path.join(adir, r["id"] + (".bin" if ckey else ".json")), "wb") as f:
            f.write(encrypt_with_key(body, ckey) if ckey else body)
        r["reader"] = len(txt.split())
        readable += 1
    out_items = [{k: v for k, v in r.items() if k in ("id", "url", "title", "summary", "image", "published", "source", "section", "tags", "place", "also", "reader")}
                 for r in items]
    bundle = {
        "generated": NOW.isoformat(),
        "items": out_items,
        "weather": weather,
        "prefs": prefs,
        "feedback": feedback,
        "sources": [{"id": s["id"], "name": s["name"], "home": s.get("home"), "section": s["section"], "weight": s.get("weight", 1.0),
                     "health": store["health"].get(s["id"], {}).get("last_status")} for s in feeds],
        "stats": {"stories": len(out_items), "new": len(new_ids), "sources_ok": sum(1 for s in feeds if (results.get(s["id"]) or (None, ""))[1].startswith(("ok", "unchanged")))},
    }
    os.makedirs(os.path.join(ROOT, "site", "data"), exist_ok=True)
    raw = json.dumps(bundle, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    enc_path, plain_path = os.path.join(ROOT, "site", "data", "bundle.enc"), os.path.join(ROOT, "site", "data", "bundle.json")
    if passphrase:
        with open(enc_path, "wb") as f:
            f.write(encrypt_bytes(raw, passphrase))
        if os.path.exists(plain_path):
            os.remove(plain_path)
    else:
        with open(plain_path, "wb") as f:
            f.write(raw)
        if os.path.exists(enc_path):
            os.remove(enc_path)
    with open(os.path.join(ROOT, "site", "data", "manifest.json"), "w", encoding="utf-8") as f:
        json.dump({"generated": NOW.isoformat(), "encrypted": bool(passphrase), "stories": len(out_items), "readable": readable,
                   "salt": base64.b64encode(salt).decode() if ckey else None}, f)
    os.makedirs(os.path.dirname(STORE_PATH), exist_ok=True)
    with open(STORE_PATH, "w", encoding="utf-8") as f:
        json.dump(store, f, ensure_ascii=False, separators=(",", ":"))
    log(f"published {len(out_items)} stories ({len(raw)//1024} KB{', encrypted' if passphrase else ''}), {readable} with full text; weather for {len(weather)} places")

if __name__ == "__main__":
    main()
