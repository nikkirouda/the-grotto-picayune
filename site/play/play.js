/* The Grotto Picayune — Puzzles. Two games of the paper's own (Type Case, Four Columns) and a shelf of other
   people's free daily games: embedded where their site allows it, linked where it does not.
   Nothing here leaves the device; progress is kept in this browser under "picayune:play:". */
(() => {
'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LS = {
  get(k, d) { try { const v = localStorage.getItem('picayune:play:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('picayune:play:' + k, JSON.stringify(v)); } catch {} },
};
try { const t = JSON.parse(localStorage.getItem('picayune:theme')); if (t) document.documentElement.dataset.theme = t; } catch {}

// Other people's games. embed: true only where the site sends no frame-blocking header (checked 2026-11-28).
const SHELF = [
  { id: 'smush', name: 'Smush', by: 'Hank Green', icon: 'S', url: 'https://hankgreen.com/smush/', embed: true, d: 'Make words from nine letters; each letter only goes so far.' },
  { id: 'clues', name: 'Clues by Sam', by: 'Sam', icon: '🔎', url: 'https://cluesbysam.com/', embed: false, d: 'A daily logic mystery: who is innocent, who is not. Opens in its own tab (the site does not allow embedding).' },
  { id: 'puzzgrid', name: 'PuzzGrid', by: 'puzzgrid.com', icon: '▦', url: 'https://puzzgrid.com/', embed: true, d: 'Thousands of reader-made grouping walls.' },
  { id: 'semantle', name: 'Semantle', by: 'semantle.com', icon: '≈', url: 'https://semantle.com/', embed: true, d: 'Find the secret word by meaning, not spelling.' },
  { id: 'framed', name: 'Framed', by: 'framed.wtf', icon: '🎞', url: 'https://framed.wtf/', embed: true, d: 'Name the film from six stills.' },
];

const dayNo = start => { const [y, m, d] = start.split('-').map(Number); const now = new Date(); return Math.max(0, Math.round((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(y, m - 1, d)) / 864e5)); };
const todayKey = () => { const n = new Date(); return `${n.getFullYear()}-${n.getMonth() + 1}-${n.getDate()}`; };
const cache = {};
const load = async name => cache[name] || (cache[name] = await fetch(name + '.json').then(r => r.json()));
const shuffle = (a, seed) => { a = a.slice(); let s = seed || Math.floor(Math.random() * 1e9); for (let i = a.length - 1; i > 0; i--) { s = (s * 1103515245 + 12345) & 0x7fffffff; const j = s % (i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };

function frame(title, own) {
  $('#title').textContent = title;
  $('#back').href = location.hash ? '#' : '../';
  const o = $('#ownTab'); if (own) { o.href = own; o.classList.remove('hidden'); } else o.classList.add('hidden');
  window.scrollTo(0, 0);
}

// ------------------------------------------------------------------ hub
function hub() {
  frame('Puzzles');
  const tc = LS.get('tc:' + todayKey(), null), fc = LS.get('fc:' + todayKey(), null);
  const card = (href, icon, name, d, done, ext) => `<a class="game-card" href="${esc(href)}"${ext ? ' target="_blank" rel="noopener noreferrer"' : ''}><span class="gi">${icon}</span><span><b>${esc(name)}</b><span class="d">${esc(d)}</span></span>${done ? `<span class="done">${esc(done)}</span>` : ''}</a>`;
  $('#main').innerHTML = `<div class="hub">
    <h2>The paper's own, new every day</h2>
    ${card('#typecase', 'T', 'Type Case', 'Seven letters in the tray. How many words can you set?', tc && tc.found.length ? `${tc.found.length} word${tc.found.length === 1 ? '' : 's'}` : '')}
    ${card('#columns', '▥', 'Four Columns', 'Sixteen words, four hidden groups of four.', fc && fc.over ? (fc.solved.length === 4 && fc.slips < 4 ? 'solved' : 'played') : '')}
    <h2>From elsewhere, free</h2>
    ${SHELF.map(g => card(g.embed ? '#g:' + g.id : g.url, g.icon, g.name, g.d, '', !g.embed)).join('')}
    <p class="howto">Games from elsewhere belong to their makers and run from their own sites; the paper only gives them a frame. If one misbehaves in the frame, use “open in its own tab”.</p>
  </div>`;
}

// ------------------------------------------------------------------ other people's games
function embed(id) {
  const g = SHELF.find(x => x.id === id && x.embed); if (!g) return hub();
  frame(g.name, g.url);
  $('#main').innerHTML = `<div class="embed"><div class="play-top"><a class="back" href="#" aria-label="Back">←</a><h1>${esc(g.name)} <span class="muted small">· ${esc(g.by)}</span></h1><a class="small-btn" href="${esc(g.url)}" target="_blank" rel="noopener noreferrer">own tab ↗</a></div>
    <iframe src="${esc(g.url)}" title="${esc(g.name)}" referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" allow="clipboard-write"></iframe></div>`;
}

// ------------------------------------------------------------------ Type Case
const RANKS = [[0, 'Cub'], [0.06, 'Stringer'], [0.15, 'Reporter'], [0.28, 'Correspondent'], [0.42, 'Columnist'], [0.58, 'Editor'], [0.75, 'Publisher'], [1, 'Press Baron']];
const tcScore = (w, full) => (w.length - 3) + (full ? 7 : 0);
async function typecase() {
  frame('Type Case');
  const data = await load('typecase'); const n = dayNo(data.start);
  const p = data.puzzles[n % data.puzzles.length], yest = n > 0 ? data.puzzles[(n - 1) % data.puzzles.length] : null;
  const all = new Set([p.key, ...p.letters]), isFull = w => new Set(w).size === 7;
  const total = p.words.reduce((t, w) => t + tcScore(w, isFull(w)), 0);
  const st = LS.get('tc:' + todayKey(), { found: [], bonus: [] });
  let cur = '', order = p.letters.split('');
  $('#main').innerHTML = `<p class="howto">Set words of four letters or more. Every word needs the gold letter; letters can be reused. A word using all seven is a <b>full tray</b>.</p>
    <div class="rank"><span><b id="tcRank"></b></span><span id="tcPts"></span></div><div class="meter"><i id="tcBar"></i></div>
    <div class="tc-word" id="tcWord" aria-live="polite"></div><div class="msg" id="tcMsg"></div>
    <div class="tc-tray" id="tcTray"></div>
    <div class="row"><button class="btn quiet" id="tcDel">Delete</button><button class="btn quiet" id="tcMix">Shuffle</button><button class="btn" id="tcGo">Enter</button></div>
    <div class="found" id="tcFound"></div>
    ${yest ? `<details class="y"><summary>Yesterday's words (${yest.words.length})</summary><p>${yest.words.map(esc).join(', ')}</p></details>` : ''}`;
  const say = t => { $('#tcMsg').textContent = t; };
  const draw = () => {
    $('#tcWord').innerHTML = cur.split('').map(c => c === p.key ? `<span class="k">${c}</span>` : c).join('');
    const o = order; const tiles = [o[0], o[1], o[2], p.key, o[3], o[4], o[5]];   // the gold letter is the bar across the middle
    $('#tcTray').innerHTML = tiles.map((c, i) => `<button data-c="${c}" class="${i === 3 ? 'key' : ''}">${c}</button>`).join('');
    const pts = st.found.reduce((t, w) => t + tcScore(w, isFull(w)), 0), frac = pts / total;
    const r = RANKS.filter(x => frac >= x[0]).pop(), next = RANKS.find(x => x[0] > frac);
    $('#tcRank').textContent = r[1];
    $('#tcPts').textContent = `${pts} of ${total} points · ${st.found.length} of ${p.words.length} words` + (next ? ` · ${Math.ceil(next[0] * total) - pts} to ${next[1]}` : '');
    $('#tcBar').style.width = Math.round(frac * 100) + '%';
    $('#tcFound').innerHTML = st.found.slice().sort().map(w => `<span class="${isFull(w) ? 'full' : ''}">${w}</span>`).join('') + st.bonus.slice().sort().map(w => `<span class="bonus" title="a real word, but not on today's list">${w}</span>`).join('');
  };
  const enter = () => {
    const w = cur; cur = '';
    if (w.length < 4) say('Four letters or more.');
    else if (!w.includes(p.key)) say(`It needs the gold letter, ${p.key.toUpperCase()}.`);
    else if (st.found.includes(w) || st.bonus.includes(w)) say('Already set.');
    else if (p.words.includes(w)) { st.found.push(w); LS.set('tc:' + todayKey(), st); say(isFull(w) ? `Full tray! +${tcScore(w, true)}` : `+${tcScore(w, false)}`); if (st.found.length === p.words.length) say('Every word found. Put the paper to bed.'); }
    else if ((p.more || []).includes(w)) { st.bonus.push(w); LS.set('tc:' + todayKey(), st); say('A real word, but an uncommon one: noted as a bonus.'); }
    else say('Not in the paper\'s word list.');
    draw();
  };
  const add = c => { if (all.has(c) && cur.length < 20) { cur += c; say(''); draw(); } };
  $('#tcTray').onclick = e => { const b = e.target.closest('button'); if (b) add(b.dataset.c); };
  $('#tcDel').onclick = () => { cur = cur.slice(0, -1); draw(); };
  $('#tcMix').onclick = () => { order = shuffle(order); draw(); };
  $('#tcGo').onclick = enter;
  keyHandler = e => { if (e.metaKey || e.ctrlKey || e.altKey) return; if (e.key === 'Enter') { e.preventDefault(); enter(); } else if (e.key === 'Backspace') { cur = cur.slice(0, -1); draw(); } else if (/^[a-z]$/i.test(e.key)) add(e.key.toLowerCase()); };
  draw();
}

// ------------------------------------------------------------------ Four Columns
async function columns() {
  frame('Four Columns');
  const data = await load('columns'); const n = dayNo(data.start);
  const p = data.puzzles[n % data.puzzles.length];
  const groupOf = {}; p.g.forEach((g, i) => g[1].forEach(w => groupOf[w] = i));
  const st = LS.get('fc:' + todayKey(), { solved: [], slips: 0, over: false, tried: [] });
  let order = shuffle(Object.keys(groupOf), n + 7), sel = [];
  $('#main').innerHTML = `<p class="howto">Sort the sixteen words into four groups of four that belong together. Pick four and file them. Four slips and the edition goes to press without you.</p>
    <div id="fcSolved"></div><div class="fc-grid" id="fcGrid"></div><div class="msg" id="fcMsg"></div>
    <div class="row"><button class="btn quiet" id="fcMix">Shuffle</button><button class="btn quiet" id="fcClear">Clear</button><button class="btn" id="fcGo">File these four</button></div>
    <div class="slips" id="fcSlips"></div>`;
  const say = t => { $('#fcMsg').textContent = t; };
  const save = () => LS.set('fc:' + todayKey(), st);
  const draw = () => {
    const shown = st.over ? p.g.map((_, i) => i).sort((a, b) => (st.solved.indexOf(a) < 0 ? 9 : st.solved.indexOf(a)) - (st.solved.indexOf(b) < 0 ? 9 : st.solved.indexOf(b))) : st.solved;
    $('#fcSolved').innerHTML = shown.map(i => `<div class="fc-solved ${st.solved.includes(i) ? '' : 'missed'}"><b>${esc(p.g[i][0])}</b><span>${p.g[i][1].map(esc).join(', ')}</span></div>`).join('');
    const left = st.over ? [] : order.filter(w => !st.solved.includes(groupOf[w]));
    $('#fcGrid').innerHTML = left.map(w => `<button class="${sel.includes(w) ? 'sel' : ''}" data-w="${esc(w)}">${esc(w)}</button>`).join('');
    $('#fcGo').disabled = sel.length !== 4 || st.over; $('#fcMix').disabled = $('#fcClear').disabled = st.over;
    $('#fcSlips').textContent = st.over ? '' : 'Slips left: ' + '●'.repeat(4 - st.slips) + '○'.repeat(st.slips);
    if (st.over) say(st.solved.length === 4 ? (st.slips === 0 ? 'A clean sheet. Come back tomorrow.' : `Filed with ${st.slips} slip${st.slips === 1 ? '' : 's'}. Come back tomorrow.`) : 'The edition went to press. The groups are above; a new sheet tomorrow.');
  };
  $('#fcGrid').onclick = e => { const b = e.target.closest('button'); if (!b || st.over) return; const w = b.dataset.w; if (sel.includes(w)) sel = sel.filter(x => x !== w); else if (sel.length < 4) sel.push(w); say(''); draw(); };
  $('#fcMix').onclick = () => { order = shuffle(order); draw(); };
  $('#fcClear').onclick = () => { sel = []; draw(); };
  $('#fcGo').onclick = () => {
    if (sel.length !== 4) return;
    const key = sel.slice().sort().join('|');
    if (st.tried.includes(key)) { say('You have tried those four already.'); return; }
    st.tried.push(key);
    const counts = {}; sel.forEach(w => counts[groupOf[w]] = (counts[groupOf[w]] || 0) + 1);
    const best = Math.max(...Object.values(counts));
    if (best === 4) { st.solved.push(groupOf[sel[0]]); sel = []; say('Filed.'); if (st.solved.length === 4) st.over = true; }
    else { st.slips++; say(best === 3 ? 'One away.' : 'Not a group.'); if (st.slips >= 4) { st.over = true; sel = []; } }
    save(); draw();
  };
  keyHandler = null;
  draw();
}

// ------------------------------------------------------------------ routing
let keyHandler = null;
document.addEventListener('keydown', e => { if (keyHandler) keyHandler(e); });
function route() {
  keyHandler = null;
  const h = location.hash.replace(/^#/, '');
  if (h === 'typecase') typecase(); else if (h === 'columns') columns(); else if (h.startsWith('g:')) embed(h.slice(2)); else hub();
}
window.addEventListener('hashchange', route);
route();
})();
