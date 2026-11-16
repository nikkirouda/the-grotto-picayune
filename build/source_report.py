"""Print each PUBLIC source's last fetch status, for the end of the build log (the log is public, so
private sources from private.enc are never named here)."""
import json, os, yaml
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
store = json.load(open(os.path.join(ROOT, "data", "store.json"))) if os.path.exists(os.path.join(ROOT, "data", "store.json")) else {}
health = store.get("health", {})
feeds = yaml.safe_load(open(os.path.join(ROOT, "feeds.yml")))
feeds = feeds.get("sources", feeds) if isinstance(feeds, dict) else feeds
bad = []
for s in feeds:
    st = (health.get(s["id"]) or {}).get("last_status", "not fetched")
    if not str(st).startswith(("ok", "unchanged")):
        bad.append(f"  {s['id']:20} {st}")
print(f"source report: {len(feeds) - len(bad)} of {len(feeds)} public sources answering")
print("\n".join(bad) if bad else "  all answering")
