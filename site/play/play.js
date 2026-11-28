/* The Grotto Picayune — Puzzles. Six games of the paper's own (Type Case, Four Columns, Stop Press, The Crossword, Dateline, The Quiz) and a shelf of other
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
  const tc = LS.get('tc:' + todayKey(), null), fc = LS.get('fc:' + todayKey(), null), sp = LS.get('sp:' + todayKey(), null);
  const card = (href, icon, name, d, done, ext) => `<a class="game-card" href="${esc(href)}"${ext ? ' target="_blank" rel="noopener noreferrer"' : ''}><span class="gi">${icon}</span><span><b>${esc(name)}</b><span class="d">${esc(d)}</span></span>${done ? `<span class="done">${esc(done)}</span>` : ''}</a>`;
  $('#main').innerHTML = `<div class="hub">
    <h2>The paper's own, new every day</h2>
    ${card('#typecase', 'T', 'Type Case', 'Seven letters in the tray. How many words can you set?', tc && tc.found.length ? `${tc.found.length} word${tc.found.length === 1 ? '' : 's'}` : '')}
    ${card('#columns', '▥', 'Four Columns', 'Sixteen words, four hidden groups of four.', fc && fc.over ? (fc.solved.length === 4 && fc.slips < 4 ? 'solved' : 'played') : '')}
    ${card('#stoppress', '¶', 'Stop Press', 'One five-letter word, six proofs to find it.', sp && sp.over ? 'played' : (sp && sp.rows.length ? `${sp.rows.length} of 6` : ''))}
    ${card('#crossword', '▦', 'The Crossword', 'A small daily grid: three across, three down.', (x => x && x.over ? (x.revealed ? 'shown' : 'solved') : '')(LS.get('xw:' + todayKey(), null)))}
    ${card('#dateline', '⏳', 'Dateline', 'Six events from history. Put them in order.', (x => x && x.over ? 'played' : '')(LS.get('dl:' + todayKey(), null)))}
    ${card('#quiz', '?', 'The Quiz', 'Six questions, one from each category.', (x => x && x.picks.length >= 6 ? 'played' : '')(LS.get('qz:' + todayKey(), null)))}
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

// ------------------------------------------------------------------ The Crossword (a five-by-five lattice)
async function crossword() {
  frame('The Crossword');
  const data = await load('crossword'); const n = dayNo(data.start);
  const p = data.puzzles[n % data.puzzles.length];
  const sol = (r, c) => r % 2 === 0 ? p.a[r / 2][c] : (c % 2 === 0 ? p.d[c / 2][r] : null);
  const NUM = { '0,0': 1, '0,2': 2, '0,4': 3, '2,0': 4, '4,0': 5 };
  const CLUES = [['a', 0, '1 Across', p.ac[0]], ['a', 2, '4 Across', p.ac[1]], ['a', 4, '5 Across', p.ac[2]], ['d', 0, '1 Down', p.dc[0]], ['d', 2, '2 Down', p.dc[1]], ['d', 4, '3 Down', p.dc[2]]];
  const st = LS.get('xw:' + todayKey(), { g: Array(25).fill(''), over: false, checked: false });
  let r = 0, c = 0, dir = 'a', wrong = new Set();
  $('#main').innerHTML = `<div class="xw-clue" id="xwClue"></div><div class="xw-grid" id="xwGrid"></div><div class="msg" id="xwMsg"></div>
    <div class="sp-kb" id="xwKb"></div>
    <div class="row"><button class="btn quiet" id="xwCheck">Check</button><button class="btn quiet" id="xwReveal">Show the answers</button></div>
    <div class="xw-list" id="xwList"></div>`;
  const say = t => { $('#xwMsg').textContent = t; };
  const inWord = (rr, cc) => dir === 'a' ? rr === r : cc === c;
  const fixDir = () => { if (r % 2 === 1) dir = 'd'; else if (c % 2 === 1) dir = 'a'; };
  const draw = () => {
    let h = '';
    for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
      if (sol(i, j) == null) { h += '<span class="xw-cell black"></span>'; continue; }
      const k = i * 5 + j;
      h += `<button class="xw-cell ${i === r && j === c ? 'cur' : inWord(i, j) ? 'word' : ''} ${wrong.has(k) ? 'bad' : ''}" data-r="${i}" data-c="${j}">${NUM[i + ',' + j] ? `<i>${NUM[i + ',' + j]}</i>` : ''}${esc(st.g[k])}</button>`;
    }
    $('#xwGrid').innerHTML = h;
    const cl = CLUES.find(x => x[0] === dir && x[1] === (dir === 'a' ? r : c));
    $('#xwClue').innerHTML = cl ? `<b>${cl[2]}</b> ${esc(cl[3])}` : '';
    $('#xwList').innerHTML = CLUES.map((x, i) => `<button data-i="${i}" class="${x === cl ? 'on' : ''}"><b>${x[2]}</b> ${esc(x[3])}</button>`).join('');
    $('#xwKb').innerHTML = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm⌫'].map(row => '<div>' + [...row].map(ch => `<button data-k="${ch}" class="${ch === '⌫' ? 'wide' : ''}">${ch}</button>`).join('') + '</div>').join('');
    if (st.over) say(st.revealed ? 'Answers shown. A new grid tomorrow.' : 'Solved. A new grid tomorrow.');
  };
  const step = d => { if (dir === 'a') c = Math.max(0, Math.min(4, c + d)); else r = Math.max(0, Math.min(4, r + d)); };
  const press = k => {
    if (st.over) return;
    if (k === '⌫') { const i = r * 5 + c; if (st.g[i]) st.g[i] = ''; else { step(-1); st.g[r * 5 + c] = ''; } }
    else { st.g[r * 5 + c] = k; wrong.delete(r * 5 + c); step(1); }
    let done = true; for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) if (sol(i, j) != null && st.g[i * 5 + j] !== sol(i, j)) done = false;
    if (done) st.over = true;
    LS.set('xw:' + todayKey(), st); say(''); draw();
  };
  $('#xwGrid').onclick = e => { const b = e.target.closest('button'); if (!b) return; const rr = +b.dataset.r, cc = +b.dataset.c; if (rr === r && cc === c) dir = dir === 'a' ? 'd' : 'a'; r = rr; c = cc; fixDir(); draw(); };
  $('#xwList').onclick = e => { const b = e.target.closest('button'); if (!b) return; const x = CLUES[+b.dataset.i]; dir = x[0]; if (dir === 'a') { r = x[1]; c = 0; } else { c = x[1]; r = 0; } draw(); };
  $('#xwKb').onclick = e => { const b = e.target.closest('button'); if (b) press(b.dataset.k); };
  $('#xwCheck').onclick = () => { wrong = new Set(); for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) if (sol(i, j) != null && st.g[i * 5 + j] && st.g[i * 5 + j] !== sol(i, j)) wrong.add(i * 5 + j); say(wrong.size ? `${wrong.size} letter${wrong.size === 1 ? '' : 's'} to look at again.` : 'Nothing wrong so far.'); draw(); };
  $('#xwReveal').onclick = () => { if (st.over || !confirm('Show the answers? That ends today\'s crossword.')) return; for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) if (sol(i, j) != null) st.g[i * 5 + j] = sol(i, j); st.over = true; st.revealed = true; LS.set('xw:' + todayKey(), st); draw(); };
  keyHandler = e => { if (e.metaKey || e.ctrlKey || e.altKey) return; if (e.key === 'Backspace') press('⌫'); else if (/^[a-z]$/i.test(e.key)) press(e.key.toLowerCase()); else if (e.key.startsWith('Arrow')) { const d = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[e.key]; const rr = r + d[0], cc = c + d[1]; if (rr >= 0 && rr < 5 && cc >= 0 && cc < 5 && sol(rr, cc) != null) { r = rr; c = cc; dir = d[0] ? 'd' : 'a'; fixDir(); draw(); } e.preventDefault(); } };
  draw();
}

// ------------------------------------------------------------------ Dateline (put six events in order)
async function dateline() {
  frame('Dateline');
  const data = await load('timeline'); const n = dayNo(data.start);
  const picks = shuffle(data.events.map((_, i) => i), 1000 + n).slice(0, 6);
  const right = picks.slice().sort((a, b) => data.events[a][0] - data.events[b][0]);
  let start = shuffle(picks, 77 + n); if (start.join() === right.join()) start = start.reverse();
  const st = LS.get('dl:' + todayKey(), { order: start, checks: 0, over: false });
  $('#main').innerHTML = `<p class="howto">Put these six events in order, earliest at the top. You have three checks; each shows which ones are in the right place.</p>
    <div id="dlList" class="dl-list"></div><div class="msg" id="dlMsg"></div>
    <div class="row"><button class="btn" id="dlCheck">Check the order</button></div>`;
  let marks = null;
  const say = t => { $('#dlMsg').textContent = t; };
  const draw = () => {
    $('#dlList').innerHTML = st.order.map((id, i) => { const ok = st.over || marks ? id === right[i] : null;
      return `<div class="dl-item ${ok === true ? 'ok' : ok === false ? 'no' : ''}"><span class="dl-year">${st.over ? data.events[id][0] : (i + 1)}</span><span class="dl-text">${esc(data.events[id][1])}</span>${st.over ? '' : `<span class="dl-move"><button data-i="${i}" data-d="-1" ${i === 0 ? 'disabled' : ''} aria-label="Move earlier">▲</button><button data-i="${i}" data-d="1" ${i === 5 ? 'disabled' : ''} aria-label="Move later">▼</button></span>`}</div>`; }).join('');
    $('#dlCheck').disabled = st.over;
    if (st.over) { const good = st.order.filter((id, i) => id === right[i]).length;
      if (good < 6) $('#dlList').insertAdjacentHTML('beforeend', `<p class="howto" style="margin-top:14px">The right order:</p>` + right.map(id => `<div class="dl-item ok"><span class="dl-year">${data.events[id][0]}</span><span class="dl-text">${esc(data.events[id][1])}</span></div>`).join(''));
      say(good === 6 ? `All six in order, with ${st.checks} check${st.checks === 1 ? '' : 's'}. More tomorrow.` : `${good} of 6 in the right place. More tomorrow.`); }
    else $('#dlCheck').textContent = `Check the order (${3 - st.checks} left)`;
  };
  $('#dlList').onclick = e => { const b = e.target.closest('button'); if (!b || st.over) return; const i = +b.dataset.i, j = i + (+b.dataset.d); [st.order[i], st.order[j]] = [st.order[j], st.order[i]]; marks = null; say(''); LS.set('dl:' + todayKey(), st); draw(); };
  $('#dlCheck').onclick = () => { st.checks++; marks = true; const good = st.order.filter((id, i) => id === right[i]).length; if (good === 6 || st.checks >= 3) st.over = true; else say(`${good} of 6 in the right place.`); LS.set('dl:' + todayKey(), st); draw(); };
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
    $('#main').innerHTML = `<p class="howto">Question ${i + 1} of ${qs.length} · ${score} right so far</p><p class="qz-cat">${esc(q.cat)}</p><p class="qz-q">${esc(q.text)}</p>
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
  if (h === 'typecase') typecase(); else if (h === 'stoppress') stoppress(); else if (h === 'crossword') crossword(); else if (h === 'dateline') dateline(); else if (h === 'quiz') quiz(); else if (h === 'columns') columns(); else if (h.startsWith('g:')) embed(h.slice(2)); else hub();
}
window.addEventListener('hashchange', route);
route();
})();
