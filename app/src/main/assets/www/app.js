'use strict';
/* בזמן – screens. Data comes from the phone (window.Android). */

const B = window.Android;
let S = null;            // state from the phone
let TAB = 'today';
let MODAL = null;        // {render, data}
let OB = { step: 1 };    // onboarding draft
let tickTimer = null;

const DAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
const DAYS_LONG = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

// ---------- helpers ----------
const $ = sel => document.querySelector(sel);
const pad = n => String(n).padStart(2, '0');
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const occOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const mins = s => { const m = /^(\d{1,2}):(\d{2})$/.exec(s || ''); return m ? (+m[1]) * 60 + (+m[2]) : -1; };
const at = (occ, m) => { const [y, mo, d] = occ.split('-').map(Number); return new Date(y, mo - 1, d, 0, m).getTime(); };
const tHM = t => { const d = new Date(t); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
const uid = p => p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const alive = it => it && !it.del;
const item = id => (S && alive(S.items[id])) ? S.items[id] : null;
const list = kind => Object.values(S.items).filter(i => alive(i) && i.kind === kind);
const isChild = () => S.me.role === 'child';
const dayAdd = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const fmtCode = c => (c || '').replace(/(.{5})(?=.)/g, '$1-');

// ---------- task categories (chosen by the parent when adding a task) ----------
const CATS = {
  school: { e: '📚', n: 'בית ספר', c: '#2f6fed' },
  class:  { e: '🎨', n: 'חוגים', c: '#e94f8a' },
  home:   { e: '🏠', n: 'משימות בית', c: '#1fa971' },
  self:   { e: '🪥', n: 'שגרה ובריאות', c: '#0ea5b7' },
  other:  { e: '⭐', n: 'אחר', c: '#8d88a8' },
};
const CAT_ORDER = ['school', 'class', 'home', 'self', 'other'];
const catOf = t => (t && CATS[t.cat]) ? t.cat : '';
function catChip(t) {
  const k = catOf(t);
  if (!k) return '';
  return ` <span class="cat" style="--cc:${CATS[k].c}">${CATS[k].e} ${CATS[k].n}</span>`;
}
/** A first guess from the words of the task (the parent can always pick another). */
function guessCat(title) {
  const t = ' ' + String(title || '') + ' ';
  if (/שיעורי|שעורי|מבחן|בוחן|מחברת|ספר |לקרוא|קריאה|כתיבה|חשבון|מתמטיקה|אנגלית|תורה|עבודה ל|פרויקט|בית ספר|בית הספר|כיתה|מורה|ילקוט|תיק /.test(t)) return 'school';
  if (/חוג|אימון|ריקוד|כדורגל|כדורסל|שחייה|שחיה|גיטרה|פסנתר|נגינה|ציור|קרטה|ג׳ודו|ג'ודו|התעמלות|תיאטרון|צופים|תנועה/.test(t)) return 'class';
  if (/לסדר|לנקות|כלים|זבל|כביסה|מיטה|חדר|שולחן|לערוך|לשטוף|לקפל|צעצועים|כלב|חתול|להאכיל|לטאטא|קניות/.test(t)) return 'home';
  if (/שיניים|מקלחת|להתקלח|לישון|תרופה|ויטמין|לאכול|ארוחת|ספורט|הליכה|להתלבש|פיג׳מה|פיג'מה/.test(t)) return 'self';
  return '';
}
/** Sets one of the kids' designs on the page (see themes.js). */
function setTheme(id) {
  id = themeOf(id);
  const t = THEMES[id], b = document.body;
  b.dataset.theme = id;
  b.classList.toggle('dark', !!t.dark);
  b.classList.toggle('ybish', !!t.yb);
  b.classList.toggle('chunky', ['quest', 'questyb', 'pet', 'map', 'league'].indexOf(id) >= 0);
}

function occursOn(it, d) {
  if (it.date) return it.date === occOf(d);
  return Array.isArray(it.days) && it.days.indexOf(d.getDay()) >= 0;
}
// ---------- several children ----------
let KID = null;
function kidId(name) {
  const n = String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();
  let h = 0x811c9dc5;
  for (let i = 0; i < n.length; i++) { h ^= n.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return 'k_' + (h >>> 0).toString(16).padStart(8, '0');
}
const memberKid = m => m.kid || kidId(m.name);
function kids() {
  const by = {};
  list('member').filter(m => m.role === 'child').forEach(m => {
    const k = memberKid(m);
    const cur = by[k];
    const since = m.since || 0;
    if (!cur) by[k] = { kid: k, name: m.name, gender: m.gender || 'f', theme: m.theme || 'purple', since, upd: m.upd || 0 };
    else {
      cur.since = Math.min(cur.since, since);
      if ((m.upd || 0) > cur.upd) Object.assign(cur, { name: m.name, gender: m.gender || 'f', theme: m.theme || 'purple', upd: m.upd || 0 });
    }
  });
  Object.values(by).forEach(k => {
    const kt = item('kt:' + k.kid);
    if (kt && kt.theme && (kt.upd || 0) > k.upd) k.theme = kt.theme;
  });
  return Object.values(by).sort((a, b) => a.since - b.since);
}
const legacyKid = () => { const k = kids(); return k.length ? k[0].kid : null; };
const kidOf = it => (it && it.kid) || legacyKid();
const mine = kind => list(kind).filter(i => kidOf(i) === KID);
function pickKid() {
  if (isChild()) { KID = S.me.kid || kidId(S.me.name); return; }
  const ks = kids();
  if (!KID) { try { KID = localStorage.getItem('bz-kid'); } catch (e) {} }
  if (!ks.some(k => k.kid === KID)) KID = ks.length ? ks[0].kid : null;
}
function kidInfo() {
  const k = kids().find(x => x.kid === KID);
  if (k) return k;
  if (isChild()) return { kid: KID, name: S.me.name, gender: S.me.gender || 'f', theme: S.me.theme || 'purple' };
  return { kid: null, name: 'הילד/ה', gender: 'f', theme: 'purple' };
}
const kidName = () => kidInfo().name;
/** Hebrew text by the child's gender: G('קמה', 'קם') */
const G = (f, m) => kidInfo().gender === 'm' ? m : f;
function score() {
  const s = item('score:' + KID) || (KID && KID === legacyKid() ? item('score') : null);
  return { pts: s ? s.pts || 0 : 0, streak: s ? s.streak || 0 : 0 };
}
function dur(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 60) return m + ' דק׳';
  const h = Math.floor(m / 60), r = m % 60;
  return h + ' שע׳' + (r ? ' ' + r + ' דק׳' : '');
}
function daysText(it) {
  if (it.date) {
    const d = new Date(at(it.date, 0));
    const t = occOf(new Date()), tm = occOf(dayAdd(new Date(), 1));
    if (it.date === t) return 'היום';
    if (it.date === tm) return 'מחר';
    return 'יום ' + DAYS_LONG[d.getDay()] + ' ' + d.getDate() + '/' + (d.getMonth() + 1);
  }
  const ds = (it.days || []).slice().sort();
  if (ds.length === 7) return 'כל יום';
  if (ds.join() === '0,1,2,3,4') return 'א׳–ה׳';
  if (ds.join() === '0,1,2,3,4,5') return 'א׳–ו׳';
  return ds.map(i => DAYS[i]).join(' ');
}

function load() {
  try { S = JSON.parse(B.state()); } catch (e) { S = { items: {}, me: {} }; }
  render();
  if (S.celebrate) celebrate();
}
window.onPhotoSent = () => { load(); toast('התמונה נשלחה להורים לאישור 📷'); };
window.onNative = () => {
  if (!MODAL) load();
  else {
    try { S = JSON.parse(B.state()); if (S.celebrate) celebrate(); } catch (e) {}
    // the app lock closed: never leave a parent screen open behind it
    if (S && S.me && S.me.role !== 'child' && S.me.session === false) { MODAL = null; $('#modal-root').innerHTML = ''; render(); }
  }
};
window.onBack = () => {
  if (MODAL) { closeModal(); return true; }
  if (S && TAB === 'calendar' && CAL && CAL.day) { CAL.day = null; render(); return true; }
  if (S && S.me.role && TAB !== 'today') { TAB = 'today'; render(); return true; }
  return false;
};

const PER_KID = ['alarm', 'event', 'task', 'reward', 'redeem', 'log', 'off'];
function save(items) {
  items = Array.isArray(items) ? items : [items];
  items.forEach(it => {
    if (PER_KID.indexOf(it.kind) < 0 || it.kid) return;
    const old = S.items[it.id];
    // an existing item keeps its child (old items without "kid" belong to the first child)
    const k = old ? kidOf(old) : KID;
    if (k) it.kid = k;
  });
  S = JSON.parse(B.upsert(JSON.stringify(items)));
  render();
}

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2400);
}
function confetti() {
  const fx = $('#fx');
  const e = ['⭐', '🎉', '✨', '💜', '🌟'];
  for (let i = 0; i < 22; i++) {
    const s = document.createElement('span');
    s.textContent = e[i % e.length];
    s.style.left = Math.random() * 100 + 'vw';
    s.style.animationDelay = (Math.random() * 0.5) + 's';
    s.style.fontSize = (18 + Math.random() * 18) + 'px';
    fx.appendChild(s);
    setTimeout(() => s.remove(), 2400);
  }
}

// ---------- celebration: fireworks + festive sound ----------
let AC = null;
function fanfare() {
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    if (AC.state === 'suspended') AC.resume();
    const t0 = AC.currentTime + 0.05;
    const master = AC.createGain();
    master.gain.value = 0.5;
    master.connect(AC.destination);
    const note = (freq, start, len, type, vol) => {
      const o = AC.createOscillator(), g = AC.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(0, t0 + start);
      g.gain.linearRampToValueAtTime(vol, t0 + start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + start + len);
      o.connect(g); g.connect(master);
      o.start(t0 + start); o.stop(t0 + start + len + 0.05);
    };
    // ta-ta-ta-taaa!  (C E G C' then a big chord)
    [[523.25, 0], [659.25, 0.13], [783.99, 0.26]].forEach(([f, st]) => { note(f, st, 0.16, 'square', 0.18); note(f, st, 0.18, 'triangle', 0.3); });
    [1046.5, 783.99, 659.25, 523.25].forEach(f => { note(f, 0.42, 1.1, 'triangle', 0.22); note(f, 0.42, 0.9, 'square', 0.06); });
    // firework pops
    [0.7, 0.95, 1.2, 1.5].forEach(st => {
      const len = 0.25, buf = AC.createBuffer(1, Math.floor(AC.sampleRate * len), AC.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
      const src = AC.createBufferSource(), g = AC.createGain();
      src.buffer = buf; g.gain.value = 0.35;
      src.connect(g); g.connect(master); src.start(t0 + st);
    });
  } catch (e) {}
}
function fireworks() {
  const fx = $('#fx');
  const cv = document.createElement('canvas');
  const W = cv.width = window.innerWidth * 2, H = cv.height = window.innerHeight * 2;
  fx.appendChild(cv);
  const ctx = cv.getContext('2d');
  const colors = TH().fx;
  const parts = [];
  const burst = (x, y) => {
    const col = colors[Math.floor(Math.random() * colors.length)];
    const n = 70;
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n + Math.random() * 0.1, sp = 5 + Math.random() * 9;
      parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, col: Math.random() < 0.25 ? '#fff' : col, r: 3 + Math.random() * 3 });
    }
  };
  const shots = [0, 280, 520, 800, 1050].map(d => ({ d, x: W * (0.2 + Math.random() * 0.6), y: H * (0.15 + Math.random() * 0.35), done: false }));
  const start = performance.now();
  const step = now => {
    const t = now - start;
    shots.forEach(s => { if (!s.done && t >= s.d) { s.done = true; burst(s.x, s.y); } });
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    for (const p of parts) {
      if (p.life <= 0) continue;
      p.x += p.vx; p.y += p.vy; p.vy += 0.18; p.vx *= 0.985; p.vy *= 0.985; p.life -= 0.012;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.col;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (t < 3200) requestAnimationFrame(step); else cv.remove();
  };
  requestAnimationFrame(step);
}
let lastCelebrate = 0;
function celebrate() {
  if (Date.now() - lastCelebrate < 1500) return;
  lastCelebrate = Date.now();
  fireworks(); fanfare(); confetti();
}

// ---------- agenda for a day ----------
/** Turned off by a parent for this one day only. */
const offOn = (id, occ) => !!item(`off:${id}:${occ}`);
/** kid: whose day (default: the selected child). withOff: also rows a parent turned off for that day (marked r.off). */
function agenda(d, kid, withOff) {
  kid = kid || KID;
  const occ = occOf(d);
  const rows = [];
  const of = kind => list(kind).filter(i => kidOf(i) === kid && occursOn(i, d) && (withOff || !offOn(i.id, occ)));
  of('alarm').filter(a => a.on !== false && mins(a.time) >= 0).forEach(a => {
    const t = at(occ, mins(a.time));
    // a ring from before the alarm was moved to a later time does not count for the new time
    const rang = item(`rang:${a.id}:${occ}`);
    rows.push({ type: 'alarm', t, it: a, occ, off: offOn(a.id, occ), rang: rang && rang.at >= t - 60000 ? rang : null,
      log: item(`woke:${a.id}:${occ}`), miss: item(`wakemiss:${a.id}:${occ}`), snooze: item(`snooze:${a.id}:${occ}`) });
  });
  of('event').filter(e => mins(e.start) >= 0).forEach(e => {
    const start = at(occ, mins(e.start));
    const leave = start - (e.travel || 0) * 60000;
    rows.push({ type: 'event', t: leave, start, leave, prepAt: leave - (e.prep || 0) * 60000, it: e, occ, off: offOn(e.id, occ),
      log: item(`left:${e.id}:${occ}`), miss: item(`leavemiss:${e.id}:${occ}`) });
  });
  of('task').forEach(k => {
    const m = mins(k.time);
    rows.push({ type: 'task', t: at(occ, m >= 0 ? m : 1439), it: k, occ, off: offOn(k.id, occ), log: item(`task:${k.id}:${occ}`) });
  });
  return rows.sort((a, b) => a.t - b.t);
}
/** Did the wake-up alarm really ring on the child's phone? (shown to parents) */
function alarmNote(r, now) {
  if (r.log || r.off) return '';
  if (r.rang && r.rang.ok === false) return ` <span class="pill warn">⚠️ הטלפון חסם את הצלצול – לבדוק הרשאות</span>`;
  if (r.rang) return ` <span class="pill sun">🔔 צלצל ב-${tHM(r.rang.at)}</span>`;
  if (now > r.t + 15 * 60000 && r.occ === occOf(new Date())) return ` <span class="pill warn">⚠️ אין אישור שהשעון צלצל</span>`;
  return '';
}

/**
 * Parents: did the alarm (with this time) really arrive on the child's phone?
 * The child's phone reports the next alarm it set as item "sched:<kid>".
 */
function phoneNote(r, now) {
  const sc = item(`sched:${kidOf(r.it)}`);
  if (!sc || r.t > now + 3 * 86400000) return '';
  if (sc.alarm === r.it.id && Math.abs(sc.at - r.t) < 60000) return ` <span class="pill ok">✓ נקבע בטלפון</span>`;
  // the phone has a later alarm (or none) set first: this one did not reach it yet
  if (!sc.at || sc.at < now || r.t < sc.at - 60000) return ` <span class="pill warn">⏳ עוד לא הגיע לטלפון</span>`;
  return '';
}

function rowHtml(r, child, now) {
  const it = r.it;
  // parents: tap a row to change it
  const tap = !child && (r.type === 'task' || r.type === 'event' || r.type === 'alarm') ? ` tap" data-edit="${esc(it.id)}` : '';
  if (r.type === 'alarm') {
    let st;
    if (r.log) st = `<span class="pill ok">${child ? 'קמת' : G('קמה', 'קם')} ב-${tHM(r.log.at)} · \u200E+${r.log.pts}⭐</span>`;
    else if (r.miss) st = `<span class="pill warn">⚠️ השעון לא כובה בזמן</span>`;
    else if (now < r.t) st = `<span class="pill wait">מתוכנן</span>` + (child ? '' : phoneNote(r, now));
    else st = child ? `<span class="pill sun">מצלצל…</span>` : (alarmNote(r, now) || `<span class="pill sun">מצלצל…</span>`);
    return `<div class="row ${r.log ? 'done' : ''}${tap}">
      <div class="ico ${r.log ? 'ok' : 'alarm'}">${r.log ? '☀️' : '⏰'}</div>
      <div class="body"><div class="t1">השכמה${it.label ? ' · ' + esc(it.label) : ''}</div><div class="t2">${st}${r.snooze && r.log ? ' <span class="small muted">(עם נודניק)</span>' : ''}</div></div>
      <div class="time">${esc(it.time)}</div></div>`;
  }
  if (r.type === 'event') {
    let st = '', btn = '';
    if (r.log) st = `<span class="pill ok">${child ? 'יצאת' : G('יצאה', 'יצא')} ב-${tHM(r.log.at)}${r.log.late ? ' (איחור ' + r.log.late + ' דק׳)' : ''} · \u200E+${r.log.pts}⭐</span>`;
    else if (r.miss) st = `<span class="pill warn">לא ${child ? 'סימנת' : G('סימנה', 'סימן')} יציאה</span>`;
    else st = `יוצאים ב-<b>${tHM(r.leave)}</b> · מתחיל ב-${esc(it.start)}`;
    if (child && !r.log && r.occ === occOf(new Date()) && now >= r.leave - 60 * 60000 && now < r.start + 90 * 60000) {
      btn = `<button class="btn mint small" data-act="left" data-ref="${esc(it.id)}" data-occ="${r.occ}">יצאתי ✅</button>`;
    }
    return `<div class="row ${r.log ? 'done' : ''}${tap}">
      <div class="ico ${r.log ? 'ok' : 'event'}">${r.log ? '🚀' : '🎒'}</div>
      <div class="body"><div class="t1">${esc(it.title)}</div><div class="t2">${st}</div></div>
      ${btn || `<div class="time">${tHM(r.leave)}</div>`}</div>`;
  }
  // task
  const ts = taskState(r.log);
  const canMark = child && r.occ === occOf(new Date()) && (ts === 'open' || ts === 'rejected');
  const base = it.pts || 5;
  let st, mark, side = '';
  if (ts === 'approved') {
    st = `${ptsPill(r.log.pts, 'אושר' + (r.log.approvedBy && !child ? ' ע״י ' + esc(r.log.approvedBy) : ''))}${r.log.late ? ' <span class="small muted">· באיחור</span>' : ''}${r.log.adjBy ? ' <span class="small muted">· עודכן</span>' : ''}`;
    mark = `<div class="check on">✓</div>`;
    if (!child) side = `<button class="adj" data-adjust="${esc(r.log.id)}">✏️ נקודות</button>`;
  } else if (ts === 'pending') {
    st = `<span class="pill wait">⏳ ${child ? 'סימנת בוצע ·' : ''} מחכה לאישור${child ? '' : ' שלך'}</span>`
      + (r.log.late ? ` <span class="pill sun">⏰ באיחור – ${child ? 'ההורים יחליטו על הנקודות' : 'אתם מחליטים על הנקודות'}</span>` : '');
    mark = `<div class="check wait">⏳</div>`;
    if (!child) side = `<button class="adj" data-decide="${esc(r.log.id)}">להחליט</button>`;
  } else if (ts === 'missed') {
    st = `<span class="pill warn">${r.log.auto ? 'לא סומן עד סוף היום' : 'לא בוצע'} · ‎${r.log.pts}⭐</span>${r.log.adjBy ? ' <span class="small muted">· עודכן</span>' : ''}`;
    mark = `<div class="check x">✕</div>`;
    if (!child) side = `<button class="adj" data-adjust="${esc(r.log.id)}">✏️ נקודות</button>`;
  } else {
    st = ts === 'rejected' ? `<span class="pill warn">↩️ לא אושר – אפשר לבצע ולסמן שוב</span>`
      : (now > r.t ? `<span class="pill warn">עבר הזמן</span> ${child ? 'אם תסמנ' + G('י', '') + ' עכשיו – ההורים יחליטו על הנקודות' : 'סימון עכשיו = ההורים מחליטים על הנקודות'}`
        : `עד ${esc(it.time || 'סוף היום')} · ${child && game().sub ? esc(game().sub(it)) : base + '⭐'}`);
    if (it.photo) st += ` <span class="small">· 📷 צריך תמונה</span>`;
    mark = `<div class="check"></div>`;
  }
  const btns = canMark ? `<div class="btns">
      <button class="btn mint small" data-done="${esc(it.id)}" data-occ="${r.occ}">${it.photo ? '📷 ' : ''}${esc(game().done || 'בוצע ✅')}</button>
      <button class="btn danger small" data-notdone="${esc(it.id)}" data-occ="${r.occ}">לא בוצע ✕</button></div>` : '';
  const photo = r.log && r.log.photo ? `<div class="thumbwrap" data-photo="${esc(r.log.id)}"></div>` : '';
  return `<div class="row ${ts === 'approved' || ts === 'missed' ? 'done' : ''}${tap}">
    ${mark}
    <div class="body"><div class="t1">${child && game().tag ? (([n, c]) => `<span class="rar" style="--rc:${c}">${n}</span> `)(game().tag(it)) : ''}${esc(it.title)}${catChip(it)}</div><div class="t2">${st}</div>${btns}</div>
    ${photo}${side || (photo ? '' : `<div class="time">${esc(it.time || '')}</div>`)}</div>`;
}
/** "+5⭐" in green, "-3⭐" in red, "0⭐" in grey. */
function ptsPill(pts, label) {
  pts = pts || 0;
  const cls = pts > 0 ? 'ok' : pts < 0 ? 'neg' : 'wait';
  return `<span class="pill ${cls}">${label ? label + ' · ' : ''}‎${pts > 0 ? '+' : ''}${pts}⭐</span>`;
}

/** open | pending | approved | rejected | missed */
function taskState(log) {
  if (!log) return 'open';
  if (log.type === 'task_missed') return 'missed';
  if (log.status === 'pending') return 'pending';
  if (log.status === 'rejected') return 'rejected';
  return 'approved';
}
const penalty = t => Math.max(1, Math.floor((t.pts || 5) / 2));
function pendingTasks(all) {
  return (all ? list('log') : mine('log')).filter(l => l.type === 'task_done' && l.status === 'pending').sort((a, b) => (a.at || 0) - (b.at || 0));
}

function approvalsCard() {
  const p = pendingTasks();
  if (!p.length) return '';
  return `<div class="sec-title"><h2>📝 מחכה לאישור שלך (${p.length})</h2></div>` + p.map(l => {
    const d = l.occ === occOf(new Date()) ? 'היום' : 'ביום ' + new Date(at(l.occ, 0)).toLocaleDateString('he-IL', { weekday: 'long' });
    const t = S.items[l.ref];
    return `<div class="card" style="border:2px solid ${l.late ? 'var(--sun)' : 'var(--violet-soft)'}">
      <div style="display:flex;gap:12px;align-items:flex-start">
        <div style="flex:1"><b>${esc(l.title)}</b>${catChip(t)}
          <div class="small muted">${esc(kidName())} ${G('סימנה', 'סימן')} בוצע ${d} ב-${tHM(l.at)}</div>
          ${l.late ? `<div style="margin-top:6px"><span class="pill sun">⏰ באיחור${l.lateMin ? ' של ' + dur(l.lateMin * 60000) : ''} – 0⭐ אוטומטית, אתם מחליטים</span></div>`
            : `<div style="margin-top:6px"><span class="pill wait">בזמן · ${l.claim || 0}⭐</span></div>`}</div>
        ${l.photo ? `<div class="thumbwrap" data-photo="${esc(l.id)}"></div>` : ''}
      </div>
      <div class="actions" style="margin-top:12px">
        <button class="btn mint" data-decide="${esc(l.id)}">${l.late ? 'להחליט על הנקודות' : 'לאשר ✅'}</button>
        <button class="btn light" data-reject="${esc(l.id)}">לא אושר ↩️</button>
      </div></div>`;
  }).join('');
}

function fillPhotos() {
  document.querySelectorAll('[data-photo]').forEach(el => {
    const src = B.photo ? B.photo(el.dataset.photo) : '';
    el.innerHTML = src ? `<img class="thumb" src="${src}" alt="">` : `<div class="thumb none">📷<br>בדרך…</div>`;
    el.onclick = (e) => {
      e.stopPropagation();
      if (!src) return toast('התמונה עוד לא הגיעה לטלפון הזה');
      openModal(`<img src="${src}" style="width:100%;border-radius:16px" alt=""><div class="actions"><button class="btn light" data-c="no">סגירה</button></div>`,
        root => { root.querySelector('[data-c=no]').onclick = closeModal; });
    };
  });
}

function nextUp(now) {
  const today = agenda(new Date());
  for (const r of today) {
    if (r.log || r.miss) continue;
    if (r.type === 'alarm' && r.t > now) return { r, t: r.t, what: '⏰ השכמה', sub: r.it.label || '' };
    if (r.type === 'event' && r.start > now) {
      const prep = r.prepAt > now && r.prepAt < r.leave;
      return { r, t: r.leave, what: '🎒 ' + r.it.title,
        sub: `יוצאים ב-${tHM(r.leave)} · מתחיל ב-${r.it.start}` + (prep ? ` · להתחיל להתארגן ב-${tHM(r.prepAt)}` : ''), label: 'יוצאים בעוד' };
    }
    if (r.type === 'task' && taskState(r.log) === 'open' && r.t > now - 3 * 3600000) return { r, t: r.t, what: '📝 ' + r.it.title, sub: `לסיים עד ${r.it.time}`, label: 'נשאר' };
  }
  const tm = agenda(dayAdd(new Date(), 1)).find(r => r.type === 'alarm');
  if (tm) return { r: tm, t: tm.t, what: '⏰ השכמה מחר', sub: `השעון יצלצל ב-${tm.it.time}`, label: 'בעוד' };
  return null;
}

// ---------- screens ----------
function render() {
  if (!S) return;
  clearInterval(tickTimer);
  const app = $('#app');
  if (!S.me.role || !S.me.code) {
    setTheme(OB.theme || 'purple');
    bars();
    app.innerHTML = onboarding(); bindOnboarding(); return;
  }
  // secure entry on a parent's phone: joined (needs the PIN), app lock, or no PIN yet
  if (!isChild() && (S.me.unlocked === false || S.me.session === false)) {
    setTheme('purple'); applyDesign(); bars();
    app.innerHTML = lockScreen(); bindLock(); return;
  }
  BIO_ASKED = false;
  if (!isChild() && !S.me.pinSet) {
    setTheme('purple'); applyDesign(); bars();
    app.innerHTML = forcePinScreen(); bindForcePin(); return;
  }
  pickKid();
  setTheme(kidInfo().theme);
  applyDesign();
  bars();
  if ((TAB === 'report' || TAB === 'calendar') && isChild()) TAB = 'today';
  if (shownTabs().indexOf(TAB) < 0) TAB = 'today'; // a screen the parent closed
  let body = '';
  if (TAB === 'today') body = isChild() ? childToday() : parentToday();
  else if (TAB === 'calendar') body = calendarScreen();
  else if (TAB === 'plan') body = planScreen();
  else if (TAB === 'report') body = reportScreen();
  else if (TAB === 'rewards') body = rewardsScreen();
  else body = settingsScreen();
  const pending = list('redeem').filter(r => r.status === 'pending').length;
  const badge = { today: !isChild() ? pendingTasks(true).length : 0, rewards: !isChild() && pending ? pending : 0 };
  app.innerHTML = body + (TAB === 'today' || TAB === 'plan' ? micFab() : '') + `
  <nav>${shownTabs().map(k => navBtn(k, TABS_ALL[k][0], TABS_ALL[k][1], badge[k] || 0)).join('')}</nav>`;
  bindCommon();
  fillPhotos();
  if (TAB === 'today') tickTimer = setInterval(() => { if (!MODAL && TAB === 'today') render(); }, 30000);
}
let lastBars = '';
function bars() {
  const c = heroColor();
  if (c !== lastBars && B.setBars) { lastBars = c; B.setBars(c); }
}
function navBtn(id, ico, txt, badge) {
  return `<button class="${TAB === id ? 'on' : ''}" data-tab="${id}"><span class="ni">${ico}</span><span>${txt}${badge ? ` <span class="badge">${badge}</span>` : ''}</span></button>`;
}

function kidTabs() {
  if (isChild()) return '';
  const ks = kids();
  if (ks.length < 2) return '';
  return `<div class="kidtabs">${ks.map(k => {
    const n = list('log').filter(l => kidOf(l) === k.kid && l.type === 'task_done' && l.status === 'pending').length
      + list('redeem').filter(r => kidOf(r) === k.kid && r.status === 'pending').length;
    return `<button class="${k.kid === KID ? 'on' : ''}" data-kid="${esc(k.kid)}"><span class="dot" style="background:${THEMES[themeOf(k.theme)].kc}"></span>${esc(k.name)}${n ? `<span class="badge">${n}</span>` : ''}</button>`;
  }).join('')}</div>`;
}

function hero(title, sub) {
  const sc = score();
  const today = occOf(new Date());
  const todayPts = mine('log').filter(l => l.occ === today).reduce((s, l) => s + (l.pts || 0), 0);
  const ls = S.me.lastSync ? Math.round((Date.now() - S.me.lastSync) / 60000) : null;
  return `<div class="hero">
    <div class="top"><div><h1>${title}</h1><div class="date">${sub}</div></div>
    <div style="display:flex;gap:6px">${!isChild() ? '<button class="sync" data-design="1" aria-label="עיצוב">🎨</button>' : '<button class="sync" data-kthemes="1" aria-label="בחירת עיצוב">🎨</button>'}<button class="sync" data-sync="1">${S.me.syncErr ? '⚠️' : '🔄'} ${ls == null ? 'סנכרון' : ls < 1 ? 'עכשיו' : 'לפני ' + ls + ' דק׳'}</button></div></div>
    <div class="chips">
      <div class="chip"><b>\u200E${sc.pts}</b><span>⭐ נקודות</span></div>
      <div class="chip"><b>${sc.streak}</b><span>🔥 ימים ברצף</span></div>
      <div class="chip"><b>\u200E${todayPts >= 0 ? '+' : ''}${todayPts}</b><span>✨ היום</span></div>
    </div>${levelCard()}${kidTabs()}</div>`;
}
function dateLine() {
  return new Date().toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });
}

/** "1.12" -> 1012, for comparing versions. */
const verNum = v => { const m = /^(\d+)\.(\d+)/.exec(v || ''); return m ? (+m[1]) * 1000 + (+m[2]) : 0; };
function newestVer() {
  let best = S.version || '';
  [S.me.latest].concat(list('device').map(d => d.ver)).forEach(v => { if (verNum(v) > verNum(best)) best = v; });
  return best;
}
function updateBanner() {
  const nv = newestVer();
  if (verNum(nv) <= verNum(S.version)) return '';
  return `<div class="banner" style="background:var(--sun-soft);color:#6b4b00"><div style="flex:1">📥 יש גרסה חדשה ${esc(nv)} (בטלפון הזה ${esc(S.version)})</div>
    <button class="btn small" data-update="1">לעדכן</button></div>`;
}
const agoTxt = t => { if (!t) return 'אף פעם'; const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? 'עכשיו' : m < 60 ? `לפני ${m} דק׳` : m < 1440 ? `לפני ${Math.round(m / 60)} שע׳` : `לפני ${Math.round(m / 1440)} ימים`; };
function syncStatus() {
  const e = S.me.syncErr || '';
  const err = e === '429' ? '⚠️ שרת ההודעות ביקש להאט (הרבה הודעות בבת אחת, למשל אחרי התקנות מחדש). מנסה שוב לבד תוך כמה דקות.'
    : e.indexOf('net') === 0 ? '⚠️ הטלפון לא מצליח להגיע לשרת ההודעות של המשפחה (ntfy.sh). לוחצים "בדיקת חיבור" למטה.'
    : e ? '⚠️ תקלה בסנכרון (' + esc(e) + ') – ינסה שוב לבד' : '';
  const detail = e.indexOf('net:') === 0 ? `<div class="small muted" dir="ltr" style="text-align:left;margin-top:4px;word-break:break-all">${esc(e.slice(4))}</div>` : '';
  return `<div class="small"><b>${err ? err : '✅ הסנכרון תקין'}</b></div>${detail}
    <div class="small muted" style="margin-top:4px">שליחה אחרונה: ${agoTxt(S.me.sendOk)} · קבלה אחרונה: ${agoTxt(S.me.recvOk)}${S.me.outbox ? ` · <b style="color:var(--red)">${S.me.outbox} שינויים מחכים לשליחה</b>` : ''}</div>
    ${netTestHtml()}`;
}
/** Result of the connection check: which sites this phone can reach. */
function netTestHtml() {
  const btn = `<button class="btn light small block" style="margin-top:10px" data-nettest="1">🩺 בדיקת חיבור</button>`;
  const t = S.me.netTest || '';
  if (!t) return btn;
  if (t === 'running') return `<div class="small muted" style="margin-top:10px">🩺 בודק חיבור… (עד חצי דקה)</div>`;
  let rows = [];
  try { rows = JSON.parse(t); } catch (e) { return btn; }
  const ok = r => r.res.indexOf('ok:') === 0;
  const ntfy = rows[0], others = rows.slice(1);
  let verdict = '';
  if (ntfy && ok(ntfy)) verdict = '✅ שרת ההודעות נגיש. אם עדיין לא מסתנכרן – לוחצים "לסנכרן עכשיו" ושולחים צילום.';
  else if (others.some(ok)) verdict = '🚫 האינטרנט עובד, אבל <b>ntfy.sh חסום</b> בחיבור הזה – כנראה סינון תוכן (חברת הסלולר / הראוטר / DNS מסנן). מנסים ברשת אחרת (Wi-Fi ↔ סלולר), או מבקשים מהספק לאשר את ntfy.sh.';
  else verdict = '⚠️ אף אתר לא נגיש מהאפליקציה – לבדוק שלאפליקציה מותר להשתמש בנתונים (הגדרות ← אפליקציות ← בזמן ← נתונים ניידים / חוסך נתונים).';
  return `<div class="card" style="background:var(--bg);box-shadow:none;margin:10px 0 0;padding:10px 12px">
    ${rows.map(r => `<div class="small" style="display:flex;gap:6px;align-items:flex-start;margin:3px 0"><span>${ok(r) ? '✅' : '❌'}</span>
      <span style="flex:1"><b>${esc(r.name)}</b>${ok(r) ? '' : `<br><span class="muted" dir="ltr" style="word-break:break-all">${esc(r.res.replace(/^(err|http):/, ''))}</span>`}</span></div>`).join('')}
    <div class="small" style="margin-top:6px">${verdict}</div></div>${btn}`;
}
/** Every phone in the family: version, where it was installed from, last sync. */
function phonesCard() {
  const nv = newestVer();
  const ds = list('device').filter(d => Date.now() - (d.seen || 0) < 30 * 86400000)
    .sort((a, b) => (a.role === b.role ? 0 : a.role === 'parent' ? -1 : 1) || String(a.name).localeCompare(String(b.name)));
  // the same person installed again (a new copy of the app = a new line): the older lines can be removed
  const newest = {};
  ds.forEach(d => { const k = d.role + '|' + d.name; if (!newest[k] || (d.seen || 0) > (newest[k].seen || 0)) newest[k] = d; });
  const playOld = ds.some(d => d.src === 'play' && verNum(d.ver) < verNum(nv));
  const rows = ds.map(d => {
    const old = verNum(d.ver) < verNum(nv);
    const stale = Date.now() - (d.seen || 0) > 24 * 3600000;
    const me = d.id === 'dv:' + S.me.dev;
    const dup = !me && newest[d.role + '|' + d.name] !== d && !isChild();
    return `<div class="row"><div class="ico ${d.role === 'parent' ? 'task' : 'alarm'}">${d.role === 'parent' ? '👨‍👩‍👧' : '🧒'}</div>
      <div class="body"><div class="t1">${esc(d.name)}${me ? ' <span class="small muted">(הטלפון הזה)</span>' : ''}</div>
      <div class="t2">גרסה ${esc(d.ver)} · ${d.src === 'play' ? 'מ-Google Play' : 'מקובץ התקנה'} · סונכרן ${agoTxt(d.seen)}</div></div>
      ${dup ? `<button class="btn danger small" data-devdel="${esc(d.id)}">הסרה</button>` : old ? '<span class="pill warn">צריך לעדכן</span>' : stale ? '<span class="pill sun">לא סונכרן יום+</span>' : '<span class="pill ok">✓</span>'}</div>`;
  }).join('');
  return `<div class="sec-title"><h2>📱 הטלפונים במשפחה</h2></div>
    <div class="card">${rows || '<div class="empty small">עוד אין נתונים</div>'}
      ${playOld ? `<div class="hint">▶️ טלפון שהותקן מ-<b>Google Play</b> מקבל רק גרסאות שהועלו ל-Play, ולכן לא מתעדכן מכאן. כדי לעדכן אותו: מוחקים את "בזמן" בטלפון הזה, מתקינים מהקישור (הגדרות ← "עדכון גרסה" בטלפון אחר ← שליחה), ומצטרפים שוב עם קוד המשפחה וקוד ההורים.</div>` : ''}
      ${Object.keys(newest).length < ds.length ? '<div class="small muted" style="margin-top:8px">🧹 שורה כפולה (אותו שם) נוצרת כשמתקינים מחדש – אפשר להסיר את הישנות.</div>' : ''}
      <div class="small muted" style="margin-top:8px">טלפון שלא מופיע כאן מריץ גרסה ישנה (לפני ${esc(S.version)}) – צריך לעדכן אותו. הגרסה הכי חדשה: ${esc(nv)}</div></div>`;
}

function permBanner() {
  let p = {};
  try { p = JSON.parse(B.perms()); } catch (e) {}
  const bad = (isChild() ? ['notif', 'exact', 'full', 'battery'] : ['notif']).filter(k => p[k] === false);
  if (!bad.length) return '';
  return `<div class="banner"><div style="flex:1">⚠️ ${isChild() ? 'כדי שהשעון והתזכורות יעבדו' : 'כדי לקבל עדכונים'} צריך לאשר ${bad.length} הרשא${bad.length > 1 ? 'ות' : 'ה'}</div>
    <button class="btn small coral" data-tab="settings">לתקן</button></div>`;
}

function childToday() {
  const now = Date.now();
  const rows = agenda(new Date());
  const nx = nextUp(now);
  const hi = new Date().getHours();
  const greet = hi < 12 ? 'בוקר טוב' : hi < 17 ? 'צהריים טובים' : hi < 21 ? 'ערב טוב' : 'לילה טוב';
  let next = '';
  if (nx) {
    next = `<div class="card next">
      <div class="lbl">הדבר הבא</div>
      <div class="what">${esc(nx.what)}</div>
      <div class="count">${dur(nx.t - now)}</div>
      <div class="sub">${esc(nx.sub)}</div>
      ${nx.r.type === 'event' && now >= nx.r.leave - 60 * 60000 ? `<div style="margin-top:12px"><button class="btn mint block" data-act="left" data-ref="${esc(nx.r.it.id)}" data-occ="${nx.r.occ}">יצאתי ✅ (\u200E+10⭐ אם בזמן)</button></div>` : ''}
    </div>`;
  }
  const noAlarm = !mine('alarm').length;
  // game designs: a game picture made of today's real tasks instead of the plain "next" card
  const gm = game();
  const tt = todayTasks();
  if (gm.board) next = gm.board({ now, rows, nx, tt, sc: score(), L: levelInfo(KID), name: S.me.name || kidName() });
  return hero(`${greet}, ${esc(S.me.name)} 👋`, dateLine()) + `<main>
    ${updateBanner()}${permBanner()}
    ${next}
    ${noAlarm ? `<div class="card center"><div style="font-size:34px">⏰</div><b>עוד אין שעון מעורר</b><p class="muted small">קובעים שעה, והשעון יצלצל עד שפותרים תרגיל קטן</p><button class="btn" data-new="alarm">לקבוע שעון מעורר</button></div>` : ''}
    <div class="sec-title"><h2>${esc(gm.sec || 'היום שלי')}${tt.total ? ` <span class="cnt">${tt.done} מתוך ${tt.total}</span>` : ''}</h2><button class="add" data-new="task">+ משימה</button></div>
    <div class="card">${rows.length ? rows.map(r => rowHtml(r, true, now)).join('') : `<div class="empty"><div class="e">🌈</div>אין כלום להיום</div>`}</div>
    ${tomorrowCard(true)}
  </main>`;
}

function tomorrowCard(child) {
  const rows = agenda(dayAdd(new Date(), 1));
  if (!rows.length) return '';
  const now = Date.now();
  return `<div class="sec-title"><h2>מחר</h2></div><div class="card">${rows.map(r => rowHtml(r, child, now)).join('')}</div>`;
}

function weekCard() {
  const days = [];
  for (let i = 6; i >= 0; i--) days.push(dayAdd(new Date(), -i));
  const logs = mine('log');
  const vals = days.map(d => logs.filter(l => l.occ === occOf(d)).reduce((s, l) => s + (l.pts || 0), 0));
  const max = Math.max(10, ...vals);
  return `<div class="sec-title"><h2>7 ימים אחרונים</h2></div><div class="card"><div class="week">
    ${days.map((d, i) => `<div class="col"><div class="n">${vals[i] ? '\u200E' + vals[i] : ''}</div><div class="b" style="height:${Math.max(0, Math.round(vals[i] / max * 80))}%"></div><div class="d">${DAYS[d.getDay()]}</div></div>`).join('')}
  </div></div>`;
}

function parentToday() {
  const now = Date.now();
  const kid = kidName();
  const joined = kids().length > 0;
  const rows = agenda(new Date());
  const pending = mine('redeem').filter(r => r.status === 'pending');
  const gifts = `<button class="btn ghost block" data-new="gift">${THEMES[themeOf(kidInfo().theme)].yb ? '💛' : '💜'} לתת בונוס / מילה טובה ל${esc(kid)}</button>`;
  return hero(`${esc(kid)} היום`, dateLine()) + `<main>
    ${updateBanner()}${permBanner()}
    ${!joined ? `<div class="card"><b>📲 אף ילד עוד לא מחובר</b><p class="muted small">מתקינים את האפליקציה בטלפון של הילד/ה, בוחרים "אני ילד/ה" ומקלידים את קוד המשפחה.</p><button class="btn block" data-share="1">שליחת הקוד בוואטסאפ</button></div>` : ''}
    ${parentSections({
      approvals: approvalsCard(),
      redeems: pending.map(redeemCard).join(''),
      stats: joined ? statsMini() : '',
      today: `<div class="sec-title"><h2>מה קרה היום</h2><button class="add" data-new="task">+ משימה</button></div>
    <div class="card">${rows.length ? rows.map(r => rowHtml(r, false, now)).join('') : `<div class="empty"><div class="e">🗓️</div>אין כלום בלו״ז להיום.<br>מוסיפים בלשונית "לו״ז" או ב-🎤</div>`}</div>`,
      gift: `<div style="margin-top:12px">${gifts}</div>`,
      week: weekCard(),
      tomorrow: tomorrowCard(false),
    })}
    <p class="muted small center">${S.me.live ? '⚡ עדכונים מיידיים פועלים' : 'העדכונים מהטלפון ' + G('שלה', 'שלו') + ' מגיעים בדרך כלל תוך כרבע שעה'}</p>
  </main>`;
}

function redeemCard(r) {
  return `<div class="card" style="border:2px solid var(--sun)">
    <b>🎁 ${esc(kidName())} רוצה לממש: ${esc(r.title)}</b>
    <div class="muted small">${r.cost} ⭐ · ${tHM(r.at || r.upd)}</div>
    <div class="actions" style="margin-top:12px">
      <button class="btn mint" data-redeem="${esc(r.id)}" data-st="approved">לאשר 🎉</button>
      <button class="btn light" data-redeem="${esc(r.id)}" data-st="declined">לא עכשיו</button>
    </div></div>`;
}

// ---------- plan (schedule) ----------
function planScreen() {
  const alarms = mine('alarm').sort((a, b) => mins(a.time) - mins(b.time));
  const events = mine('event').sort((a, b) => (a.date || '') .localeCompare(b.date || '') || mins(a.start) - mins(b.start));
  const tasks = mine('task').filter(t => !t.date || t.date >= occOf(new Date())).sort((a, b) => (a.date || '').localeCompare(b.date || '') || mins(a.time) - mins(b.time));
  const title = isChild() ? 'הלו״ז שלי' : 'הלו״ז של ' + esc(kidName());
  return `<div class="hero" style="padding-bottom:18px"><div class="top"><div><h1>${title}</h1><div class="date">שעונים, חוגים ומשימות</div></div></div>${kidTabs()}</div><main>
    <div class="sec-title"><h2>⏰ שעון מעורר</h2><button class="add" data-new="alarm">+ הוספה</button></div>
    ${alarms.length ? alarms.map(a => `<div class="card item ${a.on === false ? 'off' : ''}" data-edit="${esc(a.id)}">
        <div style="flex:1"><div class="big">${esc(a.time)}</div>${a.label ? `<div class="small muted">${esc(a.label)}</div>` : ''}${daysRow(a)}</div>
        <button class="toggle ${a.on !== false ? 'on' : ''}" data-toggle="${esc(a.id)}"></button></div>`).join('')
      : `<div class="card empty"><div class="e">⏰</div>עוד אין שעון מעורר</div>`}

    <div class="sec-title"><h2>🎒 חוגים ויציאות</h2><button class="add" data-new="event">+ הוספה</button></div>
    ${events.length ? events.map(e => {
      const leave = mins(e.start) - (e.travel || 0);
      return `<div class="card item" data-edit="${esc(e.id)}">
        <div class="ico event">🎒</div>
        <div style="flex:1"><b>${esc(e.title)}</b><div class="small muted">${daysText(e)} · מתחיל ${esc(e.start)} · <b style="color:var(--coral)">יוצאים ${pad(Math.floor(((leave % 1440) + 1440) % 1440 / 60))}:${pad(((leave % 60) + 60) % 60)}</b></div></div></div>`;
    }).join('') : `<div class="card empty"><div class="e">🎒</div>מוסיפים חוג – והאפליקציה תזכיר מתי להתארגן ומתי לצאת</div>`}

    <div class="sec-title"><h2>✅ משימות</h2><button class="add" data-new="task">+ הוספה</button></div>
    ${tasks.length ? CAT_ORDER.concat(['']).map(k => {
      const g = tasks.filter(t => catOf(t) === k);
      if (!g.length) return '';
      const c = CATS[k] || { e: '📝', n: 'בלי קטגוריה', c: '#8d88a8' };
      return `<div class="cathead" style="--cc:${c.c}"><i></i>${c.e} ${c.n} · ${g.length}</div>` + g.map(t => `<div class="card item withcat" style="--cc:${c.c}" data-edit="${esc(t.id)}">
        <div class="ico task">${c.e}</div>
        <div style="flex:1"><b>${esc(t.title)}</b><div class="small muted">${daysText(t)} · עד ${esc(t.time || '')} · ${t.pts || 5}⭐${t.photo ? ' · 📷' : ''}${t.by ? ' · מאת ' + esc(t.by) : ''}</div></div>
        ${isChild() ? '' : '<span class="adj">✏️ לשנות</span>'}</div>`).join('');
    }).join('') : `<div class="card empty"><div class="e">📝</div>אין משימות פתוחות</div>`}
  </main>`;
}
function daysRow(it) {
  if (it.date) return `<div class="small muted">${daysText(it)}</div>`;
  return `<div class="days">${DAYS.map((d, i) => `<i class="${(it.days || []).indexOf(i) >= 0 ? 'on' : ''}">${d}</i>`).join('')}</div>`;
}

// ---------- rewards ----------
function rewardsScreen() {
  const sc = score();
  const rewards = mine('reward').sort((a, b) => (a.cost || 0) - (b.cost || 0));
  const reqs = mine('redeem').sort((a, b) => (b.at || b.upd) - (a.at || a.upd));
  const child = isChild();
  const pending = reqs.filter(r => r.status === 'pending');
  const stTxt = { pending: ['wait', 'מחכה לאישור'], approved: ['ok', 'אושר 🎉'], declined: ['warn', 'לא אושר'] };
  return `<div class="hero" style="padding-bottom:18px"><div class="top"><div><h1>פרסים 🎁</h1><div class="date">${child ? 'אוספים נקודות ומממשים' : 'קובעים פרסים ומאשרים בקשות'}</div></div></div>
    <div class="big-score"><b>\u200E${sc.pts}</b> ⭐</div>${kidTabs()}</div><main>
    ${!child ? pending.map(redeemCard).join('') : ''}
    <div class="sec-title"><h2>הפרסים</h2>${!child ? `<button class="add" data-new="reward">+ פרס חדש</button>` : ''}</div>
    ${rewards.length ? `<div class="rewards">${rewards.map(r => {
      const pct = Math.min(100, Math.round(sc.pts / Math.max(1, r.cost) * 100));
      const can = sc.pts >= r.cost;
      return `<div class="reward" ${!child ? `data-edit="${esc(r.id)}"` : ''}>
        <div class="rt">${esc(r.title)}</div><div class="cost">${r.cost} ⭐</div>
        <div class="bar"><div style="width:${pct}%"></div></div>
        ${child ? (can ? `<button class="btn small mint" data-want="${esc(r.id)}">לממש!</button>` : `<div class="small muted">חסרות ${r.cost - sc.pts} ⭐</div>`) : `<div class="small muted">לעריכה – לוחצים</div>`}
      </div>`;
    }).join('')}</div>` : `<div class="card empty"><div class="e">🎁</div>${child ? 'ההורים עוד לא הוסיפו פרסים. אפשר לבקש מהם!' : G('מוסיפים פרסים שהיא תרצה – כדאי לבחור אותם יחד איתה', 'מוסיפים פרסים שהוא ירצה – כדאי לבחור אותם יחד איתו')}</div>`}
    ${!child ? `<div style="margin-top:14px">${'<button class="btn ghost block" data-new="gift">💜 לתת בונוס / מילה טובה</button>'}</div>` : ''}
    <div class="sec-title"><h2>היסטוריה</h2></div>
    <div class="card">${reqs.length ? reqs.map(r => `<div class="row"><div class="ico task">🎁</div><div class="body"><div class="t1">${esc(r.title)}</div><div class="t2">${r.cost} ⭐ · ${new Date(r.at || r.upd).toLocaleDateString('he-IL')}</div></div><span class="pill ${stTxt[r.status] ? stTxt[r.status][0] : 'wait'}">${stTxt[r.status] ? stTxt[r.status][1] : ''}</span></div>`).join('')
      : `<div class="empty">עוד לא מומשו פרסים</div>`}</div>
    <div class="card small muted">
      <b style="color:var(--ink)">איך מרוויחים נקודות?</b><br>
      ☀️ השכמה בלי נודניק: 10 · עם נודניק: 5<br>
      🚪 יציאה בזמן: 10 · עד 10 דק׳ איחור: 5<br>
      ✅ משימה שבוצעה בזמן וההורים אישרו: כל הנקודות<br>
      ⏰ משימה שסומנה באיחור: אין נקודות אוטומטיות – ההורים מחליטים אם לתת או להוריד, וכמה<br>
      ❌ משימה שלא בוצעה: מינוס חצי מהנקודות שלה<br>
      🔥 כל 5 ימים ברצף של השכמה בזמן: בונוס 15
    </div>
  </main>`;
}

// ---------- settings ----------
function settingsScreen() {
  let p = {};
  try { p = JSON.parse(B.perms()); } catch (e) {}
  const child = isChild();
  const perm = (k, title, sub) => p[k] === undefined ? '' : `<div class="perm"><div style="font-size:22px">${p[k] ? '✅' : '⚠️'}</div><div class="pt"><b>${title}</b><span>${sub}</span></div>${p[k] ? '' : `<button class="btn small coral" data-fix="${k}">לתקן</button>`}</div>`;
  const ls = S.me.lastSync ? new Date(S.me.lastSync).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) : '—';
  return `<div class="hero" style="padding-bottom:18px"><div class="top"><div><h1>הגדרות</h1><div class="date">${esc(S.me.name)} · ${child ? 'הטלפון שלי' : 'טלפון של הורה'}</div></div></div></div><main>
    <div class="sec-title"><h2>👨‍👩‍👧 קוד המשפחה</h2></div>
    <div class="card">
      <div class="muted small">כל מי שמקליד את הקוד הזה מצטרף למשפחה – הורים וכל הילדים</div>
      <div class="code">${fmtCode(S.me.code)}</div>
      <button class="btn block" data-share="1">📲 שליחה בוואטסאפ עם קישור להתקנה</button>
    </div>

    ${!child ? securityCard() : ''}
    ${!child ? screensCard() : ''}

    <div class="sec-title"><h2>🔐 הרשאות בטלפון</h2></div>
    <div class="card">
      ${perm('notif', 'התראות', child ? 'תזכורות יציאה ומשימות' : 'עדכונים כשהילדים קמים / יוצאים')}
      ${child ? perm('exact', 'שעונים מדויקים', 'כדי שהשעון יצלצל בדיוק בזמן') : ''}
      ${child ? perm('full', 'מסך מלא לשעון המעורר', 'השעון נפתח על כל המסך גם כשהטלפון נעול') : ''}
      ${perm('battery', 'בלי הגבלת סוללה', 'כדי שאנדרואיד לא "ירדים" את האפליקציה')}
      ${p.samsung ? `<div class="hint">📱 <b>בסמסונג:</b> הגדרות ← סוללה ← הגבלות שימוש ברקע ← לוודא ש"בזמן" <b>לא</b> ברשימת "אפליקציות במצב שינה".</div>` : ''}
    </div>

    ${child ? `<div class="sec-title"><h2>🎨 העיצוב שלי</h2></div>
    <div class="card">
      <div class="theme-pick">${themeButtons(kidInfo().theme, t => `data-settheme="${t}"`)}</div>
      <label class="f">אני</label>
      <div class="seg"><button class="${kidInfo().gender !== 'm' ? 'on' : ''}" data-setgender="f">בת 👧</button><button class="${kidInfo().gender === 'm' ? 'on' : ''}" data-setgender="m">בן 👦</button></div>
    </div>` : `<div class="sec-title"><h2>🎨 עיצוב</h2></div>
    <div class="card"><button class="btn block" data-design="1">🎨 עיצוב אישי של המסך שלי</button>
      ${kids().map(k => `<label class="f">העיצוב של ${esc(k.name)}</label><div class="theme-pick">${themeButtons(k.theme, t => `data-kidtheme="${esc(k.kid)}|${t}"`)}</div>`).join('')}
      ${kids().length ? '<div class="small muted" style="margin-top:8px">העיצוב מתעדכן גם בטלפון של הילד/ה</div>' : ''}
    </div>
    <div class="card small"><b>👦👧 ילד נוסף?</b><div class="muted">מתקינים אצלו את האפליקציה, בוחרים "אני ילד/ה" ומקלידים את אותו קוד משפחה. כל ילד מקבל לו״ז, נקודות ופרסים משלו, ולמעלה מופיעים כפתורים למעבר בין הילדים.</div></div>`}

    ${child ? `<div class="sec-title"><h2>🎵 צלצול השעון המעורר</h2></div>
    <div class="card">
      <div style="display:flex;align-items:center;gap:10px"><div class="ico alarm">🎵</div>
        <div style="flex:1"><b>${esc(S.me.ringtone || 'צלצול ברירת המחדל של הטלפון')}</b><div class="small muted">הצלצול הנוכחי</div></div>
        <button class="btn ghost small" data-preview="1">▶️ להשמיע</button></div>
      <div class="actions" style="margin-top:12px"><button class="btn" data-ring="1">לבחור צלצול</button><button class="btn light" data-song="1">🎶 שיר מהטלפון</button></div>
    </div>` : ''}

    ${child ? `<div class="sec-title"><h2>⏰ בדיקה</h2></div>
    <div class="card"><p class="small muted" style="margin-top:0">לוחצים, נועלים את המסך ומחכים 10 שניות. השעון צריך לצלצל ולהיפתח על כל המסך.</p>
      <button class="btn coral block" data-test="1">בדיקת שעון מעורר</button></div>` : ''}

    <div class="sec-title"><h2>⚡ עדכונים מיידיים</h2></div>
    <div class="card"><div style="display:flex;align-items:center;gap:12px">
      <div style="flex:1"><b>${S.me.live ? 'פועל – כל שינוי מגיע לכל הטלפונים תוך שניות' : 'כבוי – עדכון כל רבע שעה'}</b>
      <div class="small muted">כשזה פועל מופיעה למעלה התראה קטנה וקבועה "בזמן מחובר למשפחה" – זה תקין.</div></div>
      <button class="toggle ${S.me.live ? 'on' : ''}" data-live="1"></button></div></div>

    <div class="sec-title"><h2>🔄 סנכרון</h2></div>
    <div class="card">${syncStatus()}
      <div class="actions" style="margin-top:10px"><button class="btn ghost" data-sync="1">לסנכרן עכשיו</button><button class="btn light" data-update="1">📥 ${S.fromPlay ? 'עדכון ב-Play' : 'עדכון גרסה'}</button></div>
    </div>

    ${phonesCard()}

    ${!child ? `<div class="sec-title"><h2>▶️ Google Play</h2></div>
    <div class="card"><div class="small muted">${(item('cfg') || {}).playLink ? 'קישור ההצטרפות שמור – הוא נשלח עם קוד המשפחה' : 'אחרי שהאפליקציה עולה לבדיקה פנימית ב-Play, מדביקים כאן את קישור ההצטרפות'}</div>
      <button class="btn ghost block" style="margin-top:10px" data-playlink="1">🔗 ${(item('cfg') || {}).playLink ? 'שינוי הקישור' : 'הדבקת קישור ההצטרפות'}</button></div>` : ''}

    <div class="card small muted center">בזמן · גרסה ${esc(S.version)}<br><button class="btn danger small" style="margin-top:10px" data-reset="1">יציאה מהמשפחה והתחלה מחדש</button></div>
  </main>`;
}


// ---------- secure entry (parents) ----------
let PINBUF = '';
let BIO_ASKED = false;
let waitTimer = null;
/** Same rule as on the phone: 4–8 digits, not all the same, not counting up/down. */
function weakPin(p) {
  if (!/^\d{4,8}$/.test(p)) return true;
  let same = true, up = true, down = true;
  for (let i = 1; i < p.length; i++) {
    const a = p.charCodeAt(i - 1), b = p.charCodeAt(i);
    if (b !== a) same = false;
    if (b !== a + 1) up = false;
    if (b !== a - 1) down = false;
  }
  return same || up || down;
}
const pinWait = () => (B.pinWait ? B.pinWait() : 0);
function pinPad() {
  return `<div class="pindots">${Array.from({ length: Math.max(4, PINBUF.length) }, (_, i) => `<i class="${i < PINBUF.length ? 'on' : ''}"></i>`).join('')}</div>
    <div class="pinmsg" id="pin-msg">${pinWait() ? `יותר מדי ניסיונות. אפשר לנסות שוב בעוד ${pinWait()} שניות` : ''}</div>
    <div class="pinpad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button type="button" data-pk="${n}">${n}</button>`).join('')}
      <button type="button" data-pk="del" aria-label="מחיקה">⌫</button><button type="button" data-pk="0">0</button><button type="button" data-pk="ok" aria-label="כניסה" style="background:var(--violet);color:var(--on-acc)">✓</button></div>`;
}
// ---------- drawing a pattern ----------
let LOCKWAY = '';  // '' = the phone's choice (pattern if set), 'pin' = the parent chose to type the code
function patternPad(id) {
  return `<div class="pat" id="${id}"><svg class="pat-l" aria-hidden="true"></svg>${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<span class="pd" data-pd="${n}"><i></i></span>`).join('')}</div>`;
}
/** Draw with a finger over the 9 dots; onDone(“1452…”) when the finger lifts. Returns reset(error). */
function bindPattern(el, onDone) {
  const svg = el.querySelector('.pat-l');
  const dots = [...el.querySelectorAll('[data-pd]')];
  let seq = [], drawing = false, cur = null;
  const center = d => { const r = d.getBoundingClientRect(), b = el.getBoundingClientRect(); return [r.left - b.left + r.width / 2, r.top - b.top + r.height / 2]; };
  const draw = () => {
    const pts = seq.map(n => center(dots[n - 1]));
    if (cur && drawing) pts.push(cur);
    svg.innerHTML = pts.length > 1 ? `<polyline points="${pts.map(p => p.join(',')).join(' ')}" />` : '';
    dots.forEach((d, i) => d.classList.toggle('on', seq.indexOf(i + 1) >= 0));
  };
  const hit = (x, y) => {
    const b = el.getBoundingClientRect();
    dots.forEach((d, i) => {
      const [cx, cy] = center(d);
      if (Math.hypot(x - b.left - cx, y - b.top - cy) > 30 || seq.indexOf(i + 1) >= 0) return;
      // passing over a dot in the middle adds it too (like Android)
      const last = seq[seq.length - 1];
      if (last) {
        const r1 = Math.floor((last - 1) / 3), c1 = (last - 1) % 3, r2 = Math.floor(i / 3), c2 = i % 3;
        if ((r1 + r2) % 2 === 0 && (c1 + c2) % 2 === 0) { const mid = ((r1 + r2) / 2) * 3 + (c1 + c2) / 2 + 1; if (seq.indexOf(mid) < 0) seq.push(mid); }
      }
      seq.push(i + 1);
      if (navigator.vibrate) try { navigator.vibrate(12); } catch (e) {}
    });
  };
  el.onpointerdown = e => { e.preventDefault(); el.classList.remove('bad'); seq = []; drawing = true; try { el.setPointerCapture(e.pointerId); } catch (x) {} hit(e.clientX, e.clientY); const b = el.getBoundingClientRect(); cur = [e.clientX - b.left, e.clientY - b.top]; draw(); };
  el.onpointermove = e => { if (!drawing) return; hit(e.clientX, e.clientY); const b = el.getBoundingClientRect(); cur = [e.clientX - b.left, e.clientY - b.top]; draw(); };
  el.onpointerup = el.onpointercancel = () => { if (!drawing) return; drawing = false; cur = null; draw(); if (seq.length) onDone(seq.join('')); };
  return bad => { if (bad) { el.classList.add('bad'); setTimeout(() => { el.classList.remove('bad'); seq = []; draw(); }, 700); } else { seq = []; draw(); } };
}
function openSetPattern() {
  let first = '';
  const body = step => `<h3>✏️ ציור סיסמה</h3>
    <p class="muted small" style="margin-top:-6px">${step === 1 ? 'מציירים צורה שמחברת לפחות 4 נקודות. בטלפון הזה אפשר יהיה להיכנס עם הציור במקום להקליד קוד.' : 'מציירים שוב את אותה צורה, לאימות'}</p>
    ${patternPad('pat-set')}<div class="pinmsg" id="pat-msg"></div>
    <div class="actions"><button class="btn light" data-c="no">ביטול</button></div>`;
  const bind = (root, step) => {
    root.querySelector('[data-c=no]').onclick = closeModal;
    const reset = bindPattern(root.querySelector('#pat-set'), pat => {
      const msg = root.querySelector('#pat-msg');
      if (pat.length < 4) { msg.textContent = 'צריך לחבר לפחות 4 נקודות'; return reset(true); }
      if (step === 1) { first = pat; const sh = $('#modal-root .sheet'); sh.innerHTML = '<div class="grab"></div>' + body(2); bind(sh, 2); return; }
      if (pat !== first) { msg.textContent = 'הציור לא זהה – מתחילים מחדש'; first = ''; reset(true); setTimeout(() => { const sh = $('#modal-root .sheet'); if (sh) { sh.innerHTML = '<div class="grab"></div>' + body(1); bind(sh, 1); } }, 800); return; }
      MODAL = null; $('#modal-root').innerHTML = '';
      if (B.setPattern && B.setPattern(pat)) { LOCKWAY = ''; load(); toast('ציור הסיסמה נשמר ✏️🔒'); }
      else toast('לא נשמר – צריך להיכנס עם קוד ההורים');
    });
  };
  openModal(body(1), root => bind(root, 1));
}

function lockScreen() {
  const joining = S.me.unlocked === false;
  if (joining && !S.me.pinSet) {
    return `<div class="ob"><div class="logo">🔒</div><h1>קוד הורים</h1><div class="card">
      <p class="muted" style="margin-top:0">⏳ מחכים לנתוני המשפחה מהטלפונים האחרים… זה לוקח עד כמה דקות. צריך שלפחות טלפון אחד נוסף במשפחה יהיה דלוק ומחובר.</p>
      <div class="actions"><button class="btn light" data-lockreset="1">ביטול</button><button class="btn ghost" data-sync="1">🔄 לבדוק שוב</button></div></div></div>`;
  }
  return `<div class="ob">
    <div class="logo">🔒</div><h1>${joining ? 'קוד הורים' : 'כניסה למסך ההורים'}</h1>
    <div class="card">
      ${!joining && S.me.pattern && LOCKWAY !== 'pin' ? `<p class="muted center" style="margin:0">שלום ${esc(S.me.name)} 👋 מציירים את הסיסמה</p>
        ${patternPad('pat-in')}<div class="pinmsg" id="pin-msg">${pinWait() ? `יותר מדי ניסיונות. אפשר לנסות שוב בעוד ${pinWait()} שניות` : ''}</div>
        <button class="btn light block" data-lockway="pin">🔢 כניסה עם קוד הורים</button>`
      : `<p class="muted center" style="margin:0">${joining ? 'הטלפון הזה הצטרף למשפחה כהורה. מקלידים את קוד ההורים כדי להמשיך.' : `שלום ${esc(S.me.name)} 👋 מקלידים את קוד ההורים`}</p>
      ${pinPad()}
      ${!joining && S.me.pattern ? '<button class="btn light block" style="margin-top:12px" data-lockway="pattern">✏️ כניסה עם ציור סיסמה</button>' : ''}`}
      ${!joining && S.me.bio ? `<button class="btn ghost block" style="margin-top:12px" data-bio="1">👆 כניסה בטביעת אצבע / פנים</button>` : ''}
      ${joining ? `<div class="actions"><button class="btn light" data-lockreset="1">זה לא הורה</button></div>` : ''}
    </div>
    <p class="small center" style="opacity:.85">🛡️ אחרי 5 ניסיונות שגויים הטלפון מחכה לפני ניסיון נוסף</p></div>`;
}
function bindPinPad(onOk) {
  document.querySelectorAll('[data-pk]').forEach(b => b.onclick = () => {
    const k = b.dataset.pk;
    if (k === 'del') PINBUF = PINBUF.slice(0, -1);
    else if (k === 'ok') return onOk(PINBUF);
    else if (PINBUF.length < 8) PINBUF += k;
    const dots = $('.pindots');
    if (dots) dots.outerHTML = `<div class="pindots">${Array.from({ length: Math.max(4, PINBUF.length) }, (_, i) => `<i class="${i < PINBUF.length ? 'on' : ''}"></i>`).join('')}</div>`;
  });
}
function bindLock() {
  clearInterval(waitTimer);
  if (pinWait()) waitTimer = setInterval(() => { const m = $('#pin-msg'); const w = pinWait();
    if (m) m.textContent = w ? `יותר מדי ניסיונות. אפשר לנסות שוב בעוד ${w} שניות` : ''; if (!w) clearInterval(waitTimer); }, 1000);
  bindPinPad(pin => {
    if (pinWait()) return;
    if (!pin) return;
    if (B.unlockPin(pin)) { PINBUF = ''; toast('ברוכים הבאים 👋'); load(); return; }
    PINBUF = '';
    render();
    const m = $('#pin-msg');
    if (m && !pinWait()) m.textContent = 'קוד לא נכון';
  });
  const pat = $('#pat-in');
  if (pat) {
    const reset = bindPattern(pat, p => {
      if (pinWait()) return reset(true);
      if (B.unlockPattern && B.unlockPattern(p)) { toast('ברוכים הבאים 👋'); load(); return; }
      reset(true);
      const m = $('#pin-msg');
      if (m) m.textContent = pinWait() ? `יותר מדי ניסיונות. אפשר לנסות שוב בעוד ${pinWait()} שניות` : 'הציור לא נכון';
    });
  }
  document.querySelectorAll('[data-lockway]').forEach(b => b.onclick = () => { LOCKWAY = b.dataset.lockway === 'pin' ? 'pin' : ''; PINBUF = ''; render(); });
  const bio = $('[data-bio]');
  if (bio) bio.onclick = () => B.bio && B.bio();
  if (bio && !BIO_ASKED && S.me.session === false) { BIO_ASKED = true; setTimeout(() => B.bio && B.bio(), 300); }
  const s = $('[data-sync]'); if (s) s.onclick = () => { B.syncNow(); toast('בודק…'); setTimeout(load, 4000); };
  const r = $('[data-lockreset]'); if (r) r.onclick = () => { S = JSON.parse(B.reset()); OB = { step: 1 }; PINBUF = ''; render(); };
}
/** A parent's phone without a family PIN: setting one is required before anything else. */
function forcePinScreen() {
  return `<div class="ob">
    <div class="logo">🛡️</div><h1>קוד הורים</h1>
    <p>לפני שמתחילים – קוד סודי שרק ההורים יודעים</p>
    <div class="card">
      <div class="small muted" style="margin-bottom:6px">הקוד שומר שרק הורים יוכלו לאשר משימות, לתת או להוריד נקודות ולשנות משימות. הוא נדרש בכל כניסה למסך ההורים ובהצטרפות של הורה נוסף. לא לספר לילדים 🤫</div>
      <label class="f">קוד חדש (4–8 ספרות)</label><input class="in time" id="fp-1" type="password" inputmode="numeric" maxlength="8" autocomplete="off">
      <label class="f">שוב, לאימות</label><input class="in time" id="fp-2" type="password" inputmode="numeric" maxlength="8" autocomplete="off">
      <div class="hint">💡 לא 1234, לא 0000 ולא תאריך לידה של הילדים</div>
      <div class="actions"><button class="btn light" data-fpback="1">זה טלפון של ילד/ה</button><button class="btn" data-fpok="1">שמירה 🔒</button></div>
    </div></div>`;
}
function bindForcePin() {
  $('[data-fpok]').onclick = () => {
    const a = val('#fp-1').trim(), b = val('#fp-2').trim();
    if (!/^\d{4,8}$/.test(a)) return toast('הקוד צריך להיות 4 עד 8 ספרות');
    if (weakPin(a)) return toast('הקוד קל מדי לניחוש – בוחרים קוד אחר');
    if (a !== b) return toast('שני הקודים לא זהים');
    if (B.setPin(a, '')) { toast('קוד ההורים נשמר 🔒'); load(); }
    else toast('לא הצלחתי לשמור');
  };
  $('[data-fpback]').onclick = () => confirmBox('לצאת ולהתחיל מחדש?', 'אפשר להצטרף שוב כילד/ה עם קוד המשפחה.', 'כן', () => {
    S = JSON.parse(B.reset()); OB = { step: 1 }; TAB = 'today'; render();
  });
}
function securityCard() {
  const mins = [1, 5, 15];
  return `<div class="sec-title"><h2>🛡️ אבטחה וכניסה</h2></div>
    <div class="card">
      <div class="secrow"><div class="st"><b>קוד הורים ${S.me.pinSet ? '✅' : '⚠️'}</b><span>נדרש לכניסה למסך ההורים, להצטרפות הורה נוסף ולהוצאת טלפון של ילד</span></div>
        <button class="btn light small" data-setpin="1">${S.me.pinSet ? 'שינוי' : 'לקבוע'}</button></div>
      <div class="secrow"><div class="st"><b>נעילת האפליקציה</b><span>${S.me.lockOn ? 'דורש קוד כשחוזרים לאפליקציה' : 'כבוי – כל מי שמחזיק את הטלפון יכול לאשר משימות'}</span></div>
        <button class="toggle ${S.me.lockOn ? 'on' : ''}" data-lockon="1" aria-label="נעילת האפליקציה"></button></div>
      ${S.me.lockOn ? `<div class="secrow"><div class="st"><b>לנעול אחרי</b><span>זמן מחוץ לאפליקציה</span></div>
        <div class="seg" style="flex:none">${mins.map(m => `<button class="${(S.me.lockMin || 1) === m ? 'on' : ''}" data-lockmin="${m}">${m} דק׳</button>`).join('')}</div></div>` : ''}
      ${S.me.lockOn ? `<div class="secrow"><div class="st"><b>✏️ ציור סיסמה</b><span>${S.me.pattern ? 'מוגדר – נכנסים בציור במקום קוד (רק בטלפון הזה)' : 'במקום להקליד קוד – מציירים צורה על 9 נקודות'}</span></div>
        <div style="display:flex;gap:6px;flex:none">${S.me.pattern ? '<button class="btn danger small" data-patoff="1">להסיר</button>' : ''}<button class="btn light small" data-patset="1">${S.me.pattern ? 'לשנות' : 'לקבוע'}</button></div></div>` : ''}
      ${S.me.bioAvail && S.me.lockOn ? `<div class="secrow"><div class="st"><b>👆 טביעת אצבע / פנים</b><span>רק אם אין בטלפון הזה טביעת אצבע של אחד הילדים</span></div>
        <button class="toggle ${S.me.bio ? 'on' : ''}" data-bioset="1" aria-label="טביעת אצבע"></button></div>` : ''}
      ${S.me.lockOn ? `<button class="btn ghost block" style="margin-top:10px" data-locknow="1">🔒 לנעול עכשיו</button>` : ''}
    </div>
    <div class="card small muted">🛡️ <b style="color:var(--ink)">מה עוד מוגן:</b> הסנכרון בין הטלפונים מוצפן (AES-256) עם קוד המשפחה · אחרי 5 קודים שגויים הטלפון מחכה · טלפון של ילד לא יכול לאשר משימות, לתת לעצמו נקודות, לשנות נקודות של משימה או לשנות הגדרות של ההורים – גם אם מנסים לעקוף את המסך, השינוי נדחה בכל הטלפונים.</div>`;
}
function pinModal(title, text, onOk, needOld) {
  openModal(`<h3>${esc(title)}</h3><p class="muted small">${esc(text)}</p>
    ${needOld === true ? `<label class="f">הקוד הנוכחי</label><input class="in time" id="pin-old" type="password" inputmode="numeric" maxlength="8">` : ''}
    <label class="f">${needOld === 'check' ? 'קוד הורים' : 'קוד חדש (4–8 ספרות)'}</label><input class="in time" id="pin-new" type="password" inputmode="numeric" maxlength="8">
    ${needOld === 'check' ? '' : `<label class="f">שוב, לאימות</label><input class="in time" id="pin-new2" type="password" inputmode="numeric" maxlength="8">`}
    <div class="actions"><button class="btn light" data-c="no">ביטול</button><button class="btn" data-c="yes">אישור</button></div>`, root => {
    root.querySelector('[data-c=no]').onclick = closeModal;
    root.querySelector('[data-c=yes]').onclick = () => {
      if (pinWait()) return toast(`יותר מדי ניסיונות. לנסות שוב בעוד ${pinWait()} שניות`);
      const o = root.querySelector('#pin-old'), n = root.querySelector('#pin-new').value, n2 = root.querySelector('#pin-new2');
      if (n2 && n !== n2.value) return toast('שני הקודים לא זהים');
      onOk(n, o ? o.value : '');
    };
  });
}
function openSetPin() {
  pinModal(S.me.pinSet ? 'שינוי קוד הורים' : 'קביעת קוד הורים',
    'הקוד נדרש בכניסה למסך ההורים, כשמצטרפים למשפחה כהורה, וכשרוצים להוציא טלפון של ילד מהמשפחה. לא לספר אותו לילדים 🤫',
    (n, o) => {
      if (!/^\d{4,8}$/.test(n)) return toast('הקוד צריך להיות 4 עד 8 ספרות');
      if (weakPin(n)) return toast('הקוד קל מדי לניחוש – בוחרים קוד אחר');
      if (B.setPin(n, o)) { MODAL = null; $('#modal-root').innerHTML = ''; load(); toast('קוד ההורים נשמר 🔒'); }
      else toast(pinWait() ? `יותר מדי ניסיונות. לנסות שוב בעוד ${pinWait()} שניות` : S.me.pinSet ? 'הקוד הנוכחי לא נכון' : 'לא הצלחתי לשמור');
    }, S.me.pinSet ? true : false);
}

// ---------- the parent decides the points ----------
/** − [number] + and quick choices; v may be minus (taking points off). */
function stepperHtml(v, quick) {
  return `<div class="stepper"><button type="button" data-st="-1" aria-label="פחות">−</button>
      <input class="in num" id="f-pts" type="number" inputmode="numeric" min="-999" max="999" step="1" value="${v}">
      <button type="button" data-st="1" aria-label="יותר">+</button></div>
    <div class="ptsays" id="f-says"></div>
    <div class="opts quick" style="justify-content:center">${quick.map(q => `<button type="button" data-q="${q}">${q > 0 ? '‎+' + q : q < 0 ? '‎' + q : '0'}</button>`).join('')}</div>`;
}
function bindStepper(root, says) {
  const inp = root.querySelector('#f-pts');
  const upd = () => {
    const n = parseInt(inp.value, 10);
    const el = root.querySelector('#f-says');
    root.querySelectorAll('[data-q]').forEach(b => b.classList.toggle('on', +b.dataset.q === n));
    if (isNaN(n)) { el.textContent = ''; return; }
    el.className = 'ptsays ' + (n > 0 ? 'pos' : n < 0 ? 'neg' : 'zero');
    el.textContent = says(n);
  };
  root.querySelectorAll('[data-st]').forEach(b => b.onclick = () => { inp.value = Math.max(-999, Math.min(999, (parseInt(inp.value, 10) || 0) + (+b.dataset.st))); upd(); });
  root.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { inp.value = b.dataset.q; upd(); });
  inp.oninput = upd;
  upd();
  return () => { const v = String(inp.value).trim(); return /^-?\d{1,3}$/.test(v) ? parseInt(v, 10) : null; };
}
const halfUp = n => Math.max(1, Math.ceil(n / 2));
function saysFor(n) {
  return n > 0 ? `${kidName()} ${G('תקבל', 'יקבל')} ‎+${n}⭐` : n < 0 ? `ירדו ל${kidName()} ${-n}⭐` : 'בלי נקודות – לא נותנים ולא מורידים';
}
function decideModal(id) {
  const l = item(id);
  if (!l || l.status !== 'pending') return;
  const t = S.items[l.ref];
  const base = t ? (t.pts || 5) : Math.max(1, l.claim || 5);
  const late = !!l.late;
  const v = late ? 0 : (l.claim != null ? l.claim : base);
  const quick = late ? [-base, -halfUp(base), 0, halfUp(base), base] : [0, halfUp(base), base, base + halfUp(base), base * 2];
  openModal(`<h3>${late ? '⏰ ' : '✅ '}${esc(l.title)}</h3>
    <div class="decide-head"><div style="flex:1">
      <div class="small muted">${esc(kidName())} ${G('סימנה', 'סימן')} בוצע ב-${tHM(l.at)}${t ? ' · המשימה שווה ' + base + '⭐' : ''}</div>${catChip(t)}</div>
      ${l.photo ? `<div class="thumbwrap" data-photo="${esc(l.id)}"></div>` : ''}</div>
    ${late ? `<div class="latebox">⏰ סומן <b>באיחור${l.lateMin ? ' של ' + dur(l.lateMin * 60000) : ''}</b> – לכן אין נקודות אוטומטיות. אתם מחליטים: לתת נקודות, לא לתת, או להוריד – וכמה.</div>`
      : `<div class="hint">סומן בזמן. אפשר לאשר כמו שזה, או להוסיף / להוריד נקודות.</div>`}
    <label class="f">כמה נקודות?</label>
    ${stepperHtml(v, quick)}
    <div class="actions"><button class="btn light" data-c="back">לא אושר ↩️</button><button class="btn mint" data-c="ok">לאשר ✅</button></div>
    <div class="small muted center" style="margin-top:8px">"לא אושר" מחזיר את המשימה – אפשר לבצע ולסמן שוב</div>`, root => {
    fillPhotos();
    const read = bindStepper(root, saysFor);
    root.querySelector('[data-c=back]').onclick = () => {
      MODAL = null; $('#modal-root').innerHTML = '';
      if (B.decide) B.decide(id, false, 0); else B.action('reject', id, '');
      load(); toast(G('הוחזר אליה – היא יכולה לבצע ולסמן שוב', 'הוחזר אליו – הוא יכול לבצע ולסמן שוב'));
    };
    root.querySelector('[data-c=ok]').onclick = () => {
      const n = read();
      if (n == null) return toast('נקודות: מספר שלם בין ‎-999 ל-999');
      MODAL = null; $('#modal-root').innerHTML = '';
      const ok = B.decide ? B.decide(id, true, n) : B.action('approve', id, '') > 0;
      load();
      if (!ok) return toast('לא נשמר – צריך להיכנס עם קוד ההורים');
      if (n > 0) { confetti(); toast(`אושר ✅ ${kidName()} ${G('קיבלה', 'קיבל')} ‎+${n}⭐`); }
      else toast(n < 0 ? `אושר · ירדו ${-n}⭐` : 'אושר · בלי נקודות');
    };
  });
}
function adjustModal(id) {
  const l = item(id);
  if (!l) return;
  const t = S.items[l.ref];
  const base = t ? (t.pts || 5) : 5;
  const cur = l.pts || 0;
  const quick = [-base, -halfUp(base), 0, halfUp(base), base];
  openModal(`<h3>✏️ נקודות: ${esc(l.title)}</h3>
    <div class="small muted">${l.type === 'task_missed' ? 'סומן "לא בוצע"' : 'אושר'}${l.late ? ' · סומן באיחור' : ''} · עכשיו ${ptsPill(cur)}${l.adjBy ? ' · עודכן ע״י ' + esc(l.adjBy) : ''}</div>
    <label class="f">כמה נקודות במקום?</label>
    ${stepperHtml(cur, quick)}
    <div class="actions"><button class="btn light" data-c="no">ביטול</button><button class="btn" data-c="ok">שמירה</button></div>`, root => {
    const read = bindStepper(root, saysFor);
    root.querySelector('[data-c=no]').onclick = closeModal;
    root.querySelector('[data-c=ok]').onclick = () => {
      const n = read();
      if (n == null) return toast('נקודות: מספר שלם בין ‎-999 ל-999');
      MODAL = null; $('#modal-root').innerHTML = '';
      const ok = B.adjust ? B.adjust(id, n) : false;
      load();
      toast(ok ? 'הנקודות עודכנו ✏️' : 'לא נשמר – צריך להיכנס עם קוד ההורים');
    };
  });
}

// ---------- onboarding ----------
function onboarding() {
  if (OB.step === 1) {
    return `<div class="ob">
      <div class="logo">⏰</div><h1>בזמן</h1>
      <p>קמים בזמן, יוצאים בזמן, אוספים נקודות ⭐</p>
      <button class="card choice" data-role="parent"><span class="e">👨‍👩‍👧</span><span>אני הורה<small>מנהלים את הלו״ז ומקבלים עדכונים</small></span></button>
      <button class="card choice" data-role="child"><span class="e">🧒</span><span>אני ילד/ה<small>השעון המעורר, התזכורות והנקודות שלי</small></span></button>
    </div>`;
  }
  const parent = OB.role === 'parent';
  const mode = OB.mode || (parent ? 'new' : 'join');
  return `<div class="ob">
    <div class="logo">${parent ? '👨‍👩‍👧' : '🧒'}</div>
    <div class="card">
      <label class="f" style="margin-top:0">איך קוראים לך?</label>
      <input class="in" id="ob-name" placeholder="${parent ? 'למשל: אבא / אמא' : 'השם שלך'}" value="${esc(OB.name || '')}">
      ${parent ? '' : `<label class="f">אני</label>
      <div class="seg"><button class="${OB.gender !== 'm' ? 'on' : ''}" data-gender="f">בת 👧</button><button class="${OB.gender === 'm' ? 'on' : ''}" data-gender="m">בן 👦</button></div>
      <label class="f">הצבעים שלי</label>
      <div class="theme-pick">${themeButtons(OB.theme, t => `data-obtheme="${t}"`)}</div>`}
      <label class="f">משפחה</label>
      <div class="seg"><button class="${mode === 'new' ? 'on' : ''}" data-mode="new">משפחה חדשה</button><button class="${mode === 'join' ? 'on' : ''}" data-mode="join">יש לי קוד</button></div>
      ${mode === 'join' ? `<label class="f">קוד המשפחה</label><input class="in" id="ob-code" dir="ltr" style="text-align:center;letter-spacing:2px;font-weight:800" placeholder="XXXXX-XXXXX" value="${esc(OB.code || '')}">
        <div class="hint">את הקוד מוצאים אצל מי שכבר מחובר: הגדרות ← קוד המשפחה</div>`
        : `<div class="hint">נוצר קוד חדש. אחרי זה שולחים אותו בוואטסאפ ל${parent ? 'ילדים ולבן/בת הזוג' : 'הורים'}.</div>`}
      <div class="actions"><button class="btn light" data-ob-back="1">חזרה</button><button class="btn" data-ob-go="1">יאללה! 🚀</button></div>
    </div></div>`;
}
function bindOnboarding() {
  document.querySelectorAll('[data-role]').forEach(b => b.onclick = () => { OB = { step: 2, role: b.dataset.role, gender: 'f', theme: 'purple' }; render(); });
  document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { OB.name = val('#ob-name'); OB.code = val('#ob-code'); OB.mode = b.dataset.mode; render(); });
  document.querySelectorAll('[data-gender]').forEach(b => b.onclick = () => {
    OB.name = val('#ob-name'); OB.code = val('#ob-code'); OB.gender = b.dataset.gender;
    if (!OB.themeTouched) OB.theme = OB.gender === 'm' ? 'yb' : 'purple';
    render();
  });
  document.querySelectorAll('[data-obtheme]').forEach(b => b.onclick = () => {
    OB.name = val('#ob-name'); OB.code = val('#ob-code'); OB.theme = b.dataset.obtheme; OB.themeTouched = true; render();
  });
  const back = $('[data-ob-back]'); if (back) back.onclick = () => { OB = { step: 1 }; render(); };
  const go = $('[data-ob-go]');
  if (go) go.onclick = () => {
    const name = val('#ob-name').trim();
    const mode = OB.mode || (OB.role === 'parent' ? 'new' : 'join');
    if (!name) return toast('צריך לכתוב שם 🙂');
    let code = mode === 'new' ? B.newCode() : val('#ob-code').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (code.length !== 10) return toast('הקוד צריך להיות 10 תווים');
    S = JSON.parse(B.setup2 ? B.setup2(OB.role, name, code, OB.gender || 'f', OB.theme || 'purple') : B.setup(OB.role, name, code));
    if (OB.role === 'parent' && mode === 'join' && B.lockParent) { B.lockParent(); S = JSON.parse(B.state()); }
    TAB = mode === 'new' && OB.role === 'parent' ? 'settings' : 'today';
    render();
    if (mode === 'new') toast('המשפחה נוצרה! עכשיו שולחים את הקוד');
    else toast('מחוברים! הנתונים יגיעו תוך כמה דקות');
  };
}
const val = sel => { const e = $(sel); return e ? e.value : ''; };

// ---------- events ----------
function bindCommon() {
  if (typeof bindCalendar === 'function') bindCalendar();
  document.querySelectorAll('[data-design]').forEach(b => b.onclick = openDesign);
  document.querySelectorAll('[data-kthemes]').forEach(b => b.onclick = () => openThemes(kidInfo().theme, t => {
    if (B.setProfile) { S = JSON.parse(B.setProfile('', t)); render(); toast('העיצוב הוחלף 🎨'); }
  }));
  document.querySelectorAll('[data-mic]').forEach(b => b.onclick = () => startVoice('new'));
  document.querySelectorAll('[data-rep]').forEach(b => b.onclick = () => { REP = b.dataset.rep; render(); });
  document.querySelectorAll('[data-kidtheme]').forEach(b => b.onclick = () => {
    const [kid, theme] = b.dataset.kidtheme.split('|');
    save({ id: 'kt:' + kid, kind: 'config', kid, theme });
    toast('הצבעים עודכנו 🎨');
  });
  document.querySelectorAll('[data-kid]').forEach(b => b.onclick = () => {
    KID = b.dataset.kid;
    try { localStorage.setItem('bz-kid', KID); } catch (e) {}
    render();
  });
  document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { TAB = b.dataset.tab; render(); window.scrollTo(0, 0); });
  document.querySelectorAll('[data-sync]').forEach(b => b.onclick = () => { B.syncNow(); toast('מסנכרן…'); });
  document.querySelectorAll('[data-nettest]').forEach(b => b.onclick = () => { if (B.netTest) B.netTest(); else toast('צריך לעדכן גרסה'); });
  document.querySelectorAll('[data-done]').forEach(b => b.onclick = (e) => {
    e.stopPropagation();
    const t = item(b.dataset.done), occ = b.dataset.occ;
    if (!t) return;
    if (t.photo) {
      openModal(`<h3>📷 צריך תמונה</h3><p class="muted">כדי לסמן "${esc(t.title)}" כבוצע, מצלמים או בוחרים תמונה. היא תישלח להורים לאישור.</p>
        <div class="actions"><button class="btn" data-pm="camera">📸 לצלם</button><button class="btn light" data-pm="gallery">🖼️ מהגלריה</button></div>`, root => {
        root.querySelectorAll('[data-pm]').forEach(x => x.onclick = () => { MODAL = null; $('#modal-root').innerHTML = ''; B.takePhoto(t.id, occ, x.dataset.pm); render(); });
      });
      return;
    }
    const pts = B.action('task', t.id, occ);
    load();
    if (pts > 0) { if (!S.celebrate) confetti(); toast(`נשלח להורים לאישור 💌 \u200E+${pts}⭐ אחרי אישור`); }
    else if (pts === 0) toast('נשלח להורים 💌 סימנת אחרי הזמן – ההורים יחליטו על הנקודות');
  });
  document.querySelectorAll('[data-notdone]').forEach(b => b.onclick = (e) => {
    e.stopPropagation();
    const t = item(b.dataset.notdone), occ = b.dataset.occ;
    if (!t) return;
    confirmBox(`לסמן "${t.title}" כלא בוצע?`, `יורדות ${penalty(t)} ⭐ (חצי מהנקודות של המשימה). ההורים יקבלו עדכון.`, 'כן, לא בוצע', () => {
      B.action('missed', t.id, occ);
      load();
      toast(`סומן לא בוצע · \u200E-${penalty(t)}⭐`);
    }, true);
  });
  document.querySelectorAll('[data-decide]').forEach(b => b.onclick = (e) => { e.stopPropagation(); decideModal(b.dataset.decide); });
  document.querySelectorAll('[data-adjust]').forEach(b => b.onclick = (e) => { e.stopPropagation(); adjustModal(b.dataset.adjust); });
  document.querySelectorAll('[data-lockon]').forEach(b => b.onclick = () => {
    if (!B.setLock) return toast('צריך לעדכן גרסה');
    const on = !S.me.lockOn;
    B.setLock(on, S.me.lockMin || 1);
    load(); toast(on ? 'נעילת האפליקציה הופעלה 🔒' : 'נעילת האפליקציה כובתה');
  });
  document.querySelectorAll('[data-lockmin]').forEach(b => b.onclick = () => { B.setLock(true, +b.dataset.lockmin); load(); });
  document.querySelectorAll('[data-bioset]').forEach(b => b.onclick = () => { B.setBio(!S.me.bio); load(); toast(!S.me.bio ? 'כניסה בטביעת אצבע כובתה' : 'אפשר להיכנס בטביעת אצבע 👆'); });
  document.querySelectorAll('[data-patset]').forEach(b => b.onclick = () => B.setPattern ? openSetPattern() : toast('צריך לעדכן גרסה'));
  document.querySelectorAll('[data-patoff]').forEach(b => b.onclick = () => confirmBox('להסיר את ציור הסיסמה?', 'הכניסה תהיה שוב עם קוד ההורים.', 'כן, להסיר', () => {
    B.clearPattern(); load(); toast('ציור הסיסמה הוסר');
  }, true));
  document.querySelectorAll('[data-tabonoff]').forEach(b => b.onclick = () => {
    const off = toggleTab(b.dataset.tabonoff);
    render(); toast(off ? `המסך "${TABS_ALL[b.dataset.tabonoff][1]}" נסגר` : `המסך "${TABS_ALL[b.dataset.tabonoff][1]}" חזר`);
  });
  document.querySelectorAll('[data-locknow]').forEach(b => b.onclick = () => { PINBUF = ''; B.lockNow(); setTimeout(load, 50); });
  document.querySelectorAll('[data-approve],[data-reject]').forEach(b => b.onclick = (e) => {
    e.stopPropagation();
    const ok = !!b.dataset.approve;
    const id = b.dataset.approve || b.dataset.reject;
    const l = item(id);
    B.action(ok ? 'approve' : 'reject', id, '');
    load();
    if (ok) { confetti(); toast(`אושר ✅ ${kidName()} ${G('קיבלה', 'קיבל')} \u200E+${l ? l.claim || 0 : 0}⭐`); }
    else toast(G('הוחזר אליה – היא יכולה לבצע ולסמן שוב', 'הוחזר אליו – הוא יכול לבצע ולסמן שוב'));
  });
  document.querySelectorAll('[data-live]').forEach(b => b.onclick = () => {
    const on = !S.me.live;
    B.setLive(on);
    load();
    toast(on ? 'עדכונים מיידיים הופעלו ⚡' : 'עדכונים כל רבע שעה');
  });
  document.querySelectorAll('[data-act]').forEach(b => b.onclick = (e) => {
    e.stopPropagation();
    const pts = B.action(b.dataset.act, b.dataset.ref, b.dataset.occ);
    load();
    if (pts > 0) { if (!S.celebrate) confetti(); toast((b.dataset.act === 'left' ? 'יצאת! 🚀' : 'סיימת! 💪') + ` \u200E+${pts} ⭐`); }
  });
  document.querySelectorAll('[data-new]').forEach(b => b.onclick = () => openEditor(b.dataset.new, null));
  document.querySelectorAll('[data-edit]').forEach(b => b.onclick = (e) => {
    if (e.target.closest('[data-toggle],button,.thumbwrap')) return;
    const it = item(b.dataset.edit); if (it) openEditor(it.kind, it);
  });
  document.querySelectorAll('[data-toggle]').forEach(b => b.onclick = (e) => {
    e.stopPropagation();
    const it = Object.assign({}, item(b.dataset.toggle));
    it.on = it.on === false;
    save(it);
    toast(it.on ? 'השעון הופעל ⏰' : 'השעון כובה');
  });
  document.querySelectorAll('[data-redeem]').forEach(b => b.onclick = () => {
    const r = Object.assign({}, item(b.dataset.redeem));
    r.status = b.dataset.st;
    save(r);
    if (r.status === 'approved') confetti();
  });
  document.querySelectorAll('[data-want]').forEach(b => b.onclick = () => {
    const r = item(b.dataset.want);
    confirmBox(`לממש "${r.title}"?`, `${r.cost} ⭐ יורדות, וההורים יקבלו בקשה לאשר`, 'כן, לממש! 🎁', () => {
      save({ id: uid('rd'), kind: 'redeem', reward: r.id, title: r.title, cost: r.cost, status: 'pending', at: Date.now() });
      confetti(); toast('הבקשה נשלחה להורים 💌');
    });
  });
  document.querySelectorAll('[data-share]').forEach(b => b.onclick = shareCode);
  document.querySelectorAll('[data-fix]').forEach(b => b.onclick = () => B.fixPerm(b.dataset.fix));
  document.querySelectorAll('[data-test]').forEach(b => b.onclick = () => { B.testAlarm(); toast('השעון יצלצל בעוד 10 שניות – אפשר לנעול את המסך'); });
  document.querySelectorAll('[data-settheme]').forEach(b => b.onclick = () => { if (B.setProfile) { S = JSON.parse(B.setProfile('', b.dataset.settheme)); render(); } });
  document.querySelectorAll('[data-setgender]').forEach(b => b.onclick = () => { if (B.setProfile) { S = JSON.parse(B.setProfile(b.dataset.setgender, '')); render(); } });
  document.querySelectorAll('[data-ring]').forEach(b => b.onclick = () => B.pickRingtone && B.pickRingtone());
  document.querySelectorAll('[data-song]').forEach(b => b.onclick = () => B.pickSong && B.pickSong());
  document.querySelectorAll('[data-preview]').forEach(b => b.onclick = () => { if (B.previewRingtone) { B.previewRingtone(); toast('🎵 משמיע 5 שניות'); } });
  document.querySelectorAll('[data-update]').forEach(b => b.onclick = () => S.fromPlay ? playUpdate() : (B.openUpdate ? B.openUpdate() : B.openUrl(S.apk)));
  document.querySelectorAll('[data-devdel]').forEach(b => b.onclick = () => {
    const d = item(b.dataset.devdel);
    if (!d) return;
    confirmBox(`להסיר את השורה "${d.name}"?`, 'זו שורה ישנה מהתקנה קודמת. אם הטלפון הזה עוד פעיל, הוא יחזור לרשימה לבד.', 'כן, להסיר', () => {
      const dev = d.id.slice(3), m = item('m_' + dev);
      save([Object.assign({}, d, { del: true })].concat(m && m.role !== 'child' ? [Object.assign({}, m, { del: true })] : []));
      toast('הוסר 🧹');
    }, true);
  });
  document.querySelectorAll('[data-playlink]').forEach(b => b.onclick = () => {
    const cur = item('cfg') || { id: 'cfg', kind: 'config' };
    openModal(`<h3>🔗 קישור ההצטרפות מ-Google Play</h3>
      <p class="muted small">מעתיקים מ-Play Console: בדיקה פנימית ← בודקים ← "העתקת הקישור". מדביקים כאן, ומעכשיו כפתור השליחה בוואטסאפ ישלח את הקישור הזה במקום קובץ ההתקנה.</p>
      <input class="in" id="f-link" dir="ltr" placeholder="https://play.google.com/apps/internaltest/..." value="${esc(cur.playLink || '')}">
      <div class="actions"><button class="btn light" data-c="no">ביטול</button><button class="btn" data-save="1">שמירה</button></div>`, root => {
      root.querySelector('[data-c=no]').onclick = closeModal;
      root.querySelector('[data-save]').onclick = () => {
        const link = root.querySelector('#f-link').value.trim();
        if (link && !/^https:\/\/play\.google\.com\//.test(link)) return toast('הקישור צריך להתחיל ב-https://play.google.com/');
        MODAL = null; $('#modal-root').innerHTML = '';
        save(Object.assign({}, cur, { playLink: link }));
        toast(link ? 'נשמר ✅' : 'הקישור נמחק');
      };
    });
  });
  document.querySelectorAll('[data-setpin]').forEach(b => b.onclick = openSetPin);
  document.querySelectorAll('[data-reset]').forEach(b => b.onclick = () => (S.me.pinSet && B.checkPin) ? pinModal('יציאה מהמשפחה', 'צריך קוד הורים כדי לצאת מהמשפחה.', (n) => {
    if (!B.checkPin(n)) return toast('קוד לא נכון');
    MODAL = null; $('#modal-root').innerHTML = '';
    S = JSON.parse(B.reset()); OB = { step: 1 }; TAB = 'today'; render();
  }, 'check') : confirmBox('לצאת מהמשפחה?', 'כל הנתונים בטלפון הזה יימחקו. אפשר להצטרף שוב עם הקוד.', 'כן, לצאת', () => {
    S = JSON.parse(B.reset()); OB = { step: 1 }; TAB = 'today'; render();
  }, true));
}

/** Installed from Google Play: Play has only the versions uploaded there – explain the two ways. */
function playUpdate() {
  openModal(`<h3>📥 עדכון גרסה</h3>
    <p class="muted">"בזמן" בטלפון הזה הותקנה מ-<b>Google Play</b>. ב-Play מופיעות רק גרסאות שהועלו ל-Play, ולכן ייתכן שאין שם את הגרסה החדשה (${esc(newestVer())}).</p>
    <div class="hint">כדי לקבל את הגרסה החדשה עכשיו:<br>1. מוחקים את "בזמן" מהטלפון (הנתונים שמורים בטלפונים האחרים במשפחה)<br>2. מתקינים מהקישור (כפתור למטה)<br>3. פותחים, בוחרים ${isChild() ? 'ילד/ה ומקלידים בדיוק את אותו שם' : 'הורה ומקלידים את קוד ההורים'}, ו"יש לי קוד": ${fmtCode(S.me.code)}</div>
    <div class="actions"><button class="btn light" data-c="play">לבדוק ב-Play</button><button class="btn" data-c="apk">הורדה מהקישור</button></div>`, root => {
    root.querySelector('[data-c=play]').onclick = () => { closeModal(); B.openUpdate ? B.openUpdate() : B.openUrl(S.apk); };
    root.querySelector('[data-c=apk]').onclick = () => { closeModal(); B.openUrl(S.apk); };
  });
}

function shareCode() {
  // Always the direct install link: it always has the newest version (Play can lag behind for some phones)
  const txt = `⏰ הצטרפות לאפליקציה "בזמן"\n\n1. אם "בזמן" כבר מותקנת מ-Google Play – קודם מסירים אותה\n\n2. מורידים ומתקינים (הגרסה הכי חדשה):\n${S.apk}\n\n3. פותחים, בוחרים הורה או ילד/ה, ובוחרים "יש לי קוד"\n\n4. קוד המשפחה: ${fmtCode(S.me.code)}\n(ילד/ה: לכתוב בדיוק את אותו השם כמו קודם)`;
  B.share(txt);
}

// ---------- modal ----------
function openModal(html, bind) {
  MODAL = true;
  const root = $('#modal-root');
  root.innerHTML = `<div class="sheet-bg"><div class="sheet"><div class="grab"></div>${html}</div></div>`;
  root.querySelector('.sheet-bg').onclick = (e) => { if (e.target.classList.contains('sheet-bg')) closeModal(); };
  bind(root);
  root.querySelectorAll('[data-micin]').forEach(b => b.onclick = () => startVoice('title'));
}
function closeModal() {
  MODAL = null;
  $('#modal-root').innerHTML = '';
  render();
}
function confirmBox(title, text, yes, onYes, danger) {
  openModal(`<h3>${esc(title)}</h3><p class="muted">${esc(text)}</p>
    <div class="actions"><button class="btn light" data-c="no">ביטול</button><button class="btn ${danger ? 'danger' : 'mint'}" data-c="yes">${esc(yes)}</button></div>`, root => {
    root.querySelector('[data-c=no]').onclick = closeModal;
    root.querySelector('[data-c=yes]').onclick = () => { MODAL = null; $('#modal-root').innerHTML = ''; onYes(); render(); };
  });
}

function dayPicker(days) {
  return `<div class="daypick">${DAYS.map((d, i) => `<button type="button" class="${days.indexOf(i) >= 0 ? 'on' : ''}" data-day="${i}">${d}</button>`).join('')}</div>`;
}
function opts(name, values, cur, fmt) {
  return `<div class="opts" data-opts="${name}">${values.map(v => `<button type="button" class="${v === cur ? 'on' : ''}" data-v="${v}">${fmt ? fmt(v) : v}</button>`).join('')}</div>`;
}
/** Any whole number the parent wants, plus quick buttons. */
function numPick(id, cur, quick, fmt, min) {
  return `<div class="numpick"><input class="in num" id="${id}" type="number" inputmode="numeric" min="${min}" max="999" step="1" value="${cur}">
    <div class="opts quick" data-for="${id}">${quick.map(v => `<button type="button" class="${v === cur ? 'on' : ''}" data-q="${v}">${fmt(v)}</button>`).join('')}</div></div>`;
}
function bindNum(root) {
  root.querySelectorAll('.numpick').forEach(w => {
    const inp = w.querySelector('input');
    const mark = () => w.querySelectorAll('[data-q]').forEach(b => b.classList.toggle('on', +b.dataset.q === +inp.value && inp.value !== ''));
    w.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { inp.value = b.dataset.q; mark(); });
    inp.oninput = mark;
  });
}
/** Reads a whole number from a numPick; null if it is not a whole number in range. */
function readNum(root, id, min) {
  const v = String(root.querySelector('#' + id).value).trim();
  if (!/^\d{1,3}$/.test(v)) return null;
  const n = parseInt(v, 10);
  return n >= min && n <= 999 ? n : null;
}
function bindPick(root, draft) {
  root.querySelectorAll('[data-day]').forEach(b => b.onclick = () => {
    const i = +b.dataset.day;
    const k = draft.days.indexOf(i);
    if (k >= 0) draft.days.splice(k, 1); else draft.days.push(i);
    b.classList.toggle('on');
    if (draft._onChange) draft._onChange();
  });
  root.querySelectorAll('[data-opts]').forEach(g => g.querySelectorAll('button').forEach(b => b.onclick = () => {
    g.querySelectorAll('button').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    draft[g.dataset.opts] = +b.dataset.v;
    if (draft._onChange) draft._onChange();
  }));
  root.querySelectorAll('[data-seg]').forEach(b => b.onclick = () => {
    draft.mode = b.dataset.seg;
    root.querySelectorAll('[data-seg]').forEach(x => x.classList.toggle('on', x === b));
    root.querySelector('#f-days').style.display = draft.mode === 'repeat' ? '' : 'none';
    root.querySelector('#f-date').style.display = draft.mode === 'once' ? '' : 'none';
  });
}
function whenFields(draft) {
  return `<label class="f">מתי?</label>
    <div class="seg"><button type="button" class="${draft.mode === 'repeat' ? 'on' : ''}" data-seg="repeat">כל שבוע</button><button type="button" class="${draft.mode === 'once' ? 'on' : ''}" data-seg="once">פעם אחת</button></div>
    <div id="f-days" style="margin-top:10px;${draft.mode === 'repeat' ? '' : 'display:none'}">${dayPicker(draft.days)}</div>
    <div id="f-date" style="margin-top:10px;${draft.mode === 'once' ? '' : 'display:none'}"><input class="in" type="date" id="f-dateval" value="${esc(draft.date)}"></div>`;
}
function readWhen(root, draft, out) {
  if (draft.mode === 'once') {
    out.date = root.querySelector('#f-dateval').value;
    out.days = [];
    if (!out.date) { toast('צריך לבחור תאריך'); return false; }
  } else {
    out.date = '';
    out.days = draft.days.slice().sort();
    if (!out.days.length) { toast('צריך לבחור לפחות יום אחד'); return false; }
  }
  return true;
}

function openEditor(kind, it, pre) {
  const isNew = !it;
  const base = it ? JSON.parse(JSON.stringify(it)) : (pre ? JSON.parse(JSON.stringify(pre)) : {});
  if (kind === 'task' && isChild() && !isNew && it.by && it.by !== S.me.name) {
    toast('את המשימה הזו קבעו ההורים – רק הם יכולים לשנות אותה');
    return;
  }
  const del = isNew || (kind === 'task' && isChild()) ? '' : `<button class="btn danger" data-del="1">מחיקה</button>`;
  const today = occOf(new Date());

  if (kind === 'alarm') {
    const d = { days: base.days ? base.days.slice() : [0, 1, 2, 3, 4] };
    openModal(`<h3>${isNew ? 'שעון מעורר חדש' : 'עריכת שעון מעורר'}</h3>
      <input class="in time" type="time" id="f-time" value="${esc(base.time || '07:00')}">
      <label class="f">באילו ימים?</label>${dayPicker(d.days)}
      <label class="f">שם (לא חובה)</label><input class="in" id="f-label" placeholder="למשל: בית ספר" value="${esc(base.label || '')}">
      <div class="hint">🧠 כדי לכבות פותרים תרגיל חשבון קטן. נודניק אחד של 5 דקות מותר.${isChild() ? `<br>🎵 צלצול: ${esc(S.me.ringtone || 'ברירת המחדל')} (משנים בהגדרות)` : ''}</div>
      <div class="actions">${del}<button class="btn" data-save="1">שמירה</button></div>`, root => {
      bindPick(root, d);
      root.querySelector('[data-save]').onclick = () => {
        const time = root.querySelector('#f-time').value;
        if (mins(time) < 0) return toast('צריך לבחור שעה');
        if (!d.days.length) return toast('צריך לבחור לפחות יום אחד');
        const label = root.querySelector('#f-label').value.trim();
        MODAL = null; $('#modal-root').innerHTML = '';
        save(Object.assign(base, { id: base.id || uid('al'), kind: 'alarm', time, days: d.days.slice().sort(), label, on: base.on !== false }));
        toast('השעון נשמר ⏰');
      };
      bindDel(root, base);
    });
    return;
  }

  if (kind === 'event') {
    const d = { mode: base.date ? 'once' : 'repeat', days: base.days ? base.days.slice() : [], date: base.date || today,
      travel: base.travel != null ? base.travel : 15, prep: base.prep != null ? base.prep : 20 };
    openModal(`<h3>${isNew ? 'חוג / יציאה חדשה' : 'עריכה'}</h3>
      <label class="f" style="margin-top:0">מה?</label><div class="titlewrap"><input class="in" id="f-title" placeholder="למשל: חוג ריקוד" value="${esc(base.title || '')}"><button type="button" class="mic-in" data-micin="1">🎤</button></div>
      ${whenFields(d)}
      <label class="f">שעת התחלה</label><input class="in time" type="time" id="f-start" value="${esc(base.start || '16:30')}">
      <label class="f">כמה זמן הדרך?</label>${opts('travel', [0, 5, 10, 15, 20, 30, 45, 60], d.travel, v => v + ' דק׳')}
      <label class="f">כמה זמן להתארגן לפני?</label>${opts('prep', [0, 10, 15, 20, 30, 45], d.prep, v => v ? v + ' דק׳' : 'בלי')}
      <div class="hint" id="f-calc"></div>
      <div class="actions">${del}<button class="btn" data-save="1">שמירה</button></div>`, root => {
      const calc = () => {
        const s = mins(root.querySelector('#f-start').value);
        if (s < 0) return;
        const leave = s - d.travel, prep = leave - d.prep;
        const f = m => pad(Math.floor(((m % 1440) + 1440) % 1440 / 60)) + ':' + pad(((m % 60) + 60) % 60);
        root.querySelector('#f-calc').innerHTML = (d.prep >= 10 ? `🔔 ${f(prep)} – מתחילים להתארגן<br>` : '') +
          `🎒 ${f(leave - 5)} – עוד 5 דקות יוצאים<br>🚪 <b>${f(leave)} – יוצאים!</b>`;
      };
      d._onChange = calc;
      bindPick(root, d);
      root.querySelector('#f-start').oninput = calc;
      calc();
      root.querySelector('[data-save]').onclick = () => {
        const title = root.querySelector('#f-title').value.trim();
        const start = root.querySelector('#f-start').value;
        if (!title) return toast('צריך לכתוב מה');
        if (mins(start) < 0) return toast('צריך לבחור שעה');
        const out = {};
        if (!readWhen(root, d, out)) return;
        MODAL = null; $('#modal-root').innerHTML = '';
        save(Object.assign(base, out, { id: base.id || uid('ev'), kind: 'event', title, start, travel: d.travel, prep: d.prep }));
        toast('נשמר 🎒');
      };
      bindDel(root, base);
    });
    return;
  }

  if (kind === 'task') {
    const d = { mode: (base.days && base.days.length) ? 'repeat' : 'once', days: base.days ? base.days.slice() : [], date: base.date || today, pts: base.pts || 5, photo: base.photo ? 1 : 0,
      cat: catOf(base) || (isNew ? guessCat(base.title) : ''), catTouched: !!catOf(base) };
    const catBtns = () => CAT_ORDER.map(k => `<button type="button" data-cat="${k}" class="${d.cat === k ? 'on' : ''}" style="--cc:${CATS[k].c}"><span class="ce">${CATS[k].e}</span>${CATS[k].n}</button>`).join('');
    openModal(`<h3>${isNew ? 'משימה חדשה' : 'עריכת משימה'}</h3>
      <label class="f" style="margin-top:0">מה צריך לעשות?</label><div class="titlewrap"><input class="in" id="f-title" placeholder="למשל: שיעורי בית במתמטיקה" value="${esc(base.title || '')}"><button type="button" class="mic-in" data-micin="1">🎤</button></div>
      <label class="f">לאיזו קטגוריה זה שייך?</label><div class="catpick" id="f-cat">${catBtns()}</div>
      ${whenFields(d)}
      <label class="f">עד איזו שעה?</label><input class="in time" type="time" id="f-time" value="${esc(base.time || '20:00')}">
      ${isChild() ? `<div class="hint">⭐ ${isNew ? 'המשימה תהיה שווה' : 'המשימה שווה'} ${d.pts} נקודות. את הנקודות קובעים ההורים.</div>`
        : `<label class="f">כמה נקודות? (כל מספר)</label>${numPick('f-pts', d.pts, [1, 2, 3, 5, 7, 10, 15, 20], v => v + '⭐', 1)}
      <label class="f">📷 לבקש תמונה כשמסיימים?</label>${opts('photo', [0, 1], d.photo, v => v ? 'כן, עם תמונה' : 'בלי תמונה')}`}
      <div class="hint">🔔 תזכורת חצי שעה לפני ובזמן. "בוצע" נשלח להורים לאישור – בזמן = כל הנקודות (ההורים יכולים להוסיף או להוריד). <b>באיחור = 0 נקודות</b>, וההורים מחליטים אם לתת או להוריד, וכמה. "לא בוצע" (או בלי סימון עד סוף היום) = מינוס חצי.</div>
      ${!isNew && !isChild() ? '<div class="small muted" style="margin-top:8px">✏️ שינוי כאן חל מעכשיו והלאה. משימות שכבר סומנו שומרות על הנקודות שלהן (אפשר לשנות אותן במסך "היום").</div>' : ''}
      <div class="actions">${del}<button class="btn" data-save="1">שמירה</button></div>`, root => {
      bindPick(root, d);
      bindNum(root);
      const catBox = root.querySelector('#f-cat');
      const bindCats = () => catBox.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => {
        d.cat = b.dataset.cat; d.catTouched = true; catBox.classList.remove('need');
        catBox.innerHTML = catBtns(); bindCats();
      });
      bindCats();
      root.querySelector('#f-title').addEventListener('input', e => {
        if (d.catTouched) return;
        const g = guessCat(e.target.value);
        if (g && g !== d.cat) { d.cat = g; catBox.innerHTML = catBtns(); bindCats(); }
      });
      root.querySelector('[data-save]').onclick = () => {
        const title = root.querySelector('#f-title').value.trim();
        const time = root.querySelector('#f-time').value;
        if (!title) return toast('צריך לכתוב מה');
        if (mins(time) < 0) return toast('צריך לבחור שעה');
        let pts = base.pts || 5;
        if (!isChild()) {
          pts = readNum(root, 'f-pts', 1);
          if (pts == null) return toast('נקודות: מספר שלם בין 1 ל-999');
          if (!d.cat) { catBox.classList.add('need'); catBox.scrollIntoView({ block: 'center' }); return toast('צריך לבחור קטגוריה'); }
        }
        const out = {};
        if (!readWhen(root, d, out)) return;
        MODAL = null; $('#modal-root').innerHTML = '';
        const extra = isChild() ? { pts, photo: !!base.photo } : { pts, photo: !!d.photo };
        save(Object.assign(base, out, { id: base.id || uid('tk'), kind: 'task', title, time, cat: d.cat || 'other' }, extra));
        toast('המשימה נשמרה ✅');
      };
      bindDel(root, base);
    });
    return;
  }

  if (kind === 'reward') {
    openModal(`<h3>${isNew ? 'פרס חדש' : 'עריכת פרס'}</h3>
      <label class="f" style="margin-top:0">הפרס</label><input class="in" id="f-title" placeholder="למשל: גלידה / שעה נוספת במסך / יציאה לקניון" value="${esc(base.title || '')}">
      <label class="f">כמה נקודות הוא עולה?</label><input class="in" id="f-cost" type="number" inputmode="numeric" min="1" value="${base.cost || 50}">
      <div class="hint">💡 בערך 30–40 נקודות ביום טוב. פרס קטן ~50, פרס גדול ~300.</div>
      <div class="actions">${del}<button class="btn" data-save="1">שמירה</button></div>`, root => {
      root.querySelector('[data-save]').onclick = () => {
        const title = root.querySelector('#f-title').value.trim();
        const cost = parseInt(root.querySelector('#f-cost').value, 10);
        if (!title) return toast('צריך לכתוב את הפרס');
        if (!(cost > 0)) return toast('צריך מספר נקודות');
        MODAL = null; $('#modal-root').innerHTML = '';
        save(Object.assign(base, { id: base.id || uid('rw'), kind: 'reward', title, cost }));
        toast('הפרס נשמר 🎁');
      };
      bindDel(root, base);
    });
    return;
  }

  if (kind === 'gift') {
    const d = { pts: 10 };
    openModal(`<h3>💜 בונוס / מילה טובה ל${esc(kidName())}</h3>
      <label class="f" style="margin-top:0">מה רוצים להגיד?</label><input class="in" id="f-title" placeholder="למשל: גאה בך על השבוע הזה!">
      <label class="f">נקודות בונוס (כל מספר, 0 = רק מילה טובה)</label>${numPick('f-pts', d.pts, [0, 1, 2, 5, 7, 10, 20, 50], v => v ? '\u200E+' + v : 'רק מילה טובה', 0)}
      <div class="actions"><button class="btn light" data-c="no">ביטול</button><button class="btn" data-save="1">לשלוח 💌</button></div>`, root => {
      bindNum(root);
      root.querySelector('[data-c=no]').onclick = closeModal;
      root.querySelector('[data-save]').onclick = () => {
        const title = root.querySelector('#f-title').value.trim() || 'כל הכבוד!';
        const p = readNum(root, 'f-pts', 0);
        if (p == null) return toast('נקודות: מספר שלם בין 0 ל-999');
        d.pts = p;
        MODAL = null; $('#modal-root').innerHTML = '';
        save({ id: uid('gift'), kind: 'log', type: 'gift', ref: '', occ: occOf(new Date()), pts: d.pts, title, at: Date.now() });
        confetti(); toast('נשלח 💜');
      };
    });
  }
}
function bindDel(root, base) {
  const b = root.querySelector('[data-del]');
  if (!b) return;
  b.onclick = () => {
    MODAL = null; $('#modal-root').innerHTML = '';
    confirmBox('למחוק?', base.title || base.label || base.time || '', 'כן, למחוק', () => {
      save(Object.assign({}, base, { del: true }));
      toast('נמחק');
    }, true);
  };
}

document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
load();
