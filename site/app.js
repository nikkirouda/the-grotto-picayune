/* The Grotto Picayune — a private, ad-free news page.
   Everything personal (votes, preferences, token) lives in this browser's localStorage and,
   if a token is configured, in the private repository. The build never sees your votes. */
(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};
const STOP = new Set('a an the and or but of to in on at for from by with as is are was were be been it its this that these those his her their our your you we they he she i me my us them than then there here who whom whose what which when where why how not no yes do does did done have has had will would can could should may might must shall into over under after before about above below between through during without within up down out off again further once more most some such only own same so too very just also new says said say says'.split(' '));

// ------------------------------------------------------------- state
let bundle = null;          // {items, weather, prefs, sources, generated}
let prefs = null;           // effective preferences (bundle prefs + local edits)
let votes = LS.get('votes', {});        // id -> {v:+1|-1, t:ms, s:source, tags:[...], tok:[...]}
let read = LS.get('read', {});          // id -> ms
let opts = Object.assign({ images: true, hideRead: false, showHidden: false, compact: false, sort: 'score' }, LS.get('opts', {}));
let route = location.hash.replace(/^#\/?/, '').replace(/\/read$/, '') || 'foryou';
let query = '';
let shown = 0;
const PAGE = 36;
let blockedRe = null, boostRe = null, lensRes = {};
let sourceById = {};
let model = { src: {}, tag: {}, tok: {} };
let currentList = [];
let manifest = {};
let articleKey = null;      // derived once per page load from the manifest's salt
let readerItem = null;

// ------------------------------------------------------------- utilities
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function termRegex(terms) {
  const t = (terms || []).map(x => x.trim()).filter(Boolean);
  if (!t.length) return null;
  const parts = t.map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'));
  // word boundaries that also work next to punctuation/apostrophes
  return new RegExp('(?<![\\w])(?:' + parts.join('|') + ')(?![\\w])', 'i');
}
function tokens(title) {
  return Array.from(new Set(title.toLowerCase().replace(/[^a-z0-9' -]/g, ' ').split(/[\s-]+/).map(w => w.replace(/^'+|'+$/g, '').replace(/'s$/, '')).filter(w => w.length > 3 && !STOP.has(w))));
}
function ago(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(ms / 60000);
  if (m < 60) return `${Math.max(1, m)} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
const WX = { 0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Rime fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle', 56: 'Freezing drizzle', 57: 'Freezing drizzle', 61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 66: 'Freezing rain', 67: 'Freezing rain', 71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains', 80: 'Showers', 81: 'Showers', 82: 'Heavy showers', 85: 'Snow showers', 86: 'Snow showers', 95: 'Thunderstorm', 96: 'Thunderstorm, hail', 99: 'Thunderstorm, hail' };

// ------------------------------------------------------------- preferences
function effectivePrefs() {
  const base = JSON.parse(JSON.stringify(bundle.prefs || {}));
  const local = LS.get('prefsLocal', null);
  if (local) Object.assign(base, local);   // local edits win until synced
  return base;
}
function compilePrefs() {
  blockedRe = termRegex(prefs.blocked_terms);
  boostRe = prefs.boosted_terms && prefs.boosted_terms.length ? new RegExp('(?<![\\w])(?:' + prefs.boosted_terms.map(x => x.trim()).filter(Boolean).map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')).join('|') + ')(?![\\w])', 'gi') : null;
  lensRes = {};
  for (const s of prefs.sections || []) if (s.match && s.match.length) lensRes[s.id] = termRegex(s.match);
  compileLocalLenses();
}
function savePrefsLocal(patch) {
  const local = Object.assign(LS.get('prefsLocal', {}), patch, { _edited: Date.now() });
  LS.set('prefsLocal', local);
  prefs = effectivePrefs();
  compilePrefs();
  scheduleSync();
}

// ------------------------------------------------------------- learning (one method, kept here)
function rebuildModel() {
  model = { src: {}, tag: {}, tok: {} };
  for (const v of Object.values(votes)) {
    model.src[v.s] = (model.src[v.s] || 0) + v.v;
    for (const t of v.tags || []) model.tag[t] = (model.tag[t] || 0) + v.v * 0.5;
    for (const k of v.tok || []) model.tok[k] = (model.tok[k] || 0) + v.v * 0.5;
  }
}
const clip = (x, a) => Math.max(-a, Math.min(a, x));
function learned(it) {
  const s = clip(model.src[it.source] || 0, 3);
  let tg = 0; for (const t of it.tags || []) tg += model.tag[t] || 0;
  let tk = 0; const hits = []; for (const k of it._tok) { const w = model.tok[k] || 0; if (w) { tk += w; hits.push([k, w]); } }
  return { total: s + clip(tg, 3) + clip(tk, 3), s, tg: clip(tg, 3), tk: clip(tk, 3), hits };
}
function score(it) {
  const src = sourceById[it.source] || {};
  const ageH = Math.max(0, (Date.now() - new Date(it.published).getTime()) / 3.6e6);
  const recency = Math.exp(-ageH / 24) + 0.03;
  const boosts = boostRe ? (it._text.match(boostRe) || []).length : 0;
  const base = (src.weight || 1) * (1 + 0.2 * Math.min(boosts, 3)) * recency;
  const L = learned(it);
  return { value: base * Math.pow(2, L.total / 3), base, boosts, L, ageH };
}
function whyText(sc, it) {
  const bits = [];
  const src = sourceById[it.source] || {};
  if (src.weight && src.weight !== 1) bits.push(`source ×${src.weight}`);
  if (sc.boosts) bits.push(`${sc.boosts} boosted word${sc.boosts > 1 ? 's' : ''}`);
  if (sc.L.s) bits.push(`${sc.L.s > 0 ? '+' : ''}${sc.L.s.toFixed(1)} source`);
  if (sc.L.tg) bits.push(`${sc.L.tg > 0 ? '+' : ''}${sc.L.tg.toFixed(1)} topics`);
  if (sc.L.hits.length) bits.push(sc.L.hits.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 2).map(([k, w]) => `${w > 0 ? '+' : ''}${w.toFixed(1)} “${k}”`).join(', '));
  return bits.join(' · ');
}

// ------------------------------------------------------------- data loading
async function loadBundle() {
  setStatus('Loading…');
  const mf = await fetch('data/manifest.json', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null);
  manifest = mf || {};
  if (mf && mf.encrypted) {
    const buf = await fetch('data/bundle.enc', { cache: 'no-store' }).then(r => r.arrayBuffer());
    let pass = LS.get('pass', null);
    while (true) {
      if (!pass) pass = await askPassphrase();
      try { bundle = JSON.parse(new TextDecoder().decode(await decrypt(buf, pass))); LS.set('pass', pass); $('#forgetPass').classList.remove('hidden'); break; }
      catch { pass = null; $('#gateMsg').textContent = 'That passphrase did not unlock it.'; }
    }
    $('#gate').classList.add('hidden');
  } else {
    bundle = await fetch('data/bundle.json', { cache: 'no-store' }).then(r => { if (!r.ok) throw new Error('no bundle'); return r.json(); });
  }
  sourceById = Object.fromEntries((bundle.sources || []).map(s => [s.id, s]));
  for (const it of bundle.items) { it._text = it.title + ' ' + (it.summary || ''); it._tok = tokens(it.title); it._src = (sourceById[it.source] || {}).name || it.source; }
  const bv = (bundle.feedback && bundle.feedback.votes) || {};
  const del = new Set((bundle.feedback && bundle.feedback.deleted) || []);
  const localDel = LS.get('deletedVotes', {});
  for (const [id, v] of Object.entries(bv)) if (!localDel[id] && (!votes[id] || (votes[id].t || 0) < (v.t || 0))) votes[id] = v;
  for (const id of del) if (votes[id] && !(localDel[id]) && (votes[id].t || 0) <= (bundle.feedback.updatedMs || 0)) delete votes[id];
  LS.set('votes', votes);
  prefs = effectivePrefs();
  compilePrefs();
  rebuildModel();
}
function askPassphrase() {
  return new Promise(res => {
    $('#gate').classList.remove('hidden'); $('#status').classList.add('hidden');
    const f = $('#gateForm');
    f.onsubmit = e => { e.preventDefault(); const v = $('#passphrase').value; if (v) res(v); };
    $('#passphrase').focus();
  });
}
async function deriveKey(pass, salt, usage) {
  const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 200000, hash: 'SHA-256' }, km, { name: 'AES-GCM', length: 256 }, false, [usage]);
}
async function encrypt(bytes, pass) {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await deriveKey(pass, salt, 'encrypt'), bytes));
  const out = new Uint8Array(28 + ct.length); out.set(salt, 0); out.set(iv, 16); out.set(ct, 28); return out;
}
async function decrypt(buf, pass) {
  const b = new Uint8Array(buf), salt = b.slice(0, 16), iv = b.slice(16, 28), ct = b.slice(28);
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await deriveKey(pass, salt, 'decrypt'), ct);
}
const bytesToB64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const b64ToBytes = s => Uint8Array.from(atob(s.replace(/\s/g, '')), c => c.charCodeAt(0));

// ------------------------------------------------------------- routing & lists
function allPlaces() { return [...(prefs.places || []), ...(prefs.local_places || [])]; }
function hiddenSet() { return new Set(prefs.hidden_sections || []); }
function sectionsForRoute() {
  if (route.startsWith('place:')) {
    const p = allPlaces().find(x => x.id === route.slice(6));
    return p ? (p.sections || [route]) : [];
  }
  return [route];
}
function compileLocalLenses() {
  for (const p of prefs.local_places || []) if (p.match && p.match.length) lensRes['place:' + p.id] = termRegex(p.match);
}
function visibleItems() {
  const muted = new Set(prefs.muted_sources || []);
  const hideAt = typeof prefs.hide_threshold === 'number' ? prefs.hide_threshold : -2;
  let blocked = 0, hidden = 0;
  const out = [];
  const hid = hiddenSet();
  for (const it of bundle.items) {
    if (muted.has(it.source)) continue;
    if (hid.size && (hid.has(it.section) || (it.place && hid.has('place:' + it.place)))) continue;
    if (blockedRe && blockedRe.test(it._text)) { blocked++; continue; }
    const sc = score(it);
    if (!opts.showHidden && sc.L.total <= hideAt && !votes[it.id]) { hidden++; continue; }
    if (opts.hideRead && read[it.id] && !votes[it.id]) continue;
    it._sc = sc;
    out.push(it);
  }
  return { out, blocked, hidden };
}
function inSection(it, secs) {
  for (const s of secs) {
    if (it.section === s) return true;
    const re = lensRes[s];
    if (re && re.test(it._text)) return true;
  }
  return false;
}
function buildList() {
  const { out, blocked, hidden } = visibleItems();
  let list = out;
  let title = 'For you';
  if (query) {
    const qs = query.toLowerCase().split(/\s+/).filter(Boolean);
    list = out.filter(it => { const t = (it._text + ' ' + it._src).toLowerCase(); return qs.every(q => t.includes(q)); });
    title = `“${query}” — ${list.length} stor${list.length === 1 ? 'y' : 'ies'}`;
  } else if (route === 'latest') {
    title = 'Latest';
  } else if (route !== 'foryou') {
    const secs = sectionsForRoute();
    list = out.filter(it => inSection(it, secs));
    const p = allPlaces().find(x => 'place:' + x.id === route);
    const s = (prefs.sections || []).find(x => x.id === route);
    title = p ? p.name : s ? s.name : route;
  }
  const bySort = (opts.sort === 'time' || route === 'latest') ? (a, b) => new Date(b.published) - new Date(a.published) : (a, b) => b._sc.value - a._sc.value;
  list.sort(bySort);
  if (opts.sort !== 'time' && route !== 'latest') {
    // gentle diversity: each further story from the same source in the top of the list loses a little
    const seen = {};
    for (const it of list) { const n = seen[it.source] || 0; it._rank = it._sc.value * Math.pow(0.88, n); seen[it.source] = n + 1; }
    list.sort((a, b) => b._rank - a._rank);
  }
  currentList = list;
  $('#sectionTitle').textContent = title;
  $('#sectionHead').classList.remove('hidden');
  $$('.sort button').forEach(b => b.classList.toggle('active', b.dataset.sort === (route === 'latest' ? 'time' : opts.sort)));
  $('#foot').textContent = `${list.length} stories shown · ${blocked} removed by blocked words · ${hidden} hidden by your dislikes · ${bundle.items.length} in the week's archive · built ${new Date(bundle.generated).toLocaleString()}`;
  renderWeather();
  shown = 0;
  $('#cards').innerHTML = '';
  renderMore();
}
function renderMore() {
  const frag = document.createDocumentFragment();
  const slice = currentList.slice(shown, shown + PAGE);
  slice.forEach((it, i) => frag.appendChild(card(it, shown === 0 && i === 0 && !query && opts.sort !== 'time' && !opts.compact && it.image)));
  shown += slice.length;
  $('#cards').appendChild(frag);
  $('#moreBtn').classList.toggle('hidden', shown >= currentList.length);
  const lp = route.startsWith('place:') && (prefs.local_places || []).find(p => 'place:' + p.id === route);
  setStatus(currentList.length ? '' : lp ? `No story this week mentions ${lp.name.split(',')[0]}. The sources are the owner's list; ask them to add local ones for this place.` : 'Nothing here yet.');
}
function card(it, lead) {
  const n = $('#cardTpl').content.firstElementChild.cloneNode(true);
  n.dataset.id = it.id;
  if (lead) n.classList.add('lead');
  if (read[it.id]) n.classList.add('read');
  const img = $('img', n), th = $('.thumb', n);
  if (it.image && opts.images) { img.src = it.image; img.onerror = () => n.classList.add('noimg'); th.href = it.url; } else n.classList.add('noimg');
  const src = sourceById[it.source] || {};
  $('.source', n).textContent = it._src; $('.source', n).href = src.home || it.url;
  $('time', n).textContent = ago(it.published); $('time', n).dateTime = it.published; $('time', n).title = new Date(it.published).toLocaleString();
  if (it.also && it.also.length) $('.also', n).textContent = ` · also in ${it.also.map(s => (sourceById[s] || {}).name || s).slice(0, 2).join(', ')}`;
  $('.title', n).textContent = it.title; $('.title', n).href = it.url;
  $('.summary', n).textContent = it.summary || '';
  const v = votes[it.id];
  if (v) $(v.v > 0 ? '.up' : '.down', n).classList.add('on');
  $('.why', n).textContent = whyText(it._sc, it);
  $$('a', n).forEach(a => a.addEventListener('click', () => markRead(it, n)));
  if (it.reader) {
    $('.rd', n).textContent = '· in the paper';
    for (const a of [$('.title', n), $('.thumb', n)]) a.addEventListener('click', e => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); openReader(it, n); });
  }
  $('.up', n).onclick = () => vote(it, +1, n);
  $('.down', n).onclick = () => vote(it, -1, n);
  $('.mute', n).onclick = () => { if (confirm(`Mute ${it._src}? You can unmute it in Settings → Sources.`)) { savePrefsLocal({ muted_sources: Array.from(new Set([...(prefs.muted_sources || []), it.source])) }); fillSettings(); buildList(); } };
  $('.block', n).onclick = () => {
    const w = prompt('Block a word or phrase (whole word, any story):', it._tok[0] || '');
    if (w && w.trim()) { savePrefsLocal({ blocked_terms: Array.from(new Set([...(prefs.blocked_terms || []), w.trim()])) }); fillSettings(); fillTopics(); buildList(); }
  };
  return n;
}
function markRead(it, n) { read[it.id] = Date.now(); pruneRead(); LS.set('read', read); n.classList.add('read'); }
async function openReader(it, n) {
  readerItem = it;
  const r = $('#reader');
  $('#readerSrc').textContent = it._src;
  $('#readerOpen').href = it.url;
  $('#readerTitle').textContent = it.title;
  $('#readerMeta').textContent = `${new Date(it.published).toLocaleString()} · about ${Math.max(1, Math.round(it.reader / 230))} min read`;
  const img = $('#readerImg');
  if (it.image && opts.images) { img.src = it.image; img.classList.remove('hidden'); img.onerror = () => img.classList.add('hidden'); } else img.classList.add('hidden');
  $('#readerText').innerHTML = '<p class="muted">Loading…</p>';
  $('#readerFoot').textContent = '';
  $('#readerUp').classList.toggle('on', !!votes[it.id] && votes[it.id].v > 0);
  $('#readerDown').classList.toggle('on', !!votes[it.id] && votes[it.id].v < 0);
  $('#readerUp').onclick = () => { vote(it, +1, n || document.createElement('div')); $('#readerUp').classList.toggle('on', !!votes[it.id] && votes[it.id].v > 0); $('#readerDown').classList.toggle('on', !!votes[it.id] && votes[it.id].v < 0); };
  $('#readerDown').onclick = () => { vote(it, -1, n || document.createElement('div')); $('#readerUp').classList.toggle('on', !!votes[it.id] && votes[it.id].v > 0); $('#readerDown').classList.toggle('on', !!votes[it.id] && votes[it.id].v < 0); };
  r.classList.remove('hidden'); r.scrollTop = 0; document.body.style.overflow = 'hidden';
  if (!location.hash.endsWith('/read')) history.pushState({ reader: it.id }, '', location.hash + '/read');
  if (n) markRead(it, n);
  try {
    let text, art;
    if (manifest.encrypted) {
      const pass = LS.get('pass', null);
      if (!articleKey) articleKey = await deriveKey(pass, b64ToBytes(manifest.salt), 'decrypt');
      const fetchBin = () => fetch(`data/a/${it.id}.bin`, { cache: 'no-store' }).then(x => { if (!x.ok) throw new Error('missing'); return x.arrayBuffer(); });
      let buf = new Uint8Array(await fetchBin());
      let plain;
      try {
        plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.slice(0, 12) }, articleKey, buf.slice(12));
      } catch {
        // the site was rebuilt since this page loaded: take the current key and try once more
        const mf = await fetch('data/manifest.json', { cache: 'no-store' }).then(r => r.json());
        manifest = mf; articleKey = await deriveKey(pass, b64ToBytes(mf.salt), 'decrypt');
        buf = new Uint8Array(await fetchBin());
        plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.slice(0, 12) }, articleKey, buf.slice(12));
      }
      art = JSON.parse(new TextDecoder().decode(plain));
    } else {
      art = await fetch(`data/a/${it.id}.json`, { cache: 'force-cache' }).then(x => { if (!x.ok) throw new Error('missing'); return x.json(); });
    }
    text = art.text || '';
    if (readerItem !== it) return;
    const hero = it.image ? imgKey(it.image) : null;
    $('#readerText').innerHTML = art.html ? sanitizeArticle(art.html, hero) : text.split(/\n{1,}/).map(par => par.trim()).filter(Boolean).map(par => par.length < 80 && !/[.!?]$/.test(par) ? `<h3>${esc(par)}</h3>` : `<p>${esc(par)}</p>`).join('');
    const extra = (art.images || []).filter(im => opts.images && imgKey(im.src) !== hero);
    if (extra.length) {
      $('#readerText').insertAdjacentHTML('beforeend', `<div class="gallery"><h3>More pictures from the story</h3>${extra.map(im => `<figure><img src="${esc(im.src)}" alt="${esc(im.alt)}" loading="lazy" referrerpolicy="no-referrer"><figcaption>${esc(im.caption || im.alt)}</figcaption></figure>`).join('')}</div>`);
    }
    $$('#readerText img').forEach(im => { im.loading = 'lazy'; im.referrerPolicy = 'no-referrer'; im.onerror = () => { const f = im.closest('figure'); (f || im).remove(); }; });
    const first = $('#readerText').firstElementChild;
    if (first && (first.tagName === 'IMG' || first.tagName === 'FIGURE' || (first.firstElementChild && first.firstElementChild.tagName === 'IMG' && !first.textContent.trim()))) $('#readerImg').classList.add('hidden');
    $('#readerFoot').textContent = `Fetched from ${it._src} for your reading only. Charts, videos and anything shown as a graphic stay at the source.`;
  } catch (e) {
    $('#readerText').innerHTML = `<p class="muted">The text could not be loaded just now (${esc(e.message)}). Reloading the paper usually fixes it; otherwise <a href="${esc(it.url)}" target="_blank" rel="noopener noreferrer">read it at ${esc(it._src)} ↗</a>.</p>`;
  }
}
function imgKey(u) { try { const p = new URL(u); const path = p.pathname.replace(/(\.(jpe?g|png|webp|avif|gif))+$/i, ''); return (p.hostname.replace(/^www\./, '') + path.replace(/[-_/]\d{2,4}x\d{2,4}|[-_]\d{3,4}$/g, '')).toLowerCase(); } catch { return u; } }
const READER_TAGS = new Set(['P', 'H2', 'H3', 'H4', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'STRONG', 'EM', 'B', 'I', 'BR', 'IMG', 'FIGURE', 'FIGCAPTION']);
function sanitizeArticle(htmlText, hero) {
  // The build already cleaned this; a second pass costs nothing and keeps the page honest about what it renders.
  const doc = new DOMParser().parseFromString(htmlText, 'text/html');
  const walk = node => {
    for (const el of Array.from(node.children)) {
      if (!READER_TAGS.has(el.tagName)) { el.replaceWith(...Array.from(el.childNodes)); continue; }
      if (el.tagName === 'IMG') {
        const src = el.getAttribute('src') || '';
        if (!/^https?:/.test(src) || (hero && imgKey(src) === hero)) { (el.closest('figure') || el).remove(); continue; }
        const alt = el.getAttribute('alt') || '';
        for (const a of Array.from(el.attributes)) el.removeAttribute(a.name);
        el.setAttribute('src', src); el.setAttribute('alt', alt);
      } else {
        for (const a of Array.from(el.attributes)) el.removeAttribute(a.name);
      }
      walk(el);
    }
  };
  walk(doc.body);
  for (const el of Array.from(doc.body.querySelectorAll('p, li, h2, h3, h4'))) if (!el.textContent.trim() && !el.querySelector('img')) el.remove();
  return doc.body.innerHTML;
}
function closeReader(fromHistory) {
  $('#reader').classList.add('hidden'); document.body.style.overflow = ''; readerItem = null;
  if (!fromHistory && location.hash.endsWith('/read')) history.back();
}
function pruneRead() { const cut = Date.now() - 21 * 864e5; for (const k in read) if (read[k] < cut) delete read[k]; }
function vote(it, v, n) {
  if (votes[it.id] && votes[it.id].v === v) { delete votes[it.id]; const d = LS.get('deletedVotes', {}); d[it.id] = Date.now(); LS.set('deletedVotes', d); }
  else votes[it.id] = { v, t: Date.now(), s: it.source, tags: it.tags || [], tok: it._tok, title: it.title };
  LS.set('votes', votes);
  rebuildModel();
  $('.up', n).classList.toggle('on', !!votes[it.id] && votes[it.id].v > 0);
  $('.down', n).classList.toggle('on', !!votes[it.id] && votes[it.id].v < 0);
  it._sc = score(it); $('.why', n).textContent = whyText(it._sc, it);
  fillLearned();
  scheduleSync();
}
function setStatus(t) { const s = $('#status'); s.textContent = t; s.classList.toggle('hidden', !t); }

// ------------------------------------------------------------- weather
async function localWeather(p) {
  const cache = LS.get('wx:' + p.id, null);
  if (cache && Date.now() - cache.t < 30 * 60e3) return cache.w;
  try {
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}&timezone=auto&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&temperature_unit=fahrenheit&forecast_days=3`;
    const d = await fetch(u).then(r => r.json());
    const w = { temp: d.current.temperature_2m, code: d.current.weather_code, days: d.daily.time.map((t, i) => ({ date: t, hi: d.daily.temperature_2m_max[i], lo: d.daily.temperature_2m_min[i], pop: d.daily.precipitation_probability_max[i], code: d.daily.weather_code[i] })) };
    LS.set('wx:' + p.id, { t: Date.now(), w }); return w;
  } catch { return null; }
}
function renderWeather() {
  const w = $('#weather'); w.innerHTML = '';
  let places = [];
  const hidden = hiddenSet();
  if (route.startsWith('place:')) places = allPlaces().filter(p => 'place:' + p.id === route);
  else if (route === 'foryou' && !query) places = allPlaces().filter(p => !hidden.has('place:' + p.id)).slice(0, 1);
  const wxFor = p => (bundle.weather && bundle.weather[p.id]) || null;
  for (const p of places) if (!wxFor(p) && p.lat != null) localWeather(p).then(x => { if (x && !bundle.weather[p.id]) { bundle.weather[p.id] = x; if (places.includes(p)) renderWeather(); } });
  const cards = places.filter(p => wxFor(p)).map(p => {
    const x = wxFor(p);
    const days = (x.days || []).slice(0, 3).map((d, i) => `<span>${i === 0 ? 'Today' : new Date(d.date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short' })} <b>${Math.round(d.hi)}°</b>/${Math.round(d.lo)}°${d.pop != null ? ` · ${d.pop}%` : ''}</span>`).join('');
    return `<div class="wx"><div class="place">${esc(p.name)}</div><div class="now">${Math.round(x.temp)}°F <span class="muted small">${esc(WX[x.code] || '')}</span></div><div class="days">${days}</div></div>`;
  });
  w.innerHTML = cards.join('');
  w.classList.toggle('hidden', !cards.length);
}

// ------------------------------------------------------------- tabs
function renderTabs() {
  const t = $('#tabs');
  const link = (id, name) => `<a href="#/${id}" data-r="${id}" class="${route === id ? 'active' : ''}">${esc(name)}</a>`;
  const placeSecs = new Set((prefs.places || []).map(p => p.sections[0]));
  const hidden = hiddenSet();
  let h = link('foryou', 'For you') + link('latest', 'Latest') + '<span class="sep"></span>';
  h += allPlaces().filter(p => !hidden.has('place:' + p.id)).map(p => link('place:' + p.id, p.name.split(',')[0].replace(' & New England', ''))).join('');
  h += '<span class="sep"></span>';
  h += (prefs.sections || []).filter(s => !placeSecs.has(s.id) && !hidden.has(s.id)).map(s => link(s.id, s.name)).join('');
  t.innerHTML = h;
  const a = $('#tabs a.active'); if (a) a.scrollIntoView({ inline: 'center', block: 'nearest' });
}
function go() {
  if (location.hash.endsWith('/read')) { if (!readerItem) history.replaceState(null, '', location.hash.replace(/\/read$/, '')); else return; }
  route = location.hash.replace(/^#\/?/, '').replace(/\/read$/, '') || 'foryou';
  query = ''; $('#q').value = '';
  renderTabs(); buildList(); window.scrollTo(0, 0);
}

// ------------------------------------------------------------- settings drawer
// ------------------------------------------------------------- welcome (first visit on a device)
let wDraft = null;
function describeDefaults() {
  const places = (prefs.places || []).map(p => p.name).join(', ');
  const secs = (prefs.sections || []).map(x => x.name).join(', ');
  const ex = prefs.blocked_terms || [], fav = prefs.boosted_terms || [];
  const few = a => a.slice(0, 6).join(', ') + (a.length > 6 ? ` … (${a.length} in all)` : '');
  return `<p><b>Places:</b> ${esc(places) || '—'}</p><p><b>Sections:</b> ${esc(secs)}</p><p><b>Favoured words:</b> ${esc(few(fav)) || '—'}</p><p><b>Left out:</b> ${esc(few(ex)) || '—'}</p><p class="muted small">Sources are the owner's list; anything behind a paywall or login was never included.</p>`;
}
function openWelcome() {
  wDraft = {
    local_places: JSON.parse(JSON.stringify(prefs.local_places || [])),
    hidden_sections: [...(prefs.hidden_sections || [])],
    boosted_terms: [...(prefs.boosted_terms || [])],
    blocked_terms: [...(prefs.blocked_terms || [])],
  };
  $('#welcomeDefaults').innerHTML = describeDefaults();
  fillWelcome();
  $('#welcome').classList.remove('hidden'); document.body.style.overflow = 'hidden';
}
function fillWelcome() {
  const chipList = (el, list, onRemove, cls = '') => {
    el.innerHTML = list.map((t, i) => `<span class="chip ${cls}" data-i="${i}">${esc(t)}</span>`).join('') || '<span class="muted small">nothing yet</span>';
    $$('.chip', el).forEach(c => c.onclick = () => onRemove(+c.dataset.i));
  };
  chipList($('#wPlaceChips'), wDraft.local_places.map(p => p.name), i => { wDraft.local_places.splice(i, 1); fillWelcome(); }, 'place');
  chipList($('#wBoostChips'), wDraft.boosted_terms, i => { wDraft.boosted_terms.splice(i, 1); fillWelcome(); });
  chipList($('#wBlockChips'), wDraft.blocked_terms, i => { wDraft.blocked_terms.splice(i, 1); fillWelcome(); });
  const hidden = new Set(wDraft.hidden_sections);
  const placeSecs = new Set((prefs.places || []).map(p => p.sections[0]));
  const rows = [...(prefs.places || []).map(p => ({ id: 'place:' + p.id, name: p.name })), ...(prefs.sections || []).filter(x => !placeSecs.has(x.id))];
  $('#wSections').innerHTML = rows.map(r => `<label><input type="checkbox" data-id="${esc(r.id)}" ${hidden.has(r.id) ? '' : 'checked'}> ${esc(r.name)}</label>`).join('');
  $$('#wSections input').forEach(cb => cb.onchange = () => { const h = new Set(wDraft.hidden_sections); cb.checked ? h.delete(cb.dataset.id) : h.add(cb.dataset.id); wDraft.hidden_sections = [...h]; });
}
async function findPlace(q) {
  const el = $('#wPlaceResults'); el.innerHTML = '<span class="muted small">Looking…</span>';
  try {
    const d = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en&format=json`).then(r => r.json());
    const hits = d.results || [];
    el.innerHTML = hits.map((h, i) => `<span class="chip pick" data-i="${i}">${esc(h.name)}${h.admin1 ? ', ' + esc(h.admin1) : ''}, ${esc(h.country_code || h.country || '')}</span>`).join('') || '<span class="muted small">No match. Try another spelling.</span>';
    $$('.chip', el).forEach(c => c.onclick = () => {
      const h = hits[+c.dataset.i];
      const id = 'l' + Math.abs([...(h.name + h.latitude)].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) | 0, 7)).toString(36);
      if (!wDraft.local_places.some(p => p.id === id)) wDraft.local_places.push({ id, name: h.admin1 ? `${h.name}, ${h.admin1}` : h.name, lat: h.latitude, lon: h.longitude, match: [h.name] });
      el.innerHTML = ''; $('#wPlace').value = ''; fillWelcome();
    });
  } catch { el.innerHTML = '<span class="muted small">The place lookup did not answer; try again in a moment.</span>'; }
}
function closeWelcome(save) {
  if (save) savePrefsLocal(wDraft);
  LS.set('welcomed', true);
  $('#welcome').classList.add('hidden'); document.body.style.overflow = '';
  renderTabs(); buildList();
}
function wireWelcome() {
  $('#wPlaceForm').onsubmit = e => { e.preventDefault(); const q = $('#wPlace').value.trim(); if (q) findPlace(q); };
  const addTo = (key, inputId) => e => { e.preventDefault(); const v = $(inputId).value.trim(); if (!v) return; if (!wDraft[key].some(x => x.toLowerCase() === v.toLowerCase())) wDraft[key].push(v); $(inputId).value = ''; fillWelcome(); };
  $('#wBoostForm').onsubmit = addTo('boosted_terms', '#wBoost');
  $('#wBlockForm').onsubmit = addTo('blocked_terms', '#wBlock');
  $('#wDone').onclick = () => closeWelcome(true);
  $('#wKeep').onclick = () => closeWelcome(false);
  $('#rerunWelcome').onclick = () => { openSettings(false); openWelcome(); };
}
function openSettings(open) { if (open) openTopics(false); $('#settings').classList.toggle('open', open); $('#scrim').classList.toggle('show', open); $('#settings').setAttribute('aria-hidden', String(!open)); if (open) fillSettings(); }
function openTopics(open) { if (open) openSettings(false); $('#topics').classList.toggle('open', open); $('#scrim').classList.toggle('show', open); $('#topics').setAttribute('aria-hidden', String(!open)); if (open) { fillTopics(); setTimeout(() => $('#addBoost input').focus(), 250); } }
function countHits(term) {
  const re = termRegex([term]); if (!re) return 0;
  let n = 0; for (const it of bundle.items) if (re.test(it._text)) n++; return n;
}
function fillTopics() {
  const chips = (key, el) => {
    const list = prefs[key] || [];
    el.innerHTML = list.map(t => `<span class="chip" data-t="${esc(t)}" title="Take off the list">${esc(t)}<span class="n">${countHits(t)}</span></span>`).join('') || '<span class="muted small">nothing yet</span>';
    $$('.chip', el).forEach(c => c.onclick = () => { savePrefsLocal({ [key]: list.filter(x => x !== c.dataset.t) }); fillTopics(); buildList(); });
  };
  chips('boosted_terms', $('#boostChips')); chips('blocked_terms', $('#blockChips'));
  $('#topicsNote').textContent = LS.get('token', '') ? 'Changes save to the paper and reach your other devices at the next sync.' : 'Saved on this device. To carry these to your other devices, add a token in Settings → Sync.';
}
function addTerm(key, inputEl) {
  const t = inputEl.value.trim().replace(/\s+/g, ' ');
  if (!t) return;
  const other = key === 'boosted_terms' ? 'blocked_terms' : 'boosted_terms';
  const list = (prefs[key] || []).filter(x => x.toLowerCase() !== t.toLowerCase());
  const patch = { [key]: [...list, t] };
  if ((prefs[other] || []).some(x => x.toLowerCase() === t.toLowerCase())) patch[other] = (prefs[other] || []).filter(x => x.toLowerCase() !== t.toLowerCase());
  savePrefsLocal(patch); inputEl.value = ''; fillTopics(); buildList();
}
function fillSettings() {
  $('#optImages').checked = opts.images; $('#optHideRead').checked = opts.hideRead; $('#optShowHidden').checked = opts.showHidden; $('#optCompact').checked = opts.compact;
  $('#blockedTerms').value = (prefs.blocked_terms || []).join('\n'); $('#blockedCount').textContent = `(${(prefs.blocked_terms || []).length})`;
  $('#boostTerms').value = (prefs.boosted_terms || []).join('\n'); $('#boostCount').textContent = `(${(prefs.boosted_terms || []).length})`;
  $('#hideThreshold').value = prefs.hide_threshold ?? -2;
  const muted = new Set(prefs.muted_sources || []);
  const bySec = {};
  for (const s of bundle.sources || []) (bySec[s.section] = bySec[s.section] || []).push(s);
  const secName = id => ((prefs.sections || []).find(x => x.id === id) || { name: id }).name;
  $('#sourceList').innerHTML = Object.keys(bySec).sort((a, b) => secName(a).localeCompare(secName(b))).map(sec => `<div class="muted small" style="margin-top:8px"><b>${esc(secName(sec))}</b></div>` + bySec[sec].map(s => {
    const bad = s.health && !/^ok|^unchanged/.test(s.health);
    return `<label><input type="checkbox" data-src="${esc(s.id)}" ${muted.has(s.id) ? '' : 'checked'}> ${esc(s.name)}<span class="st ${bad ? 'bad' : ''}">${esc(s.health || '')}</span></label>`;
  }).join('')).join('');
  $('#sourceCount').textContent = `(${(bundle.sources || []).length}, ${muted.size} muted)`;
  $$('#sourceList input').forEach(cb => cb.onchange = () => {
    const m = new Set(prefs.muted_sources || []); cb.checked ? m.delete(cb.dataset.src) : m.add(cb.dataset.src);
    savePrefsLocal({ muted_sources: Array.from(m) }); fillSettings(); buildList();
  });
  $('#repo').value = LS.get('repo', guessRepo()); $('#token').value = LS.get('token', '');
  $('#buildInfo').textContent = `Built ${new Date(bundle.generated).toLocaleString()} · ${bundle.items.length} stories · ${(bundle.sources || []).length} sources`;
  fillLearned();
}
function fillLearned() {
  const top = (o, n) => Object.entries(o).filter(([, w]) => w).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, n);
  const fmt = named => ([k, w]) => `<span class="${w > 0 ? 'pos' : 'neg'}">${w > 0 ? '+' : ''}${w.toFixed(1)} ${esc(named ? (((sourceById[k] || {}).name) || k) : k)}</span>`;
  const nv = Object.keys(votes).length;
  $('#learned').innerHTML = `<div><b>Sources</b><br>${top(model.src, 8).map(fmt(true)).join('<br>') || '<span class="muted">—</span>'}</div><div><b>Words &amp; topics</b><br>${top(Object.assign({}, model.tag, model.tok), 10).map(fmt(false)).join('<br>') || '<span class="muted">—</span>'}</div><div class="muted" style="grid-column:1/-1">${nv} vote${nv === 1 ? '' : 's'} so far</div>`;
}
function guessRepo() {
  const m = location.hostname.match(/^([^.]+)\.github\.io$/);
  const seg = location.pathname.split('/').filter(Boolean)[0];
  return m && seg ? `${m[1]}/${seg}` : '';
}
function wireSettings() {
  $('#settingsBtn').onclick = () => openSettings(true);
  $('#closeSettings').onclick = () => openSettings(false);
  $('#topicsBtn').onclick = () => openTopics(true);
  $('#closeTopics').onclick = () => openTopics(false);
  $('#scrim').onclick = () => { openSettings(false); openTopics(false); };
  $('#addBoost').onsubmit = e => { e.preventDefault(); addTerm('boosted_terms', $('#addBoost input')); };
  $('#addBlock').onsubmit = e => { e.preventDefault(); addTerm('blocked_terms', $('#addBlock input')); };
  const opt = (id, key, after) => $(id).onchange = e => { opts[key] = e.target.checked; LS.set('opts', opts); document.body.classList.toggle('compact', opts.compact); buildList(); };
  opt('#optImages', 'images'); opt('#optHideRead', 'hideRead'); opt('#optShowHidden', 'showHidden'); opt('#optCompact', 'compact');
  const lines = v => v.split('\n').map(x => x.trim()).filter(Boolean);
  $('#blockedTerms').onchange = e => { savePrefsLocal({ blocked_terms: lines(e.target.value) }); fillSettings(); buildList(); };
  $('#boostTerms').onchange = e => { savePrefsLocal({ boosted_terms: lines(e.target.value) }); fillSettings(); buildList(); };
  $('#hideThreshold').onchange = e => { savePrefsLocal({ hide_threshold: parseFloat(e.target.value) }); buildList(); };
  $('#resetVotes').onclick = () => { if (confirm('Forget every like and dislike?')) { votes = {}; LS.set('votes', votes); rebuildModel(); fillLearned(); buildList(); scheduleSync(); } };
  $('#repo').onchange = e => LS.set('repo', e.target.value.trim());
  $('#token').onchange = e => LS.set('token', e.target.value.trim());
  $('#syncBtn').onclick = () => sync(true);
  $('#rebuildBtn').onclick = rebuild;
  $('#exportBtn').onclick = () => {
    const blob = new Blob([JSON.stringify({ votes, prefsLocal: LS.get('prefsLocal', {}), read, opts }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `picayune-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  };
  $('#importFile').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { const d = JSON.parse(await f.text()); if (d.votes) { votes = Object.assign(votes, d.votes); LS.set('votes', votes); } if (d.prefsLocal) LS.set('prefsLocal', Object.assign(LS.get('prefsLocal', {}), d.prefsLocal)); prefs = effectivePrefs(); compilePrefs(); rebuildModel(); fillSettings(); buildList(); alert('Imported.'); } catch { alert('That file could not be read.'); }
  };
  $('#forgetPass').onclick = () => { LS.del('pass'); location.reload(); };
  $('#themeBtn').onclick = () => {
    const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next; LS.set('theme', next);
  };
  $$('.sort button').forEach(b => b.onclick = () => { opts.sort = b.dataset.sort; LS.set('opts', opts); buildList(); });
  $('#moreBtn').onclick = renderMore;
  $('#readerBack').onclick = () => closeReader(false);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && readerItem) closeReader(false); });
  window.addEventListener('popstate', () => { if (readerItem && !location.hash.endsWith('/read')) closeReader(true); });
  let qt; $('#q').addEventListener('input', e => { clearTimeout(qt); qt = setTimeout(() => { query = e.target.value.trim(); if (query) $$('#tabs a').forEach(a => a.classList.remove('active')); else renderTabs(); buildList(); }, 180); });
  $('#searchForm').addEventListener('submit', e => e.preventDefault());
}

// ------------------------------------------------------------- GitHub sync (optional)
let syncTimer = null;
function scheduleSync() { if (!LS.get('token', '')) return; clearTimeout(syncTimer); syncTimer = setTimeout(() => sync(false), 2500); }
async function gh(path, opts = {}) {
  const token = LS.get('token', ''), repo = LS.get('repo', guessRepo());
  if (!token || !repo) throw new Error('Set the repository and token first.');
  const r = await fetch(`https://api.github.com/repos/${repo}/${path}`, Object.assign({ headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } }, opts));
  if (r.status === 404 && opts.method !== 'PUT') return null;
  if (!r.ok) throw new Error(`GitHub said ${r.status}: ${(await r.text()).slice(0, 140)}`);
  return r.status === 204 ? {} : r.json();
}
async function sync(manual) {
  const msg = t => { $('#syncMsg').textContent = t; };
  try {
    const pass = LS.get('pass', null);
    if (!pass) throw new Error('Sync needs the passphrase (the page is not set up as encrypted, or you have not unlocked it).');
    msg('Syncing…');
    const pf = await gh('contents/private.enc');
    if (!pf) throw new Error('private.enc is not in the repository yet.');
    const priv = JSON.parse(new TextDecoder().decode(await decrypt(b64ToBytes(pf.content).buffer, pass)));
    const fb = priv.feedback || {};
    // votes: merge by newest timestamp per story; deletions carry a timestamp too
    const merged = Object.assign({}, fb.votes || {});
    const deleted = new Set(fb.deleted || []);
    const localDel = LS.get('deletedVotes', {});
    for (const [id, v] of Object.entries(votes)) if (!merged[id] || (merged[id].t || 0) < (v.t || 0)) merged[id] = v;
    for (const [id, t] of Object.entries(localDel)) if (merged[id] && (merged[id].t || 0) <= t) { delete merged[id]; deleted.add(id); }
    const votesChanged = JSON.stringify(merged) !== JSON.stringify(fb.votes || {});
    votes = merged; LS.set('votes', votes); LS.del('deletedVotes'); rebuildModel();
    // preferences: local edits win if newer than the file; otherwise take the file
    const local = LS.get('prefsLocal', null);
    const remotePrefs = priv.preferences || {};
    let prefsChanged = false;
    if (local && (local._edited || 0) > (remotePrefs._edited || 0)) { priv.preferences = Object.assign({}, remotePrefs, local); prefsChanged = true; }
    bundle.prefs = priv.preferences; if (!prefsChanged) LS.del('prefsLocal');
    prefs = effectivePrefs(); compilePrefs();
    if (votesChanged || prefsChanged) {
      priv.feedback = { votes: merged, deleted: Array.from(deleted).slice(-500), updated: new Date().toISOString(), updatedMs: Date.now() };
      const blob = await encrypt(new TextEncoder().encode(JSON.stringify(priv, null, 1)), pass);
      await gh('contents/private.enc', { method: 'PUT', body: JSON.stringify({ message: 'private: sync from the site', content: bytesToB64(blob), sha: pf.sha }) });
    }
    if (prefsChanged) LS.del('prefsLocal');
    LS.set('lastSync', Date.now());
    msg(`Synced ${new Date().toLocaleTimeString()}${votesChanged || prefsChanged ? ' (saved to the repository; the next build uses it)' : ''}.`);
    fillSettings(); buildList();
  } catch (e) { msg(e.message); if (manual) console.error(e); }
}
async function rebuild() {
  const msg = t => { $('#syncMsg').textContent = t; };
  try { msg('Asking GitHub to rebuild…'); await gh('actions/workflows/build.yml/dispatches', { method: 'POST', body: JSON.stringify({ ref: 'main' }) }); msg('Rebuild started. New stories arrive in a few minutes; reload then.'); }
  catch (e) { msg(e.message); }
}

// ------------------------------------------------------------- boot
(async function boot() {
  const theme = LS.get('theme', null); if (theme) document.documentElement.dataset.theme = theme;
  document.body.classList.toggle('compact', opts.compact);
  wireSettings(); wireWelcome();
  window.addEventListener('hashchange', go);
  try { await loadBundle(); } catch (e) { setStatus('The news bundle is not here yet. The first build publishes it within a few minutes.'); console.error(e); return; }
  renderTabs(); buildList();
  if (!LS.get('welcomed', false) && !LS.get('prefsLocal', null) && !Object.keys(votes).length) openWelcome();
  if (LS.get('token', '') && Date.now() - LS.get('lastSync', 0) > 10 * 60e3) sync(false);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
})();
