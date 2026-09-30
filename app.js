(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = o => JSON.parse(JSON.stringify(o));
const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const DAY = 864e5;
// Leitner boxes: a right answer moves a card up one box; a miss drops it to box 0 (due again right away).
const INTERVALS = [0, 1 * DAY, 2 * DAY, 4 * DAY, 8 * DAY, 16 * DAY, 35 * DAY];
const MASTER_BOX = 4;
const LANG_COLORS = ['#c2410c', '#2c50c4', '#15803d', '#9333ea', '#be185d', '#0e7490', '#a16207', '#4d7c0f'];
const SUGGEST = ['Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Japanese', 'Mandarin', 'Korean', 'Dutch', 'Te Reo Māori'];
const VOICES = { spanish: 'es-ES', french: 'fr-FR', german: 'de-DE', italian: 'it-IT', portuguese: 'pt-PT', japanese: 'ja-JP', mandarin: 'zh-CN', chinese: 'zh-CN', cantonese: 'zh-HK', korean: 'ko-KR', dutch: 'nl-NL', russian: 'ru-RU', arabic: 'ar-SA', hindi: 'hi-IN', greek: 'el-GR', swedish: 'sv-SE', norwegian: 'nb-NO', danish: 'da-DK', finnish: 'fi-FI', polish: 'pl-PL', turkish: 'tr-TR', irish: 'ga-IE', welsh: 'cy-GB', 'te reo māori': 'mi-NZ', maori: 'mi-NZ', 'māori': 'mi-NZ', vietnamese: 'vi-VN', thai: 'th-TH', indonesian: 'id-ID', czech: 'cs-CZ', hungarian: 'hu-HU', hebrew: 'he-IL', ukrainian: 'uk-UA' };

const ACH = [
  { id: 'first', name: 'First card', desc: 'Answer your first card', test: c => c.reviews >= 1 },
  { id: 'words10', name: 'Collector', desc: 'Add 10 words', test: c => c.words >= 10 },
  { id: 'words50', name: 'Word hoard', desc: 'Add 50 words', test: c => c.words >= 50 },
  { id: 'words200', name: 'Lexicographer', desc: 'Add 200 words', test: c => c.words >= 200 },
  { id: 'rev100', name: 'Centurion', desc: '100 cards answered', test: c => c.reviews >= 100 },
  { id: 'rev1000', name: 'Thousand club', desc: '1,000 cards answered', test: c => c.reviews >= 1000 },
  { id: 'combo10', name: 'On a roll', desc: '10 right in a row', test: c => c.bestCombo >= 10 },
  { id: 'combo25', name: 'Unstoppable', desc: '25 right in a row', test: c => c.bestCombo >= 25 },
  { id: 'perfect', name: 'Clean sweep', desc: 'Perfect session of 10+', test: c => c.perfect },
  { id: 'goal', name: 'Goal getter', desc: 'Hit your daily goal', test: c => c.goalDays >= 1 },
  { id: 'streak3', name: 'Warming up', desc: '3-day streak', test: c => c.bestStreak >= 3 },
  { id: 'streak7', name: 'Week strong', desc: '7-day streak', test: c => c.bestStreak >= 7 },
  { id: 'streak30', name: 'Habit formed', desc: '30-day streak', test: c => c.bestStreak >= 30 },
  { id: 'master10', name: 'Sticky', desc: 'Master 10 words both ways', test: c => c.mastered >= 10 },
  { id: 'master50', name: 'Fluent-ish', desc: 'Master 50 words both ways', test: c => c.mastered >= 50 },
  { id: 'poly', name: 'Polyglot', desc: 'Words in 2 languages', test: c => c.langsWithWords >= 2 },
];

// ---------- state ----------
const S = { langs: {}, cards: {}, stats: defaultStats(), ready: false };
function defaultStats() { return { xp: 0, days: {}, goal: 20, ach: {}, reviews: 0, bestCombo: 0, bestStreak: 0, perfect: false }; }
const PREF_KEY = 'wordstack.prefs.v1', LOCAL_KEY = 'wordstack.data.v1';
let pref = { lang: null, dir: 'both', mode: 'due', tags: [], size: 20 };
try { Object.assign(pref, JSON.parse(localStorage.getItem(PREF_KEY) || '{}')); } catch (e) {}
function savePref() { try { localStorage.setItem(PREF_KEY, JSON.stringify(pref)); } catch (e) {} }
let view = 'practice';
let sess = null;
let wordQuery = '', wordTag = '';

function blankSide(x) { return Object.assign({ box: 0, due: 0, right: 0, wrong: 0, last: 0 }, x || {}); }
function normCard(d, id) {
  return { id, lang: d.lang, en: d.en || '', tr: d.tr || '', tags: Array.isArray(d.tags) ? d.tags : [], note: d.note || '', created: d.created || 0,
    s: { f: blankSide(d.s && d.s.f), b: blankSide(d.s && d.s.b) } };
}

// ---------- persistence (on this device) ----------
// Everything lives in localStorage, like Footy Stats Counter. Saves are
// immediate so nothing is lost if the app is closed mid-session.
function write() { saveLocal(); }
function saveStats() { saveLocal(); }
function saveLocal() {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify({ langs: S.langs, cards: S.cards, stats: S.stats })); }
  catch (e) { toast('Could not save. Your device storage may be full.'); }
}
function loadLocal() {
  try {
    const d = JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null');
    if (d) applyData(d);
  } catch (e) {}
}
function applyData(d) {
  S.langs = d.langs || {}; S.cards = {};
  for (const [id, c] of Object.entries(d.cards || {})) S.cards[id] = normCard(c, id);
  S.stats = Object.assign(defaultStats(), d.stats);
}
function initStore() {
  loadLocal(); S.ready = true; afterData();
  // ask the browser not to clear our data when space runs low
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {}
}

// ---------- backup ----------
async function exportBackup() {
  const stripped = {};
  for (const [id, c] of Object.entries(S.cards)) stripped[id] = stripId(c);
  const json = JSON.stringify({ app: 'wordstack', version: 1, exported: new Date().toISOString(), langs: S.langs, cards: stripped, stats: S.stats }, null, 1);
  const name = 'wordstack-backup-' + today() + '.json';
  const file = new File([json], name, { type: 'application/json' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  const url = URL.createObjectURL(file), link = document.createElement('a');
  link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
function importBackup(file) {
  const r = new FileReader();
  r.onload = () => {
    let d;
    try { d = JSON.parse(r.result); } catch (e) { toast('That file isn\'t a Wordstack backup.'); return; }
    if (!d || d.app !== 'wordstack' || !d.cards) { toast('That file isn\'t a Wordstack backup.'); return; }
    applyData(d); saveLocal(); sess = null; pref.tags = []; afterData();
    $('#view').innerHTML = ''; render();
    toast('Restored ' + Object.keys(S.cards).length + ' words');
  };
  r.readAsText(file);
}
const EXAMPLES = [['the dog', 'el perro', 'animals'], ['the cat', 'el gato', 'animals'], ['the bird', 'el pájaro', 'animals'], ['the horse', 'el caballo', 'animals'],
  ['the hand', 'la mano', 'body parts', 'Feminine even though it ends in -o'], ['the head', 'la cabeza', 'body parts'], ['the eye', 'el ojo', 'body parts'], ['the foot', 'el pie', 'body parts'],
  ['the bread', 'el pan', 'food'], ['the apple', 'la manzana', 'food'], ['to eat', 'comer', 'food, verbs'], ['to drink', 'beber', 'food, verbs']];
function loadExamples() {
  if (Object.values(S.langs).some(l => l.name === 'Spanish (examples)')) { addLang('Spanish (examples)'); return; }
  addLang('Spanish (examples)');
  const t0 = Date.now();
  EXAMPLES.forEach(([en, tr, tags, note], k) => { const id = uid('c'); S.cards[id] = normCard({ lang: pref.lang, en, tr, tags: parseTags(tags), note: note || '', created: t0 + k }, id); });
  saveLocal(); $('#view').innerHTML = ''; render();
}

function afterData() {
  if (!S.langs[pref.lang]) { pref.lang = Object.keys(S.langs).sort((a, b) => (S.langs[a].created || 0) - (S.langs[b].created || 0))[0] || null; savePref(); }
  renderHeader();
  if (sess && !sess.done) return; // never disturb a card mid-swipe
  render();
}

// ---------- derived ----------
const curLang = () => S.langs[pref.lang] || null;
const langCards = lid => Object.values(S.cards).filter(c => c.lang === lid);
function langCode(name) { const w = (String(name || '').match(/[\p{L}]+/gu) || ['?']).filter(x => !/^(examples?)$/i.test(x)); if (!w.length) w.push('?'); return (w.length > 1 ? w[0][0] + w[1][0] : w[0].slice(0, 2)).toUpperCase(); }
function langColor(l) { return l && l.color || LANG_COLORS[0]; }
function voiceFor(name) { return VOICES[String(name || '').trim().toLowerCase()] || null; }
function allTags(lid) {
  const m = {}; langCards(lid).forEach(c => c.tags.forEach(t => { m[t] = (m[t] || 0) + 1; }));
  return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0]));
}
function scopeCards() {
  let cs = langCards(pref.lang);
  const tags = pref.tags.filter(t => cs.some(c => c.tags.includes(t)));
  if (tags.length) cs = cs.filter(c => c.tags.some(t => tags.includes(t)));
  return cs;
}
const dirsFor = () => pref.dir === 'both' ? ['f', 'b'] : [pref.dir];
function level(xp) { let L = 1; while (xp >= 25 * L * (L + 1)) L++; return L; }
const lvlFloor = L => 25 * (L - 1) * L;
function today(d = new Date()) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function dayCount(k) { return S.stats.days[k] || 0; }
function streak() {
  const g = S.stats.goal; let n = 0; const d = new Date();
  if (dayCount(today(d)) < g) d.setDate(d.getDate() - 1);
  while (dayCount(today(d)) >= g) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
function stage(side) {
  if (side.right + side.wrong === 0) return 'new';
  if (side.box >= MASTER_BOX) return 'mast';
  if (side.box >= 2) return 'fam';
  return 'learn';
}
function achContext() {
  const cards = Object.values(S.cards);
  const langsWithWords = new Set(cards.map(c => c.lang)).size;
  return {
    reviews: S.stats.reviews, words: cards.length, bestCombo: S.stats.bestCombo, perfect: S.stats.perfect,
    goalDays: Object.values(S.stats.days).filter(v => v >= S.stats.goal).length, bestStreak: Math.max(S.stats.bestStreak || 0, streak()),
    mastered: cards.filter(c => c.s.f.box >= MASTER_BOX && c.s.b.box >= MASTER_BOX).length, langsWithWords,
  };
}
function checkAch() {
  const ctx = achContext(); let changed = false;
  S.stats.bestStreak = ctx.bestStreak;
  for (const a of ACH) if (!S.stats.ach[a.id] && a.test(ctx)) { S.stats.ach[a.id] = today(); changed = true; toast('Achievement unlocked: ' + a.name, 'gold'); }
  if (changed) saveStats();
}

// ---------- header / nav ----------
function renderHeader() {
  const l = curLang();
  $('#langBadge').textContent = l ? langCode(l.name) : '+';
  $('#langBadge').style.setProperty('--bc', langColor(l));
  $('#langName').textContent = l ? l.name : 'Add a language';
  const st = streak();
  $('#streakN').textContent = st;
  $('#streakChip').classList.toggle('cold', dayCount(today()) < S.stats.goal);
  $('#streakChip').title = st + '-day streak' + (dayCount(today()) < S.stats.goal ? ' (hit today\'s goal to extend it)' : '');
  $('#levelN').textContent = level(S.stats.xp);
}
function setTab(t) {
  if (sess && !sess.done && t !== 'practice') { sess = null; }
  view = t; $$('.tabs button').forEach(b => b.setAttribute('aria-current', b.dataset.tab === t ? 'page' : 'false'));
  $('#view').innerHTML = ''; $('#view').scrollTop = 0; render();
}
function render() {
  if (!S.ready) return;
  renderHeader();
  if (view === 'practice') renderPractice(); else if (view === 'words') renderWords(); else renderProgress();
}

// ---------- practice setup ----------
function renderPractice() {
  const v = $('#view');
  if (sess) { sess.done ? renderSummary() : renderSession(); return; }
  const l = curLang();
  if (!l) { v.innerHTML = welcomeHTML(); return; }
  const cs = langCards(pref.lang);
  if (!cs.length) {
    v.innerHTML = `<div class="empty"><h2>Your ${esc(l.name)} deck is empty</h2><p>Add some words you want to learn. Tag them (animals, food, verbs) so you can drill one topic at a time.</p>
      <div class="chips" style="justify-content:center"><button class="btn primary" data-act="add-word">Add a word</button><button class="btn ghost" data-act="bulk">Paste a list</button><button class="btn ghost" data-act="import">Import a spreadsheet</button></div></div>`;
    return;
  }
  const now = Date.now(), dirs = dirsFor(), scope = scopeCards();
  let due = 0, fresh = 0;
  scope.forEach(c => dirs.forEach(d => { if (c.s[d].due <= now) { due++; if (c.s[d].right + c.s[d].wrong === 0) fresh++; } }));
  const mastered = cs.filter(c => c.s.f.box >= MASTER_BOX && c.s.b.box >= MASTER_BOX).length;
  const tags = allTags(pref.lang);
  const avail = pref.mode === 'due' ? due : scope.length * dirs.length;
  const n = Math.min(pref.size, avail);
  const td = dayCount(today()), goal = S.stats.goal;
  const seg = (key, opts) => `<div class="seg" role="group">${opts.map(([val, lab]) => `<button data-pref="${key}" data-val="${val}" aria-pressed="${String(pref[key]) === String(val)}">${lab}</button>`).join('')}</div>`;
  v.innerHTML = `<div class="stack">
    <div class="due">
      <div class="eyebrow">${pref.mode === 'due' ? 'Due for review' : 'Shuffle practice'}${pref.tags.length ? ' · ' + esc(pref.tags.join(', ')) : ''}</div>
      <div class="row"><span class="num">${pref.mode === 'due' ? due : avail}</span><span class="muted">${pref.mode === 'due' ? 'cards due now' : 'cards in the pool'}</span></div>
      <div class="sub"><span><b>${cs.length}</b> words</span><span><b>${fresh}</b> new</span><span><b>${mastered}</b> mastered both ways</span></div>
    </div>
    <div class="field"><span class="eyebrow">Direction</span>${seg('dir', [['f', 'English → ' + esc(l.name)], ['b', esc(l.name) + ' → English'], ['both', 'Both']])}</div>
    <div class="field"><span class="eyebrow">Cards</span>${seg('mode', [['due', 'Due for review'], ['shuffle', 'Shuffle all']])}</div>
    ${tags.length ? `<div class="field"><span class="eyebrow">Tags</span><div class="chips">
      <button class="chip" data-act="tag-all" aria-pressed="${!pref.tags.length}">All words <span class="n">${cs.length}</span></button>
      ${tags.map(([t, k]) => `<button class="chip" data-act="tag" data-tag="${esc(t)}" aria-pressed="${pref.tags.includes(t)}">${esc(t)} <span class="n">${k}</span></button>`).join('')}
    </div></div>` : ''}
    <div class="field"><span class="eyebrow">Session length</span>${seg('size', [[10, '10'], [20, '20'], [50, '50']])}</div>
    ${n > 0 ? `<button class="btn primary big" data-act="start">Start · ${n} card${n === 1 ? '' : 's'}</button>`
      : `<button class="btn primary big" data-act="shuffle-instead">Nothing due. Shuffle practice instead</button>`}
    <div class="goalbar"><span>Today</span><div class="track"><i style="width:${Math.min(100, td / goal * 100)}%"></i></div><span class="count">${td}/${goal}</span></div>
  </div>`;
}
function welcomeHTML() {
  return `<div class="empty"><h2>What are you learning?</h2><p>Each language gets its own deck, progress and tags. You can add more later.</p>
    <form id="firstLang" class="stack" style="width:100%;max-width:360px">
      <input class="input" id="firstLangName" placeholder="e.g. Spanish" autocomplete="off" required>
      <div class="chips" style="justify-content:center">${SUGGEST.slice(0, 8).map(s => `<button type="button" class="chip" data-act="fill-lang" data-name="${esc(s)}">${esc(s)}</button>`).join('')}</div>
      <button class="btn primary big">Create deck</button>
      <button type="button" class="btn ghost" data-act="examples">Or try it with example Spanish words</button>
    </form></div>`;
}

// ---------- queue building ----------
function weight(side) {
  const tries = side.right + side.wrong;
  const miss = tries ? side.wrong / tries : 0;
  return (1 + 4 * miss + 1.5 * side.wrong / (tries + 2)) / (1 + side.box * 0.6) * (tries ? 1 : 1.3);
}
function weightedSample(items, n) {
  const pool = items.map(i => ({ i, w: weight(S.cards[i.id].s[i.d]) })), out = [];
  while (out.length < n && pool.length) {
    let r = Math.random() * pool.reduce((a, p) => a + p.w, 0), k = 0;
    while (k < pool.length - 1 && (r -= pool[k].w) > 0) k++;
    out.push(pool.splice(k, 1)[0].i);
  }
  return out;
}
function spreadPairs(q) {
  // keep the two directions of one word from landing back to back
  for (let i = 1; i < q.length; i++) if (q[i].id === q[i - 1].id) {
    const j = q.findIndex((x, k) => k > i && x.id !== q[i].id && (k + 1 >= q.length || q[k + 1].id !== q[i].id));
    if (j > 0) [q[i], q[j]] = [q[j], q[i]];
  }
  return q;
}
function buildQueue() {
  const now = Date.now(), dirs = dirsFor();
  let items = [];
  scopeCards().forEach(c => dirs.forEach(d => items.push({ id: c.id, d })));
  if (pref.mode === 'due') {
    items = items.filter(i => S.cards[i.id].s[i.d].due <= now);
    const seenWrong = items.filter(i => { const s = S.cards[i.id].s[i.d]; return s.right + s.wrong > 0; });
    const fresh = items.filter(i => { const s = S.cards[i.id].s[i.d]; return s.right + s.wrong === 0; });
    // missed and weaker cards first, then new ones
    const reviews = weightedSample(seenWrong, seenWrong.length);
    const news = fresh.sort(() => Math.random() - .5);
    items = reviews.concat(news).slice(0, pref.size).sort(() => Math.random() - .5);
    items = weightedSample(items, items.length);
  } else {
    items = weightedSample(items, Math.min(pref.size, items.length));
  }
  return spreadPairs(items.map(i => ({ ...i, retry: 0 })));
}
function startSession(queue, label) {
  if (!queue.length) return;
  sess = { queue, i: 0, flipped: false, right: 0, wrong: 0, xp: 0, combo: 0, best: 0, missed: {}, label, mode: pref.mode, startLevel: level(S.stats.xp), done: false };
  $('#view').innerHTML = ''; renderSession();
}

// ---------- session ----------
function renderSession() {
  const v = $('#view'), it = sess.queue[sess.i], c = S.cards[it && it.id];
  if (!it) { finishSession(); return; }
  if (!c) { sess.queue.splice(sess.i, 1); renderSession(); return; } // card was deleted elsewhere
  const l = S.langs[c.lang] || curLang(), lname = l ? l.name : 'Translation';
  const fwd = it.d === 'f';
  const prompt = fwd ? c.en : c.tr, answer = fwd ? c.tr : c.en;
  const from = fwd ? 'English' : lname, to = fwd ? lname : 'English';
  const side = c.s[it.d];
  const pips = Array.from({ length: 6 }, (_, k) => `<i class="${k < side.box ? 'on' : ''}"></i>`).join('');
  const canSpeak = 'speechSynthesis' in window && voiceFor(lname);
  const spk = w => canSpeak ? `<button class="speak" data-act="speak" data-text="${esc(w)}" aria-label="Hear it"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/></svg></button>` : '<span></span>';
  const total = sess.queue.length;
  v.innerHTML = `<div class="session">
    <div class="sess-top">
      <button class="icon-btn" data-act="end" aria-label="End session"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      <div class="track blue"><i style="width:${sess.i / total * 100}%"></i></div>
      <span class="count">${sess.i + 1}/${total}</span>
    </div>
    <div class="combo"><span>${sess.combo >= 2 ? `<b class="pop">×${sess.combo}</b> combo` : ''}</span><span class="xp">+${sess.xp} XP</span></div>
    <div class="deck">
      ${sess.i + 1 < total ? '<div class="card-under"></div>' : ''}
      <div class="card${sess.flipped ? ' flipped' : ''}" id="card" tabindex="0" aria-label="Flash card. Tap to flip.">
        <div class="stamp yes">KNEW IT</div><div class="stamp no">MISSED</div>
        <div class="flip">
          <div class="face front">
            <div class="head"><span class="eyebrow">${esc(from)} → ${esc(to)}${it.retry ? ' · again' : ''}</span>${fwd ? '<span></span>' : spk(prompt)}</div>
            <div class="word">${esc(prompt)}</div>
            <div class="foot"><span>Tap to reveal</span><span class="pips" title="Box ${side.box} of 6">${pips}</span></div>
          </div>
          <div class="face back">
            <div class="head"><span class="eyebrow">${esc(to)}</span>${fwd ? spk(answer) : '<span></span>'}</div>
            <div class="mid"><div class="prompt-small">${esc(prompt)}</div><div class="word">${esc(answer)}</div>${c.note ? `<div class="note">${esc(c.note)}</div>` : ''}</div>
            <div class="foot"><span>${c.tags.map(esc).join(' · ')}</span><span class="pips">${pips}</span></div>
          </div>
        </div>
      </div>
    </div>
    <div class="answer-row">
      <button class="btn miss" data-act="miss"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>Missed</button>
      <button class="btn hit" data-act="hit"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7"/></svg>Knew it</button>
    </div>
    <p class="hint">Swipe right if you knew it, left if you didn't. Keys: space flips, ← →.</p>
  </div>`;
  bindSwipe($('#card'));
}
let busy = false;
function bindSwipe(el) {
  let sx = 0, sy = 0, dx = 0, dy = 0, down = false, moved = false;
  const yes = $('.stamp.yes', el), no = $('.stamp.no', el);
  const stamp = x => { yes.style.opacity = Math.max(0, Math.min(1, x / 90)); no.style.opacity = Math.max(0, Math.min(1, -x / 90)); };
  el.addEventListener('pointerdown', e => {
    if (busy || e.target.closest('[data-act]')) return;
    down = true; moved = false; sx = e.clientX; sy = e.clientY; dx = dy = 0;
    el.setPointerCapture(e.pointerId); el.style.transition = 'none';
  });
  el.addEventListener('pointermove', e => {
    if (!down) return;
    dx = e.clientX - sx; dy = e.clientY - sy;
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) moved = true;
    el.style.transform = `translate(${dx}px, ${dy * .25}px) rotate(${dx / 16}deg)`; stamp(dx);
  });
  const up = cancel => {
    if (!down) return; down = false;
    if (!cancel && Math.abs(dx) > 90) { fly(dx > 0); return; }
    el.style.transition = 'transform .28s cubic-bezier(.3,1.4,.5,1)'; el.style.transform = ''; stamp(0);
    if (!cancel && !moved) flip();
  };
  el.addEventListener('pointerup', () => up(false));
  el.addEventListener('pointercancel', () => up(true));
}
function flip() { if (!sess || sess.done) return; sess.flipped = !sess.flipped; const c = $('#card'); if (c) c.classList.toggle('flipped', sess.flipped); }
function fly(ok) {
  const el = $('#card'); if (!el || busy) return;
  busy = true;
  const s = $(ok ? '.stamp.yes' : '.stamp.no', el); if (s) s.style.opacity = 1;
  el.style.transition = 'transform .32s ease-in, opacity .32s ease-in';
  el.style.transform = `translate(${ok ? '' : '-'}130vw, -30px) rotate(${ok ? 28 : -28}deg)`;
  el.style.opacity = '0';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  setTimeout(() => { busy = false; answer(ok); }, reduce ? 0 : 260);
}
function answer(ok) {
  const it = sess.queue[sess.i], c = S.cards[it.id];
  if (c) {
    const st = c.s[it.d], now = Date.now(), wasDue = st.due <= now;
    if (ok) {
      st.right++;
      // in shuffle mode, a right answer on a card that isn't due yet doesn't promote it
      if (!it.retry && (wasDue || sess.mode === 'due')) { st.box = Math.min(st.box + 1, INTERVALS.length - 1); st.due = now + INTERVALS[st.box]; }
    } else {
      st.wrong++; st.box = 0; st.due = now;
    }
    st.last = now;
    write('cards', c.id, stripId(c));
  }
  const k = today();
  S.stats.days[k] = (S.stats.days[k] || 0) + 1;
  S.stats.reviews++;
  const goalHit = S.stats.days[k] === S.stats.goal;
  let gain;
  if (ok) { sess.combo++; sess.right++; gain = (it.retry ? 4 : 10) + Math.min(sess.combo - 1, 10); }
  else {
    sess.combo = 0; sess.wrong++; gain = 1;
    sess.missed[it.id + it.d] = it;
    if (it.retry < 2) { // see it again a few cards later
      const at = Math.min(sess.queue.length, sess.i + 3 + Math.floor(Math.random() * 3));
      sess.queue.splice(at, 0, { id: it.id, d: it.d, retry: it.retry + 1 });
    }
  }
  sess.best = Math.max(sess.best, sess.combo);
  S.stats.bestCombo = Math.max(S.stats.bestCombo, sess.combo);
  const before = level(S.stats.xp);
  S.stats.xp += gain; sess.xp += gain;
  if (level(S.stats.xp) > before) toast('Level ' + level(S.stats.xp) + '!', 'gold');
  if (goalHit) { toast('Daily goal reached. Streak: ' + streak() + ' days', 'gold'); confetti(); }
  if (sess.combo === 10 || sess.combo === 25 || sess.combo === 50) toast(sess.combo + ' in a row!');
  saveStats();
  checkAch();
  renderHeader();
  sess.i++; sess.flipped = false;
  if (sess.i >= sess.queue.length) finishSession(); else renderSession();
}
function stripId(c) { const o = clone(c); delete o.id; return o; }
function finishSession() {
  if (!sess) return;
  sess.done = true;
  const firstTries = sess.queue.filter(q => !q.retry).length;
  if (sess.wrong === 0 && firstTries >= 10) S.stats.perfect = true;
  checkAch(); saveStats(true);
  renderSummary();
  const total = sess.right + sess.wrong;
  if (total && sess.right / total >= .8) confetti();
}
function renderSummary() {
  const total = sess.right + sess.wrong, acc = total ? Math.round(sess.right / total * 100) : 0;
  const missed = Object.values(sess.missed).filter(m => S.cards[m.id]);
  const L = level(S.stats.xp), lo = lvlFloor(L), hi = lvlFloor(L + 1);
  const l = curLang();
  const verdict = !total ? 'Session ended' : acc === 100 ? 'Flawless.' : acc >= 80 ? 'Strong session.' : acc >= 50 ? 'Getting there.' : 'Tough round. Those will come back soon.';
  $('#view').innerHTML = `<div class="stack summary">
    <h2>${verdict}</h2>
    <div class="big-stats">
      <div class="stat"><div class="v">${acc}%</div><div class="l">accuracy</div></div>
      <div class="stat"><div class="v">+${sess.xp}</div><div class="l">XP</div></div>
      <div class="stat"><div class="v">${sess.best}</div><div class="l">best combo</div></div>
    </div>
    <div class="panel lvl">
      <div class="top-row"><span><span class="eyebrow">Level</span><div class="n">${L}</div></span><span class="count">${S.stats.xp - lo} / ${hi - lo} XP</span></div>
      <div class="track blue"><i style="width:${(S.stats.xp - lo) / (hi - lo) * 100}%"></i></div>
      ${L > sess.startLevel ? `<span class="muted">You levelled up this session.</span>` : ''}
    </div>
    ${missed.length ? `<div class="panel"><h3>Missed this round</h3><div class="missed-list">${missed.map(m => { const c = S.cards[m.id]; const f = m.d === 'f'; return `<div><span>${esc(f ? c.en : c.tr)}</span><span>${esc(f ? c.tr : c.en)}</span></div>`; }).join('')}</div></div>` : ''}
    <div class="stack" style="gap:10px">
      ${missed.length ? `<button class="btn primary big" data-act="redo-missed">Drill the ${missed.length} I missed</button>` : ''}
      <button class="btn ${missed.length ? 'ghost' : 'primary'} big" data-act="again">Another round</button>
      <button class="btn ghost" data-act="done">Back to ${l ? esc(l.name) : 'deck'}</button>
    </div>
  </div>`;
}

// ---------- words ----------
function renderWords() {
  const v = $('#view'), l = curLang();
  if (!l) { v.innerHTML = welcomeHTML(); return; }
  if (!$('#wlist')) {
    v.innerHTML = `<div class="toolbar">
      <div class="row"><input class="input" id="wSearch" type="search" placeholder="Search ${esc(l.name)} or English" autocomplete="off"></div>
      <div class="row"><button class="btn primary" data-act="add-word" style="flex:1">Add word</button><button class="btn ghost" data-act="bulk" style="flex:1">Paste list</button><button class="btn ghost" data-act="import" style="flex:1">Spreadsheet</button></div>
      <div class="chips" id="wTags"></div>
    </div><div class="wlist" id="wlist"></div>`;
    $('#wSearch').value = wordQuery;
    $('#wSearch').addEventListener('input', e => { wordQuery = e.target.value; renderWordList(); });
  }
  renderWordList();
}
function renderWordList() {
  const tags = allTags(pref.lang);
  if (wordTag && !tags.some(([t]) => t === wordTag)) wordTag = '';
  $('#wTags').innerHTML = tags.length ? `<button class="chip" data-act="wtag" data-tag="" aria-pressed="${!wordTag}">All</button>` + tags.map(([t, k]) => `<button class="chip" data-act="wtag" data-tag="${esc(t)}" aria-pressed="${wordTag === t}">${esc(t)} <span class="n">${k}</span></button>`).join('') : '';
  const q = wordQuery.trim().toLowerCase();
  let cs = langCards(pref.lang);
  const total = cs.length;
  if (wordTag) cs = cs.filter(c => c.tags.includes(wordTag));
  if (q) cs = cs.filter(c => c.en.toLowerCase().includes(q) || c.tr.toLowerCase().includes(q) || c.note.toLowerCase().includes(q));
  cs.sort((a, b) => (b.created || 0) - (a.created || 0));
  const l = curLang();
  const bar = side => { const st = stage(side); const col = { new: 'var(--line)', learn: 'var(--miss)', fam: 'var(--gold)', mast: 'var(--hit)' }[st]; return `<span class="pips">${Array.from({ length: 4 }, (_, k) => `<i style="background:${k < Math.min(4, side.box + (st === 'new' ? 0 : 1)) ? col : 'var(--line)'}"></i>`).join('')}</span>`; };
  $('#wlist').innerHTML = !total ? `<div class="empty"><h2>No words yet</h2><p>Add words one at a time, or paste a list from your notes.</p></div>`
    : !cs.length ? `<div class="empty"><p>No words match.</p></div>`
    : `<div class="eyebrow">${cs.length} of ${total} words</div>` + cs.map(c => `<button class="wrow" data-act="edit-word" data-id="${c.id}">
      <span class="pair"><span class="tr">${esc(c.tr)}</span><span class="en">${esc(c.en)}</span></span>
      <span class="mast"><span class="m">EN→${esc(langCode(l.name))} ${bar(c.s.f)}</span><span class="m">${esc(langCode(l.name))}→EN ${bar(c.s.b)}</span></span>
      ${c.tags.length ? `<span class="tags">${c.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</span>` : ''}
    </button>`).join('');
}
function parseTags(s) { return [...new Set(String(s).split(/[,#]/).map(t => t.trim().toLowerCase()).filter(Boolean))]; }
function wordSheet(id) {
  const l = curLang(), c = id ? S.cards[id] : null;
  const tags = allTags(pref.lang).map(([t]) => t);
  openSheet(`<form id="wordForm" class="stack" style="gap:12px">
    <div class="sheet-head"><h3>${c ? 'Edit word' : 'Add a word'}</h3><button type="button" class="icon-btn" data-act="close" aria-label="Close"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
    <label>English<input class="input" id="fEn" required autocomplete="off" value="${esc(c ? c.en : '')}" placeholder="the dog"></label>
    <label>${esc(l.name)}<input class="input" id="fTr" required autocomplete="off" value="${esc(c ? c.tr : '')}" placeholder="${esc(l.name)} word or phrase"></label>
    <label>Tags<input class="input" id="fTags" autocomplete="off" value="${esc(c ? c.tags.join(', ') : (wordTag || ''))}" placeholder="animals, body parts"></label>
    ${tags.length ? `<div class="chips" id="tagSuggest">${tags.map(t => `<button type="button" class="chip" data-act="add-tag" data-tag="${esc(t)}">+ ${esc(t)}</button>`).join('')}</div>` : ''}
    <label>Note (optional)<input class="input" id="fNote" autocomplete="off" value="${esc(c ? c.note : '')}" placeholder="gender, example sentence, memory trick"></label>
    <div class="actions">
      ${c ? `<button type="button" class="btn danger" data-act="del-word" data-id="${c.id}">Delete</button>` : `<button type="submit" class="btn ghost" data-more="1">Save and add another</button>`}
      <button type="submit" class="btn primary">Save</button>
    </div>
    <div id="delConfirm"></div>
  </form>`, sheet => {
    const f = $('#wordForm', sheet);
    setTimeout(() => $('#fEn', sheet).focus(), 60);
    f.addEventListener('submit', e => {
      e.preventDefault();
      const en = $('#fEn', sheet).value.trim(), tr = $('#fTr', sheet).value.trim();
      if (!en || !tr) return;
      const tagsV = parseTags($('#fTags', sheet).value), note = $('#fNote', sheet).value.trim();
      if (c) {
        Object.assign(c, { en, tr, tags: tagsV, note });
        write('cards', c.id, stripId(c)); toast('Saved');
      } else {
        const dup = langCards(pref.lang).find(x => x.en.toLowerCase() === en.toLowerCase() && x.tr.toLowerCase() === tr.toLowerCase());
        if (dup) { toast('That word is already in your deck.'); return; }
        const nid = uid('c');
        S.cards[nid] = normCard({ lang: pref.lang, en, tr, tags: tagsV, note, created: Date.now() }, nid);
        write('cards', nid, stripId(S.cards[nid])); toast('Added ' + tr);
        checkAch();
      }
      const more = e.submitter && e.submitter.dataset.more;
      if (more) { $('#fEn', sheet).value = ''; $('#fTr', sheet).value = ''; $('#fNote', sheet).value = ''; $('#fEn', sheet).focus(); }
      else closeSheet();
      refreshBehind();
    });
  });
}
function bulkSheet() {
  const l = curLang();
  openSheet(`<form id="bulkForm" class="stack" style="gap:12px">
    <div class="sheet-head"><h3>Paste a list</h3><button type="button" class="icon-btn" data-act="close" aria-label="Close"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
    <p class="muted" style="margin:0">One word per line: English, then <b>=</b>, then ${esc(l.name)}. Add tags with #. A tab also works, so you can paste two columns from a spreadsheet.</p>
    <textarea class="input" id="bulkText" placeholder="the dog = el perro #animals&#10;the hand = la mano #body&#10;to eat = comer #food #verbs"></textarea>
    <label>Tags for every word (optional)<input class="input" id="bulkTags" autocomplete="off" placeholder="week 3"></label>
    <div class="actions"><button type="submit" class="btn primary" id="bulkGo" disabled>Add words</button></div>
  </form>`, sheet => {
    const parse = () => {
      const common = parseTags($('#bulkTags', sheet).value);
      return $('#bulkText', sheet).value.split('\n').map(line => {
        const tags = (line.match(/#[^#\t=]+/g) || []).map(t => t.slice(1).trim().toLowerCase()).filter(Boolean);
        const body = line.replace(/#[^#\t=]+/g, '').trim();
        const parts = body.includes('\t') ? body.split('\t') : body.split('=');
        if (parts.length < 2) return null;
        const en = parts[0].trim(), tr = parts.slice(1).join(' ').trim();
        return en && tr ? { en, tr, tags: [...new Set(tags.concat(common))] } : null;
      }).filter(Boolean);
    };
    const upd = () => { const n = parse().length; $('#bulkGo', sheet).disabled = !n; $('#bulkGo', sheet).textContent = n ? `Add ${n} word${n === 1 ? '' : 's'}` : 'Add words'; };
    $('#bulkText', sheet).addEventListener('input', upd); $('#bulkTags', sheet).addEventListener('input', upd);
    $('#bulkForm', sheet).addEventListener('submit', e => {
      e.preventDefault();
      const rows = parse(), existing = new Set(langCards(pref.lang).map(c => (c.en + '|' + c.tr).toLowerCase()));
      let added = 0, t0 = Date.now();
      rows.forEach((r, k) => {
        if (existing.has((r.en + '|' + r.tr).toLowerCase())) return;
        existing.add((r.en + '|' + r.tr).toLowerCase());
        const nid = uid('c');
        S.cards[nid] = normCard({ lang: pref.lang, ...r, note: '', created: t0 + k }, nid);
        write('cards', nid, stripId(S.cards[nid])); added++;
      });
      toast(added ? `Added ${added} word${added === 1 ? '' : 's'}` + (rows.length > added ? ` (${rows.length - added} already there)` : '') : 'All of those are already in your deck.');
      checkAch(); closeSheet(); refreshBehind();
    });
  });
}

// ---------- spreadsheet import ----------
const XICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const IMPORT_FIELDS = [
  { key: 'en', label: () => 'English', req: true, guess: /^(english|en|eng|word|words|term|front|question|prompt)$/i },
  { key: 'tr', label: () => (curLang() ? curLang().name : 'Translation'), req: true, guess: /^(translation|translated|meaning|back|answer|foreign|target|definition)$/i },
  { key: 'tags', label: () => 'Tags', guess: /^(tags?|categor(y|ies)|topics?|groups?|themes?|units?|lessons?|chapters?|sets?|decks?)$/i },
  { key: 'note', label: () => 'Note', guess: /^(notes?|examples?|comments?|hints?|gender|sentences?|context|usage)$/i },
  { key: 'lang', label: () => 'Language', guess: /^(language|lang)$/i },
];
let xlsxLoading = null;
function loadXLSX() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  return xlsxLoading || (xlsxLoading = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = 'vendor/xlsx.full.min.js';
    s.onload = () => res(window.XLSX); s.onerror = () => { xlsxLoading = null; s.remove(); rej(new Error('load')); };
    document.head.appendChild(s);
  }));
}
function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const first = text.split(/\r?\n/, 1)[0];
  const delim = ['\t', ';', ','].map(d => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; }
    else if (ch === '"' && f === '') q = true;
    else if (ch === delim) { row.push(f); f = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
    else f += ch;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows;
}
async function readSpreadsheet(file) {
  const clean = rows => rows.map(r => r.map(c => String(c ?? '').trim())).filter(r => r.some(Boolean));
  if (/\.(csv|tsv|txt)$/i.test(file.name) || /^text\//.test(file.type)) return [{ name: file.name, rows: clean(parseCSV(await file.text())) }];
  const X = await loadXLSX();
  const wb = X.read(await file.arrayBuffer(), { type: 'array' });
  return wb.SheetNames.map(n => ({ name: n, rows: clean(X.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: false, defval: '', blankrows: false })) })).filter(s => s.rows.length);
}
const colLetter = i => (i >= 26 ? colLetter(Math.floor(i / 26) - 1) : '') + String.fromCharCode(65 + i % 26);
function isTrHeader(h) {
  const l = curLang(), x = h.trim().toLowerCase();
  return (l && x === l.name.toLowerCase()) || !!VOICES[x] || IMPORT_FIELDS[1].guess.test(x);
}
function looksLikeHeader(row) { return row.some(h => isTrHeader(h) || IMPORT_FIELDS.some(f => f.guess.test(h.trim()))); }
function guessMapping(header, width) {
  const map = { en: -1, tr: -1, tags: -1, note: -1, lang: -1 }, used = new Set();
  const take = (k, i) => { if (i >= 0 && !used.has(i) && map[k] < 0) { map[k] = i; used.add(i); } };
  if (header) {
    const saved = pref.importMap || {};
    for (const k in map) if (saved[k]) take(k, header.findIndex(h => h.toLowerCase() === saved[k].toLowerCase()));
    for (const f of IMPORT_FIELDS) take(f.key, header.findIndex((h, i) => !used.has(i) && f.guess.test(h.trim())));
    take('tr', header.findIndex((h, i) => !used.has(i) && isTrHeader(h)));
  }
  for (const k of ['en', 'tr']) if (map[k] < 0) take(k, [...Array(width).keys()].find(i => !used.has(i)) ?? -1);
  return map;
}
function ensureLang(name) {
  const hit = Object.entries(S.langs).find(([, l]) => l.name.toLowerCase() === name.toLowerCase());
  if (hit) return hit[0];
  const id = uid('l');
  S.langs[id] = { name, color: LANG_COLORS[Object.keys(S.langs).length % LANG_COLORS.length], created: Date.now() };
  return id;
}
function importSheet() {
  let sheets = null, si = 0, hasHeader = true, map = null;
  openSheet(`<div class="stack" style="gap:12px" id="imp">
    <div class="sheet-head"><h3>Import a spreadsheet</h3><button type="button" class="icon-btn" data-act="close" aria-label="Close">${XICON}</button></div>
    <div id="impBody"></div>
  </div>`, sheet => {
    const body = $('#impBody', sheet);
    const pick = () => {
      body.innerHTML = `<div class="stack" style="gap:12px">
        <p class="muted" style="margin:0">Choose an Excel (.xlsx) or CSV file. You'll pick which column is English, which is ${esc(IMPORT_FIELDS[1].label())}, and so on.</p>
        <label class="btn primary big" for="impFile">Choose a file</label>
        <input type="file" id="impFile" accept=".csv,.tsv,.txt,.xlsx,.xls,.xlsm,.ods,.numbers,text/csv,text/tab-separated-values" hidden>
        <p class="muted" style="margin:0;font-size:13px">From Google Sheets: File → Download → Microsoft Excel or CSV. From Numbers: Share → Export → Excel or CSV. Save the file to Files, then choose it here.</p>
      </div>`;
      $('#impFile', body).addEventListener('change', async e => {
        const file = e.target.files[0]; if (!file) return;
        body.innerHTML = '<p class="muted">Reading ' + esc(file.name) + '…</p>';
        try { sheets = await readSpreadsheet(file); }
        catch (err) {
          pick();
          toast(err && err.message === 'load' ? 'Connect to the internet once to import Excel files. CSV works offline.' : 'Couldn\'t read that file. Save it as .xlsx or .csv and try again.');
          return;
        }
        if (!sheets.length) { pick(); toast('That file looks empty.'); return; }
        sheets.fileName = file.name; si = 0; setSheet(); draw();
      });
    };
    const rows = () => sheets[si].rows;
    const width = () => Math.max(...rows().slice(0, 50).map(r => r.length));
    const setSheet = () => { hasHeader = looksLikeHeader(rows()[0]); map = guessMapping(hasHeader ? rows()[0] : null, width()); };
    const dataRows = () => rows().slice(hasHeader ? 1 : 0);
    const cell = (r, k) => map[k] >= 0 ? (r[map[k]] || '').trim() : '';
    const plan = () => {
      const common = parseTags($('#impTags', body) ? $('#impTags', body).value : '');
      const existing = new Set(Object.values(S.cards).map(c => (c.lang + '|' + c.en + '|' + c.tr).toLowerCase()));
      const langIds = Object.fromEntries(Object.entries(S.langs).map(([id, l]) => [l.name.toLowerCase(), id]));
      const out = { rows: [], missing: 0, dupes: 0, newLangs: new Set() };
      for (const r of dataRows()) {
        const en = cell(r, 'en'), tr = cell(r, 'tr');
        if (!en || !tr) { out.missing++; continue; }
        const ln = cell(r, 'lang');
        const lkey = ln ? (langIds[ln.toLowerCase()] || 'new:' + ln.toLowerCase()) : pref.lang;
        if (ln && !langIds[ln.toLowerCase()]) out.newLangs.add(ln);
        const key = (lkey + '|' + en + '|' + tr).toLowerCase();
        if (existing.has(key)) { out.dupes++; continue; }
        existing.add(key);
        out.rows.push({ en, tr, ln, note: cell(r, 'note'), tags: [...new Set(parseTags(cell(r, 'tags').replace(/[;|]/g, ',')).concat(common))] });
      }
      return out;
    };
    const colName = i => {
      const h = hasHeader ? rows()[0][i] : '';
      const sample = (dataRows().find(r => r[i]) || [])[i] || '';
      return colLetter(i) + ': ' + (h || (sample ? '"' + (sample.length > 18 ? sample.slice(0, 18) + '…' : sample) + '"' : 'empty'));
    };
    const draw = () => {
      const w = width(), l = curLang();
      const opts = k => `<option value="-1">${IMPORT_FIELDS.find(f => f.key === k).req ? 'Choose a column' : 'Not used'}</option>` + [...Array(w).keys()].map(i => `<option value="${i}"${map[k] === i ? ' selected' : ''}>${esc(colName(i))}</option>`).join('');
      body.innerHTML = `<div class="stack" style="gap:14px">
        <div class="file-row"><span class="muted">${esc(sheets.fileName)}</span><button type="button" class="linkish" id="impAgain">Choose a different file</button></div>
        ${sheets.length > 1 ? `<label>Sheet<select class="input" id="impSheet">${sheets.map((s, i) => `<option value="${i}"${i === si ? ' selected' : ''}>${esc(s.name)} (${s.rows.length} rows)</option>`).join('')}</select></label>` : ''}
        <label class="check"><input type="checkbox" id="impHeader"${hasHeader ? ' checked' : ''}> First row is column names</label>
        <div class="map-grid">
          <span class="eyebrow">Field</span><span class="eyebrow">Column in your file</span>
          ${IMPORT_FIELDS.map(f => `<span class="map-label">${esc(f.label())}${f.req ? ' <b class="req">*</b>' : ''}</span><select class="input" data-map="${f.key}" aria-label="${esc(f.label())} column">${opts(f.key)}</select>`).join('')}
        </div>
        <p class="muted" style="margin:0;font-size:13px">${map.lang >= 0 ? 'Each row goes into the language named in that column. New languages are created for you.' : `Words go into <b>${esc(l ? l.name : 'a new deck')}</b>. Map a Language column to import several languages at once.`} Separate multiple tags in one cell with commas.</p>
        <label>Tags for every word (optional)<input class="input" id="impTags" autocomplete="off" placeholder="e.g. textbook ch 1"></label>
        <div id="impPreview"></div>
        <button type="button" class="btn primary big" id="impGo">Import</button>
      </div>`;
      $('#impAgain', body).addEventListener('click', pick);
      const sel = $('#impSheet', body); if (sel) sel.addEventListener('change', e => { si = +e.target.value; setSheet(); draw(); });
      $('#impHeader', body).addEventListener('change', e => { hasHeader = e.target.checked; map = guessMapping(hasHeader ? rows()[0] : null, width()); draw(); });
      $$('[data-map]', body).forEach(s => s.addEventListener('change', e => {
        const k = e.target.dataset.map, v = +e.target.value;
        for (const other in map) if (other !== k && map[other] === v && v >= 0) map[other] = -1; // a column feeds one field
        map[k] = v; draw();
      }));
      $('#impTags', body).addEventListener('input', preview);
      $('#impGo', body).addEventListener('click', run);
      preview();
    };
    const preview = () => {
      const p = plan(), go = $('#impGo', body), l = curLang();
      const ready = map.en >= 0 && map.tr >= 0 && (map.lang >= 0 || l);
      const cols = IMPORT_FIELDS.filter(f => map[f.key] >= 0 || (f.key === 'tags' && p.rows.some(r => r.tags.length)));
      $('#impPreview', body).innerHTML = !ready ? `<p class="impwarn">${!l && map.lang < 0 ? 'Add a language first, or map a Language column.' : 'Choose which columns hold English and ' + esc(IMPORT_FIELDS[1].label()) + '.'}</p>`
        : `<div class="eyebrow" style="margin-bottom:6px">Preview</div>
        <div class="preview-wrap"><table class="preview"><thead><tr>${cols.map(f => `<th>${esc(f.label())}</th>`).join('')}</tr></thead>
        <tbody>${p.rows.slice(0, 5).map(r => `<tr>${cols.map(f => `<td>${esc(f.key === 'tags' ? r.tags.join(', ') : f.key === 'lang' ? r.ln : r[f.key])}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${cols.length}">No rows to import.</td></tr>`}</tbody></table></div>
        <p class="muted" style="margin:8px 0 0;font-size:13px"><b>${p.rows.length}</b> word${p.rows.length === 1 ? '' : 's'} ready${p.dupes ? ` · ${p.dupes} already in your decks` : ''}${p.missing ? ` · ${p.missing} skipped (no English or ${esc(IMPORT_FIELDS[1].label())})` : ''}${p.newLangs.size ? ` · new language${p.newLangs.size > 1 ? 's' : ''}: ${esc([...p.newLangs].join(', '))}` : ''}</p>`;
      go.disabled = !ready || !p.rows.length;
      go.textContent = ready && p.rows.length ? `Import ${p.rows.length} word${p.rows.length === 1 ? '' : 's'}` : 'Import';
    };
    const run = () => {
      const p = plan(); if (!p.rows.length) return;
      const t0 = Date.now(); let firstLang = null;
      p.rows.forEach((r, k) => {
        const lang = r.ln ? ensureLang(r.ln) : pref.lang;
        firstLang = firstLang || lang;
        const nid = uid('c');
        S.cards[nid] = normCard({ lang, en: r.en, tr: r.tr, tags: r.tags, note: r.note, created: t0 + k }, nid);
      });
      if (hasHeader) { const h = rows()[0], m = {}; for (const k in map) if (map[k] >= 0 && h[map[k]]) m[k] = h[map[k]]; pref.importMap = m; }
      if (!S.langs[pref.lang]) pref.lang = firstLang;
      savePref(); saveLocal(); checkAch(); closeSheet();
      $('#view').innerHTML = ''; render();
      toast(`Imported ${p.rows.length} word${p.rows.length === 1 ? '' : 's'}`);
    };
    pick();
  });
}

// ---------- languages ----------
function langSheet() {
  const ids = Object.keys(S.langs).sort((a, b) => (S.langs[a].created || 0) - (S.langs[b].created || 0));
  openSheet(`<div class="stack" style="gap:10px">
    <div class="sheet-head"><h3>Your languages</h3><button type="button" class="icon-btn" data-act="close" aria-label="Close"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
    ${ids.map(id => { const l = S.langs[id], n = langCards(id).length; return `<div class="lang-item${id === pref.lang ? ' current' : ''}" id="li-${id}">
      <button class="pick" data-act="pick-lang" data-id="${id}"><span class="badge" style="--bc:${langColor(l)}">${esc(langCode(l.name))}</span><span><b>${esc(l.name)}</b><small>${n} word${n === 1 ? '' : 's'}</small></span></button>
      <button class="icon-btn" data-act="edit-lang" data-id="${id}" aria-label="Rename or delete ${esc(l.name)}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>
    </div><div id="le-${id}"></div>`; }).join('')}
    <form id="newLang" class="stack" style="gap:8px;margin-top:8px">
      <span class="eyebrow">Add a language</span>
      <div class="toolbar row" style="position:static;padding:0"><input class="input" id="newLangName" placeholder="Language name" autocomplete="off" required><button class="btn primary">Add</button></div>
      <div class="chips">${SUGGEST.filter(s => !ids.some(id => S.langs[id].name.toLowerCase() === s.toLowerCase())).map(s => `<button type="button" class="chip" data-act="fill-lang" data-name="${esc(s)}">${esc(s)}</button>`).join('')}</div>
    </form>
  </div>`, sheet => {
    $('#newLang', sheet).addEventListener('submit', e => { e.preventDefault(); addLang($('#newLangName', sheet).value); closeSheet(); });
  });
}
function addLang(name) {
  name = String(name || '').trim(); if (!name) return;
  const existing = Object.entries(S.langs).find(([, l]) => l.name.toLowerCase() === name.toLowerCase());
  if (existing) { pref.lang = existing[0]; }
  else {
    const id = uid('l'), n = Object.keys(S.langs).length;
    S.langs[id] = { name, color: LANG_COLORS[n % LANG_COLORS.length], created: Date.now() };
    write('languages', id, S.langs[id]); pref.lang = id;
  }
  pref.tags = []; wordTag = ''; savePref(); sess = null;
  $('#view').innerHTML = ''; render();
}
function editLang(id) {
  const box = $('#le-' + id); if (!box) return;
  if (box.innerHTML) { box.innerHTML = ''; return; }
  const l = S.langs[id], n = langCards(id).length;
  box.innerHTML = `<form class="stack" style="gap:8px;padding:4px 0 8px" data-lang-form="${id}">
    <div class="toolbar row" style="position:static;padding:0"><input class="input" value="${esc(l.name)}" name="nm" required autocomplete="off" aria-label="Language name"><button class="btn primary">Rename</button></div>
    <div class="confirm"><span>Delete ${esc(l.name)} and its ${n} word${n === 1 ? '' : 's'}? This can't be undone.</span><button type="button" class="btn danger" data-act="del-lang" data-id="${id}" style="background:var(--miss);color:var(--paper)">Delete</button></div>
  </form>`;
  $('form', box).addEventListener('submit', e => {
    e.preventDefault(); const nm = e.target.nm.value.trim(); if (!nm) return;
    S.langs[id].name = nm; write('languages', id, S.langs[id]); closeSheet(); render();
  });
}
function deleteLang(id) {
  langCards(id).forEach(c => { delete S.cards[c.id]; write('cards', c.id, null); });
  delete S.langs[id]; write('languages', id, null);
  if (pref.lang === id) pref.lang = Object.keys(S.langs)[0] || null;
  pref.tags = []; savePref(); sess = null; closeSheet(); $('#view').innerHTML = ''; render(); toast('Deleted');
}

// ---------- progress ----------
function renderProgress() {
  const L = level(S.stats.xp), lo = lvlFloor(L), hi = lvlFloor(L + 1);
  const td = dayCount(today()), goal = S.stats.goal, st = streak();
  const R = 26, C = 2 * Math.PI * R, pct = Math.min(1, td / goal);
  // 12-week activity grid, Monday-first columns ending with this week
  const end = new Date(); end.setHours(0, 0, 0, 0);
  const start = new Date(end); start.setDate(start.getDate() - ((start.getDay() + 6) % 7) - 7 * 11);
  let cells = '';
  for (let d = new Date(start), k = 0; k < 84; k++, d.setDate(d.getDate() + 1)) {
    const key = today(d), n = dayCount(key), fut = d > end;
    const lv = fut ? 'future' : n === 0 ? '' : n < goal / 2 ? 'l1' : n < goal ? 'l2' : 'l3';
    cells += `<i class="${lv}${key === today() ? ' today' : ''}" title="${key}: ${n} cards"></i>`;
  }
  const langs = Object.entries(S.langs).sort((a, b) => (a[1].created || 0) - (b[1].created || 0));
  const langRows = langs.map(([id, l]) => {
    const cnt = { new: 0, learn: 0, fam: 0, mast: 0 }; const cs = langCards(id);
    cs.forEach(c => { cnt[stage(c.s.f)]++; cnt[stage(c.s.b)]++; });
    const tot = cs.length * 2 || 1;
    return `<div class="lang-prog"><div class="hd"><b>${esc(l.name)}</b><span class="count">${cs.length} words · ${Math.round(cnt.mast / tot * 100)}% mastered</span></div>
      <div class="stackbar">${['mast', 'fam', 'learn', 'new'].map(k => `<i class="c-${k}" style="width:${cnt[k] / tot * 100}%"></i>`).join('')}</div></div>`;
  }).join('');
  const l = curLang();
  const tricky = l ? langCards(pref.lang).flatMap(c => ['f', 'b'].map(d => ({ c, d, s: c.s[d] })))
    .filter(x => x.s.wrong > 0).sort((a, b) => b.s.wrong / (b.s.right + b.s.wrong) - a.s.wrong / (a.s.right + a.s.wrong) || b.s.wrong - a.s.wrong).slice(0, 6) : [];
  $('#view').innerHTML = `<div class="stack">
    <div class="panel lvl">
      <div class="top-row"><span><span class="eyebrow">Level</span><div class="n">${L}</div></span><span class="count">${S.stats.xp.toLocaleString()} XP total</span></div>
      <div class="track blue"><i style="width:${(S.stats.xp - lo) / (hi - lo) * 100}%"></i></div>
      <span class="muted" style="font-size:13px">${hi - S.stats.xp} XP to level ${L + 1}. Right answers earn 10 XP plus a combo bonus.</span>
    </div>
    <div class="two">
      <div class="panel"><span class="eyebrow">Streak</span><div class="bignum" style="margin-top:8px">${st}</div><span class="muted" style="font-size:13px">day${st === 1 ? '' : 's'} · best ${Math.max(S.stats.bestStreak || 0, st)}</span></div>
      <div class="panel"><span class="eyebrow">Today</span>
        <div class="ring-wrap" style="margin-top:6px">
          <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="${R}" fill="none" stroke="var(--desk-2)" stroke-width="7"/><circle cx="32" cy="32" r="${R}" fill="none" stroke="var(--gold)" stroke-width="7" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct)}" transform="rotate(-90 32 32)"/></svg>
          <span><span class="bignum" style="font-size:22px">${td}</span><span class="muted">/${goal}</span></span>
        </div>
      </div>
    </div>
    <div class="field"><span class="eyebrow">Daily goal (cards)</span><div class="seg">${[10, 20, 30, 50].map(g => `<button data-act="goal" data-val="${g}" aria-pressed="${g === goal}">${g}</button>`).join('')}</div></div>
    <div class="panel"><h3>Last 12 weeks</h3><div class="heat">${cells}</div></div>
    ${langs.length ? `<div class="panel"><h3>Mastery by language</h3><p class="muted" style="margin:4px 0 0;font-size:13px">Each word counts twice, once per direction.</p>${langRows}
      <div class="legend"><span><i class="c-mast"></i>Mastered</span><span><i class="c-fam"></i>Familiar</span><span><i class="c-learn"></i>Learning</span><span><i class="c-new"></i>New</span></div></div>` : ''}
    ${tricky.length ? `<div class="panel"><h3>Trickiest ${esc(l.name)} words</h3><div class="tricky">${tricky.map(x => `<div><span>${esc(x.d === 'f' ? x.c.en + ' → ' + x.c.tr : x.c.tr + ' → ' + x.c.en)}</span><span class="pct">${x.s.wrong}/${x.s.right + x.s.wrong} missed</span></div>`).join('')}</div></div>` : ''}
    <div class="panel"><h3>Backup</h3><p class="muted" style="margin:4px 0 12px;font-size:13px">Your words are saved on this device only. Save a backup file now and then (to Files or iCloud Drive) so you can restore them on a new phone.</p>
      <div class="chips"><button class="btn primary" data-act="export">Save backup</button><label class="btn ghost" for="importFile">Restore from backup</label><input type="file" id="importFile" accept="application/json,.json" hidden></div></div>
    <div><h3 style="margin-bottom:10px">Achievements <span class="count">${Object.keys(S.stats.ach).length}/${ACH.length}</span></h3>
      <div class="ach-grid">${ACH.map(a => `<div class="ach${S.stats.ach[a.id] ? ' on' : ''}"><b>${esc(a.name)}</b><span>${esc(a.desc)}</span></div>`).join('')}</div></div>
  </div>`;
}

// ---------- sheets, toasts, confetti ----------
function openSheet(html, mount) {
  closeSheet();
  const scrim = document.createElement('div'); scrim.className = 'scrim'; scrim.id = 'scrim';
  scrim.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
  scrim.addEventListener('click', e => { if (e.target === scrim) closeSheet(); });
  document.body.appendChild(scrim);
  mount && mount($('.sheet', scrim));
}
function closeSheet() { const s = $('#scrim'); if (s) s.remove(); }
function refreshBehind() { if (view === 'words') renderWordList(); else if (!sess) render(); }
function toast(msg, kind) {
  const t = document.createElement('div'); t.className = 'toast' + (kind ? ' ' + kind : ''); t.textContent = msg;
  $('#toasts').appendChild(t); setTimeout(() => t.remove(), 2600);
}
function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cv = $('#confetti'), ctx = cv.getContext('2d'); cv.hidden = false;
  const W = cv.width = innerWidth * devicePixelRatio, H = cv.height = innerHeight * devicePixelRatio;
  const cols = ['#e3a21a', '#22885a', '#2c50c4', '#d0414a', '#9333ea'];
  const ps = Array.from({ length: 110 }, () => ({ x: W / 2 + (Math.random() - .5) * W * .3, y: H * .35, vx: (Math.random() - .5) * 18 * devicePixelRatio, vy: (-Math.random() * 16 - 6) * devicePixelRatio, r: Math.random() * 6 + 4, a: Math.random() * 6, va: (Math.random() - .5) * .4, c: cols[Math.floor(Math.random() * cols.length)] }));
  let f = 0;
  (function step() {
    ctx.clearRect(0, 0, W, H);
    ps.forEach(p => { p.vy += .55 * devicePixelRatio; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.a += p.va; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c; ctx.fillRect(-p.r, -p.r / 2, p.r * 2 * devicePixelRatio / 1.5, p.r * devicePixelRatio / 1.5); ctx.restore(); });
    if (++f < 110) requestAnimationFrame(step); else { ctx.clearRect(0, 0, W, H); cv.hidden = true; }
  })();
}
function speak(text) {
  try {
    const l = curLang(), v = voiceFor(l && l.name); if (!v) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text); u.lang = v; u.rate = .9; speechSynthesis.speak(u);
  } catch (e) {}
}

// ---------- events ----------
document.addEventListener('click', e => {
  const tab = e.target.closest('[data-tab]');
  if (tab) { setTab(tab.dataset.tab); return; }
  const p = e.target.closest('[data-pref]');
  if (p) { const k = p.dataset.pref; pref[k] = k === 'size' ? +p.dataset.val : p.dataset.val; savePref(); renderPractice(); return; }
  const a = e.target.closest('[data-act]'); if (!a) return;
  const act = a.dataset.act;
  switch (act) {
    case 'langs': if (S.ready) langSheet(); break;
    case 'close': closeSheet(); break;
    case 'fill-lang': { const inp = $('#newLangName') || $('#firstLangName'); if (inp) { inp.value = a.dataset.name; inp.focus(); } break; }
    case 'pick-lang': pref.lang = a.dataset.id; pref.tags = []; wordTag = ''; savePref(); sess = null; closeSheet(); $('#view').innerHTML = ''; render(); break;
    case 'edit-lang': editLang(a.dataset.id); break;
    case 'del-lang': deleteLang(a.dataset.id); break;
    case 'tag-all': pref.tags = []; savePref(); renderPractice(); break;
    case 'tag': { const t = a.dataset.tag; pref.tags = pref.tags.includes(t) ? pref.tags.filter(x => x !== t) : pref.tags.concat(t); savePref(); renderPractice(); break; }
    case 'start': startSession(buildQueue()); break;
    case 'shuffle-instead': pref.mode = 'shuffle'; savePref(); startSession(buildQueue()); break;
    case 'flip': flip(); break;
    case 'hit': fly(true); break;
    case 'miss': fly(false); break;
    case 'speak': e.stopPropagation(); speak(a.dataset.text); break;
    case 'end': if (sess.right + sess.wrong) finishSession(); else { sess = null; render(); } break;
    case 'again': sess = null; startSession(buildQueue()); break;
    case 'redo-missed': { const q = Object.values(sess.missed).filter(m => S.cards[m.id]).map(m => ({ id: m.id, d: m.d, retry: 0 })).sort(() => Math.random() - .5); sess = null; startSession(q); break; }
    case 'done': sess = null; render(); break;
    case 'add-word': wordSheet(null); break;
    case 'edit-word': wordSheet(a.dataset.id); break;
    case 'bulk': bulkSheet(); break;
    case 'import': importSheet(); break;
    case 'add-tag': { const inp = $('#fTags'); const cur = parseTags(inp.value); if (!cur.includes(a.dataset.tag)) inp.value = cur.concat(a.dataset.tag).join(', '); break; }
    case 'del-word': {
      const box = $('#delConfirm'); const id = a.dataset.id;
      box.innerHTML = `<div class="confirm"><span>Delete this word and its progress?</span><button type="button" class="btn danger" data-act="del-word-yes" data-id="${id}" style="background:var(--miss);color:var(--paper)">Delete</button></div>`;
      break;
    }
    case 'del-word-yes': { const id = a.dataset.id; delete S.cards[id]; write('cards', id, null); closeSheet(); refreshBehind(); toast('Deleted'); break; }
    case 'wtag': wordTag = a.dataset.tag; renderWordList(); break;
    case 'export': exportBackup(); break;
    case 'examples': loadExamples(); break;
    case 'goal': S.stats.goal = +a.dataset.val; saveStats(); renderProgress(); renderHeader(); break;
  }
});
document.addEventListener('change', e => {
  if (e.target.id === 'importFile' && e.target.files[0]) { importBackup(e.target.files[0]); e.target.value = ''; }
});
document.addEventListener('submit', e => {
  if (e.target.id === 'firstLang') { e.preventDefault(); addLang($('#firstLangName').value); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $('#scrim')) { closeSheet(); return; }
  if (!sess || sess.done || $('#scrim') || /INPUT|TEXTAREA/.test(e.target.tagName)) return;
  if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); }
  else if (e.key === 'ArrowRight') fly(true);
  else if (e.key === 'ArrowLeft') fly(false);
});

initStore();
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('service-worker.js').catch(() => {}));
}
})();
