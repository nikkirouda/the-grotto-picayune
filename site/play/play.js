/* The Grotto Picayune — Puzzles. Seven games of the paper's own (Type Case, Four Columns, Stop Press, The Crossword, The Mini, Dateline, The Quiz) and a shelf of other
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
// The styles travel with this file: whatever copy of the page the browser kept, the right stylesheet is loaded.
const PLAY_V = 26;
if (!document.querySelector(`link[href="play.css?v=${PLAY_V}"]`)) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = `play.css?v=${PLAY_V}`; document.head.appendChild(l); document.querySelectorAll('style').forEach(x => x.remove()); }
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
  const card = (href, icon, name, d, done, ext, shelf) => `<a class="game-card" href="${esc(href)}"${ext ? ' target="_blank" rel="noopener noreferrer"' : ''}><span class="gi">${icon}</span><span><b>${esc(name)}</b><span class="d">${esc(d)}</span></span>${done ? `<span class="done">${esc(done)}</span>` : ''}${shelf ? `<span class="go">${ext ? '↗' : '›'}</span>` : ''}</a>`;
  const st = (k, f) => { const x = LS.get(k + ':' + todayKey(), null); return x ? f(x) : ''; };
  $('#main').innerHTML = `<div class="hub">
    <div class="hub-head"><div class="kicker">${new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</div><h2>The Puzzle Page</h2></div>
    <h3>The paper's own · new every day</h3>
    <div class="game-grid">
    ${card('#stoppress', '¶', 'Stop Press', 'One five-letter word, six proofs to find it.', st('sp', x => x.over ? 'played' : x.rows.length ? `${x.rows.length} of 6` : ''))}
    ${card('#typecase', 'T', 'Type Case', 'Seven letters in the tray. How many words can you set?', st('tc', x => x.found.length ? `${x.found.length} word${x.found.length === 1 ? '' : 's'}` : ''))}
    ${card('#columns', '▥', 'Four Columns', 'Sixteen words, four hidden groups.', st('fc', x => x.over ? (x.solved.length === 4 ? 'solved' : 'played') : ''))}
    ${card('#crossword', '▦', 'The Crossword', 'A traditional grid, nine squares by nine.', st('cw', x => x.over ? (x.revealed ? 'shown' : 'solved') : ''))}
    ${card('#mini', '▫', 'The Mini', 'A small grid: three across, three down.', st('xw', x => x.over ? (x.revealed ? 'shown' : 'solved') : ''))}
    ${card('#dateline', '⏳', 'Dateline', 'Ten events from history, to put in order.', st('dl', x => x.over ? 'played' : ''))}
    ${card('#quiz', '?', 'The Quiz', 'Six questions, one from each category.', st('qz', x => x.picks.length >= 6 ? 'played' : ''))}
    </div>
    <h3>From elsewhere · free</h3>
    <div class="shelf">${SHELF.map(g => card(g.embed ? '#g:' + g.id : g.url, g.icon, g.name, g.d, '', !g.embed, true)).join('')}</div>
    <p class="howto">Games from elsewhere belong to their makers and run from their own sites; the paper only gives them a frame. If one misbehaves in the frame, use “own tab”.</p>
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
    <div class="row"><button class="btn quiet" id="tcReveal">Show today's answers</button></div>
    <div id="tcMissed"></div>
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
  const showMissed = () => {
    if (!st.revealed) return;
    const missed = p.words.filter(w => !st.found.includes(w));
    $('#tcReveal').classList.add('hidden'); $('#tcGo').disabled = true;
    $('#tcMissed').innerHTML = `<p class="howto" style="margin-top:14px">${missed.length ? `The ${missed.length} you didn't set:` : 'You had them all.'}</p><div class="found">${missed.map(w => `<span class="${isFull(w) ? 'full' : ''}">${w}</span>`).join('')}</div><p class="howto">Today's tray is closed. A new one tomorrow.</p>`;
  };
  const enter = () => {
    if (st.revealed) { cur = ''; say('Today\'s answers are showing; a new tray tomorrow.'); draw(); return; }
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
  $('#tcReveal').onclick = () => { if (!confirm('Show all of today\'s answers? That ends today\'s game.')) return; st.revealed = true; LS.set('tc:' + todayKey(), st); showMissed(); };
  keyHandler = e => { if (e.metaKey || e.ctrlKey || e.altKey) return; if (e.key === 'Enter') { e.preventDefault(); enter(); } else if (e.key === 'Backspace') { cur = cur.slice(0, -1); draw(); } else if (/^[a-z]$/i.test(e.key)) add(e.key.toLowerCase()); };
  draw(); showMissed();
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

// ------------------------------------------------------------------ Stop Press
// One five-letter word a day, six proofs to find it. The proofreader marks each letter: set (right letter,
// right place), move (in the word, wrong place), or struck (not in the word).
function spMarks(guess, answer) {
  const m = Array(5).fill('struck'), left = {};
  for (let i = 0; i < 5; i++) { if (guess[i] === answer[i]) m[i] = 'set'; else left[answer[i]] = (left[answer[i]] || 0) + 1; }
  for (let i = 0; i < 5; i++) if (m[i] !== 'set' && left[guess[i]]) { m[i] = 'move'; left[guess[i]]--; }
  return m;
}
async function stoppress() {
  frame('Stop Press');
  const data = await load('stoppress'); const n = dayNo(data.start);
  const answer = data.answers[n % data.answers.length];
  const valid = w => { for (let i = 0; i < data.guesses.length; i += 5) if (data.guesses.startsWith(w, i)) return true; return false; };
  const st = LS.get('sp:' + todayKey(), { rows: [], over: false });
  let cur = '';
  $('#main').innerHTML = `<p class="howto">Find today's five-letter word in six proofs. After each, the proofreader marks every letter: <span class="sp-key set">set</span> right place, <span class="sp-key move">move</span> in the word but elsewhere, <span class="sp-key struck">struck</span> not in the word.</p>
    <div class="sp-sheet" id="spSheet"></div><div class="msg" id="spMsg"></div><div class="sp-kb" id="spKb"></div>`;
  const say = t => { $('#spMsg').textContent = t; };
  const draw = () => {
    let h = '';
    for (let r = 0; r < 6; r++) {
      const g = st.rows[r], marks = g ? spMarks(g, answer) : null, live = !g && r === st.rows.length && !st.over;
      h += `<div class="sp-line"><span class="sp-no">${r + 1}</span>` + [0, 1, 2, 3, 4].map(i => `<span class="sp-cell ${marks ? marks[i] : ''}">${g ? g[i] : (live ? (cur[i] || '') : '')}</span>`).join('') + '</div>';
    }
    $('#spSheet').innerHTML = h;
    const best = {}; const rank = { struck: 1, move: 2, set: 3 };
    for (const g of st.rows) spMarks(g, answer).forEach((m, i) => { if (!best[g[i]] || rank[m] > rank[best[g[i]]]) best[g[i]] = m; });
    $('#spKb').innerHTML = ['qwertyuiop', 'asdfghjkl', '⏎zxcvbnm⌫'].map(row => '<div>' + [...row].map(c => `<button data-k="${c}" class="${best[c] || ''} ${c === '⏎' || c === '⌫' ? 'wide' : ''}">${c === '⏎' ? 'Proof' : c}</button>`).join('') + '</div>').join('');
    if (st.over) say(st.rows[st.rows.length - 1] === answer ? `Passed for press in ${st.rows.length}. A new word tomorrow.` : `The word was ${answer.toUpperCase()}. A new one tomorrow.`);
  };
  const press = k => {
    if (st.over) return;
    if (k === '⌫') cur = cur.slice(0, -1);
    else if (k === '⏎') {
      if (cur.length < 5) return say('Five letters.');
      if (!valid(cur)) return say('Not in the paper\'s word list.');
      st.rows.push(cur); cur = ''; if (st.rows[st.rows.length - 1] === answer || st.rows.length === 6) st.over = true;
      LS.set('sp:' + todayKey(), st); say('');
    } else if (cur.length < 5) { cur += k; say(''); }
    draw();
  };
  $('#spKb').onclick = e => { const b = e.target.closest('button'); if (b) press(b.dataset.k); };
  keyHandler = e => { if (e.metaKey || e.ctrlKey || e.altKey) return; if (e.key === 'Enter') { e.preventDefault(); press('⏎'); } else if (e.key === 'Backspace') press('⌫'); else if (/^[a-z]$/i.test(e.key)) press(e.key.toLowerCase()); };
  draw();
}

// ------------------------------------------------------------------ Crosswords (any square grid)
// The Crossword is a traditional nine-by-nine: every letter crossed, symmetric blocks, no word under three
// letters. The Mini is the five-by-five lattice. Both run on this one engine: rows of letters with # for blocks.
function miniAsGrid(p) {
  const row = r => r % 2 === 0 ? p.a[r / 2] : [0, 1, 2, 3, 4].map(c => c % 2 === 0 ? p.d[c / 2][r] : '#').join('');
  return { grid: [0, 1, 2, 3, 4].map(row), a: { 1: p.ac[0], 4: p.ac[1], 5: p.ac[2] }, d: { 1: p.dc[0], 2: p.dc[1], 3: p.dc[2] } };
}
async function crossword(kind) {
  const mini = kind === 'mini';
  frame(mini ? 'The Mini' : 'The Crossword');
  const data = await load(mini ? 'crossword' : 'crossword9'); const n = dayNo(data.start);
  const raw = data.puzzles[n % data.puzzles.length], gentle = !mini && LS.get('cwGentle', false) && raw.ae;
  const p = mini ? miniAsGrid(raw) : gentle ? { grid: raw.grid, a: raw.ae, d: raw.de } : raw;
  const N = p.grid.length, sol = (r, c) => p.grid[r][c] === '#' ? null : p.grid[r][c];
  // numbering and entries
  const num = {}, entries = []; let k = 0;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (sol(r, c) == null) continue;
    const sa = (c === 0 || sol(r, c - 1) == null) && c + 1 < N && sol(r, c + 1) != null;
    const sd = (r === 0 || sol(r - 1, c) == null) && r + 1 < N && sol(r + 1, c) != null;
    if (sa || sd) num[r + ',' + c] = ++k;
    if (sa) { const cells = []; for (let x = c; x < N && sol(r, x) != null; x++) cells.push([r, x]); entries.push({ dir: 'a', n: k, cells, clue: p.a[k] }); }
    if (sd) { const cells = []; for (let x = r; x < N && sol(x, c) != null; x++) cells.push([x, c]); entries.push({ dir: 'd', n: k, cells, clue: p.d[k] }); }
  }
  entries.sort((x, y) => (x.dir === y.dir ? x.n - y.n : x.dir === 'a' ? -1 : 1));
  const entryAt = (r, c, dir) => entries.find(e => e.dir === dir && e.cells.some(([rr, cc]) => rr === r && cc === c));
  const key = (mini ? 'xw:' : 'cw:') + todayKey();
  let st = LS.get(key, null); if (!st || !st.g || st.g.length !== N * N) st = { g: Array(N * N).fill(''), over: false };
  let [r, c] = entries[0].cells[0], dir = 'a', wrong = new Set();
  $('#main').innerHTML = `<div class="xw-clue" id="xwClue"></div><div class="xw-grid n${N}" id="xwGrid" style="grid-template-columns:repeat(${N},1fr)"></div><div class="msg" id="xwMsg"></div>
    <div class="sp-kb" id="xwKb"></div>
    <div class="row"><button class="btn quiet" id="xwCheck">Check</button><button class="btn quiet" id="xwReveal">Show the answers</button>${!mini && raw.ae ? `<button class="btn quiet" id="xwEase">${gentle ? 'Harder clues' : 'Gentler clues'}</button>` : ''}</div>
    <div class="xw-lists"><div><h4>Across</h4><div class="xw-list" id="xwA"></div></div><div><h4>Down</h4><div class="xw-list" id="xwD"></div></div></div>`;
  $('#xwKb').innerHTML = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm⌫'].map(row => '<div>' + [...row].map(ch => `<button data-k="${ch}" class="${ch === '⌫' ? 'wide' : ''}">${ch}</button>`).join('') + '</div>').join('');
  const say = t => { $('#xwMsg').textContent = t; };
  const cur = () => entryAt(r, c, dir) || entryAt(r, c, dir === 'a' ? 'd' : 'a');
  const draw = () => {
    const e = cur(); if (e) dir = e.dir;
    const inWord = new Set(e ? e.cells.map(([rr, cc]) => rr * N + cc) : []);
    let h = '';
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      if (sol(i, j) == null) { h += '<span class="xw-cell black"></span>'; continue; }
      const q = i * N + j;
      h += `<button class="xw-cell ${i === r && j === c ? 'cur' : inWord.has(q) ? 'word' : ''} ${wrong.has(q) ? 'bad' : ''}" data-r="${i}" data-c="${j}">${num[i + ',' + j] ? `<i>${num[i + ',' + j]}</i>` : ''}${esc(st.g[q])}</button>`;
    }
    $('#xwGrid').innerHTML = h;
    $('#xwClue').innerHTML = e ? `<b>${e.n} ${e.dir === 'a' ? 'Across' : 'Down'}</b> ${esc(e.clue || '')}` : '';
    const list = d => entries.filter(x => x.dir === d).map(x => { const full = x.cells.every(([rr, cc]) => st.g[rr * N + cc]); return `<button data-i="${entries.indexOf(x)}" class="${x === e ? 'on' : ''} ${full ? 'full' : ''}"><b>${x.n}</b> ${esc(x.clue || '')}</button>`; }).join('');
    $('#xwA').innerHTML = list('a'); $('#xwD').innerHTML = list('d');
    if (st.over) say(st.revealed ? 'Answers shown. A new grid tomorrow.' : 'Solved. A new grid tomorrow.');
  };
  const move = d => { const e = cur(); if (!e) return; const i = e.cells.findIndex(([rr, cc]) => rr === r && cc === c) + d; if (i >= 0 && i < e.cells.length) [r, c] = e.cells[i]; return i >= e.cells.length; };
  const nextEntry = () => { const e = cur(), i = entries.indexOf(e); for (let s2 = 1; s2 <= entries.length; s2++) { const x = entries[(i + s2) % entries.length]; const open = x.cells.find(([rr, cc]) => !st.g[rr * N + cc]); if (open) { dir = x.dir; [r, c] = open; return; } } };
  const press = ch => {
    if (st.over) return;
    if (ch === '⌫') { const q = r * N + c; if (st.g[q]) st.g[q] = ''; else { move(-1); st.g[r * N + c] = ''; } }
    else { st.g[r * N + c] = ch; wrong.delete(r * N + c); if (move(1)) nextEntry(); }
    let done = true; for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (sol(i, j) != null && st.g[i * N + j] !== sol(i, j)) done = false;
    if (done) st.over = true;
    LS.set(key, st); say(''); draw();
  };
  $('#xwGrid').onclick = ev => { const b = ev.target.closest('button'); if (!b) return; const rr = +b.dataset.r, cc = +b.dataset.c; if (rr === r && cc === c) { const o = dir === 'a' ? 'd' : 'a'; if (entryAt(r, c, o)) dir = o; } r = rr; c = cc; if (!entryAt(r, c, dir)) dir = dir === 'a' ? 'd' : 'a'; draw(); };
  const pick = ev => { const b = ev.target.closest('button'); if (!b) return; const x = entries[+b.dataset.i]; dir = x.dir; [r, c] = x.cells.find(([rr, cc]) => !st.g[rr * N + cc]) || x.cells[0]; draw(); $('#xwClue').scrollIntoView({ block: 'start', behavior: 'smooth' }); };
  $('#xwA').onclick = pick; $('#xwD').onclick = pick;
  $('#xwKb').onclick = ev => { const b = ev.target.closest('button'); if (b) press(b.dataset.k); };
  $('#xwCheck').onclick = () => { wrong = new Set(); for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (sol(i, j) != null && st.g[i * N + j] && st.g[i * N + j] !== sol(i, j)) wrong.add(i * N + j); say(wrong.size ? `${wrong.size} letter${wrong.size === 1 ? '' : 's'} to look at again.` : 'Nothing wrong so far.'); draw(); };
  $('#xwReveal').onclick = () => { if (st.over || !confirm('Show the answers? That ends today\'s crossword.')) return; for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (sol(i, j) != null) st.g[i * N + j] = sol(i, j); st.over = true; st.revealed = true; LS.set(key, st); draw(); };
  if ($('#xwEase')) $('#xwEase').onclick = () => { LS.set('cwGentle', !gentle); crossword(kind); };
  keyHandler = ev => { if (ev.metaKey || ev.ctrlKey || ev.altKey) return; if (ev.key === 'Backspace') press('⌫'); else if (/^[a-z]$/i.test(ev.key)) press(ev.key.toLowerCase()); else if (ev.key.startsWith('Arrow')) { const d = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[ev.key]; const rr = r + d[0], cc = c + d[1]; if (rr >= 0 && rr < N && cc >= 0 && cc < N && sol(rr, cc) != null) { r = rr; c = cc; const want = d[0] ? 'd' : 'a'; if (entryAt(r, c, want)) dir = want; } draw(); ev.preventDefault(); } };
  draw();
}

// ------------------------------------------------------------------ Dateline (put ten events in order)
async function dateline() {
  const N = 10, CHECKS = 4;   // ten events, four checks (Captain's word 2026-11-28)
  frame('Dateline');
  const data = await load('timeline'); const n = dayNo(data.start);
  const picks = shuffle(data.events.map((_, i) => i), 1000 + n).slice(0, N);
  const right = picks.slice().sort((a, b) => data.events[a][0] - data.events[b][0]);
  let start = shuffle(picks, 77 + n); if (start.join() === right.join()) start = start.reverse();
  let st = LS.get('dl:' + todayKey(), null);
  if (!st || st.order.length !== N) st = { order: start, checks: 0, over: false };
  $('#main').innerHTML = `<p class="howto">Put these ten events in order, earliest at the top. You have four checks; each shows which ones are in the right place.</p>
    <div id="dlList" class="dl-list"></div><div class="msg" id="dlMsg"></div>
    <div class="row"><button class="btn" id="dlCheck">Check the order</button></div>`;
  let marks = null;
  const say = t => { $('#dlMsg').textContent = t; };
  const draw = () => {
    $('#dlList').innerHTML = st.order.map((id, i) => { const ok = st.over || marks ? id === right[i] : null;
      return `<div class="dl-item ${ok === true ? 'ok' : ok === false ? 'no' : ''}"><span class="dl-year">${st.over ? data.events[id][0] : (i + 1)}</span><span class="dl-text">${esc(data.events[id][1])}</span>${st.over ? '' : `<span class="dl-move"><button data-i="${i}" data-d="-1" ${i === 0 ? 'disabled' : ''} aria-label="Move earlier">▲</button><button data-i="${i}" data-d="1" ${i === N - 1 ? 'disabled' : ''} aria-label="Move later">▼</button></span>`}</div>`; }).join('');
    $('#dlCheck').disabled = st.over;
    if (st.over) { const good = st.order.filter((id, i) => id === right[i]).length;
      if (good < N) $('#dlList').insertAdjacentHTML('beforeend', `<p class="howto" style="margin-top:14px">The right order:</p>` + right.map(id => `<div class="dl-item ok"><span class="dl-year">${data.events[id][0]}</span><span class="dl-text">${esc(data.events[id][1])}</span></div>`).join(''));
      say(good === N ? `All ten in order, with ${st.checks} check${st.checks === 1 ? '' : 's'}. More tomorrow.` : `${good} of ${N} in the right place. More tomorrow.`); }
    else $('#dlCheck').textContent = `Check the order (${CHECKS - st.checks} left)`;
  };
  $('#dlList').onclick = e => { const b = e.target.closest('button'); if (!b || st.over) return; const i = +b.dataset.i, j = i + (+b.dataset.d); [st.order[i], st.order[j]] = [st.order[j], st.order[i]]; marks = null; say(''); LS.set('dl:' + todayKey(), st); draw(); };
  $('#dlCheck').onclick = () => { st.checks++; marks = true; const good = st.order.filter((id, i) => id === right[i]).length; if (good === N || st.checks >= CHECKS) st.over = true; else say(`${good} of ${N} in the right place.`); LS.set('dl:' + todayKey(), st); draw(); };
  keyHandler = null; draw();
}

// ------------------------------------------------------------------ The Quiz (one question from each category)
async function quiz() {
  frame('The Quiz');
  const data = await load('trivia'); const n = dayNo(data.start);
  const qs = data.cats.map((cat, i) => { const q = cat.q[n % cat.q.length]; return { cat: cat.name, text: q[0], right: q[1][0], opts: shuffle(q[1], 500 + n * 7 + i) }; });
  const st = LS.get('qz:' + todayKey(), { picks: [] });
  const draw = () => {
    const i = st.picks.length, score = st.picks.filter((x, k) => x === qs[k].right).length;
    if (i >= qs.length) {
      $('#main').innerHTML = `<p class="qz-score">${score} of ${qs.length}</p><p class="msg">${score === qs.length ? 'A clean sweep.' : score >= 4 ? 'A good day at the desk.' : 'Tomorrow is another edition.'} Six new questions tomorrow.</p>` +
        qs.map((q, k) => `<div class="dl-item ${st.picks[k] === q.right ? 'ok' : 'no'}"><span class="dl-text"><span class="muted small">${esc(q.cat)}</span><br>${esc(q.text)}<br><b>${esc(q.right)}</b>${st.picks[k] === q.right ? '' : ` <span class="muted">(you said ${esc(st.picks[k])})</span>`}</span></div>`).join('');
      return;
    }
    const q = qs[i];
    $('#main').innerHTML = `<div class="qz-dots">${qs.map((x, k) => `<i class="${k < i ? (st.picks[k] === x.right ? 'ok' : 'no') : k === i ? 'now' : ''}"></i>`).join('')}</div><p class="qz-cat">${esc(q.cat)}</p><p class="qz-q">${esc(q.text)}</p>
      <div class="qz-opts" id="qzOpts">${q.opts.map(o => `<button data-o="${esc(o)}">${esc(o)}</button>`).join('')}</div><div class="msg" id="qzMsg"></div><div class="row"><button class="btn hidden" id="qzNext">${i === qs.length - 1 ? 'See the score' : 'Next question'}</button></div>`;
    $('#qzOpts').onclick = e => { const b = e.target.closest('button'); if (!b || $('#qzOpts').dataset.done) return; $('#qzOpts').dataset.done = 1;
      const pick = b.dataset.o; st.picks.push(pick); LS.set('qz:' + todayKey(), st);
      for (const x of $('#qzOpts').children) { if (x.dataset.o === q.right) x.classList.add('ok'); else if (x === b) x.classList.add('no'); x.disabled = true; }
      $('#qzMsg').textContent = pick === q.right ? 'Right.' : `It was: ${q.right}.`; $('#qzNext').classList.remove('hidden'); $('#qzNext').onclick = draw; };
  };
  keyHandler = null; draw();
}

// ------------------------------------------------------------------ routing
let keyHandler = null;
document.addEventListener('keydown', e => { if (keyHandler) keyHandler(e); });
function route() {
  keyHandler = null;
  const h = location.hash.replace(/^#/, '');
  if (h === 'typecase') typecase(); else if (h === 'stoppress') stoppress(); else if (h === 'crossword') crossword('big'); else if (h === 'mini') crossword('mini'); else if (h === 'dateline') dateline(); else if (h === 'quiz') quiz(); else if (h === 'columns') columns(); else if (h.startsWith('g:')) embed(h.slice(2)); else hub();
}
window.addEventListener('hashchange', route);
route();
})();
