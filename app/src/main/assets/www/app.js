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
  else { try { S = JSON.parse(B.state()); if (S.celebrate) celebrate(); } catch (e) {} }
};
window.onBack = () => {
  if (MODAL) { closeModal(); return true; }
  if (S && S.me.role && TAB !== 'today') { TAB = 'today'; render(); return true; }
  return false;
};

const PER_KID = ['alarm', 'event', 'task', 'reward', 'redeem', 'log'];
function save(items) {
  items = Array.isArray(items) ? items : [items];
  items.forEach(it => { if (PER_KID.indexOf(it.kind) >= 0 && !it.kid && KID) it.kid = KID; });
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
  const yb = document.body.dataset.theme === 'yb';
  const colors = yb ? ['#ffd200', '#ffffff', '#ffe866', '#fff4b8', '#ffb800'] : ['#ffd166', '#ff7a59', '#9c84ff', '#3ddc97', '#ff6fb5', '#ffffff'];
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
function agenda(d) {
  const occ = occOf(d);
  const rows = [];
  mine('alarm').filter(a => a.on !== false && occursOn(a, d) && mins(a.time) >= 0).forEach(a => {
    rows.push({ type: 'alarm', t: at(occ, mins(a.time)), it: a, occ,
      log: item(`woke:${a.id}:${occ}`), miss: item(`wakemiss:${a.id}:${occ}`), snooze: item(`snooze:${a.id}:${occ}`) });
  });
  mine('event').filter(e => occursOn(e, d) && mins(e.start) >= 0).forEach(e => {
    const start = at(occ, mins(e.start));
    const leave = start - (e.travel || 0) * 60000;
    rows.push({ type: 'event', t: leave, start, leave, prepAt: leave - (e.prep || 0) * 60000, it: e, occ,
      log: item(`left:${e.id}:${occ}`), miss: item(`leavemiss:${e.id}:${occ}`) });
  });
  mine('task').filter(k => occursOn(k, d)).forEach(k => {
    const m = mins(k.time);
    rows.push({ type: 'task', t: at(occ, m >= 0 ? m : 1439), it: k, occ, log: item(`task:${k.id}:${occ}`) });
  });
  return rows.sort((a, b) => a.t - b.t);
}

function rowHtml(r, child, now) {
  const it = r.it;
  if (r.type === 'alarm') {
    let st;
    if (r.log) st = `<span class="pill ok">${child ? 'קמת' : G('קמה', 'קם')} ב-${tHM(r.log.at)} · \u200E+${r.log.pts}⭐</span>`;
    else if (r.miss) st = `<span class="pill warn">⚠️ השעון לא כובה בזמן</span>`;
    else if (now < r.t) st = `<span class="pill wait">מתוכנן</span>`;
    else st = `<span class="pill sun">מצלצל…</span>`;
    return `<div class="row ${r.log ? 'done' : ''}">
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
    return `<div class="row ${r.log ? 'done' : ''}">
      <div class="ico ${r.log ? 'ok' : 'event'}">${r.log ? '🚀' : '🎒'}</div>
      <div class="body"><div class="t1">${esc(it.title)}</div><div class="t2">${st}</div></div>
      ${btn || `<div class="time">${tHM(r.leave)}</div>`}</div>`;
  }
  // task
  const ts = taskState(r.log);
  const canMark = child && r.occ === occOf(new Date()) && (ts === 'open' || ts === 'rejected');
  const base = it.pts || 5;
  let st, mark;
  if (ts === 'approved') {
    st = `<span class="pill ok">אושר${r.log.approvedBy && !child ? ' ע״י ' + esc(r.log.approvedBy) : ''} · ‎+${r.log.pts}⭐</span>`;
    mark = `<div class="check on">✓</div>`;
  } else if (ts === 'pending') {
    st = `<span class="pill wait">⏳ ${child ? 'סימנת בוצע ·' : ''} מחכה לאישור${child ? '' : ' שלך'}</span>`;
    mark = `<div class="check wait">⏳</div>`;
  } else if (ts === 'missed') {
    st = `<span class="pill warn">${r.log.auto ? 'לא סומן עד סוף היום' : 'לא בוצע'} · ‎${r.log.pts}⭐</span>`;
    mark = `<div class="check x">✕</div>`;
  } else {
    st = ts === 'rejected' ? `<span class="pill warn">↩️ לא אושר – אפשר לבצע ולסמן שוב</span>`
      : (now > r.t ? `<span class="pill warn">עבר הזמן</span> ${base}⭐` : `עד ${esc(it.time || 'סוף היום')} · ${base}⭐`);
    if (it.photo) st += ` <span class="small">· 📷 צריך תמונה</span>`;
    mark = `<div class="check"></div>`;
  }
  const btns = canMark ? `<div class="btns">
      <button class="btn mint small" data-done="${esc(it.id)}" data-occ="${r.occ}">${it.photo ? '📷 ' : ''}בוצע ✅</button>
      <button class="btn danger small" data-notdone="${esc(it.id)}" data-occ="${r.occ}">לא בוצע ✕</button></div>` : '';
  const photo = r.log && r.log.photo ? `<div class="thumbwrap" data-photo="${esc(r.log.id)}"></div>` : '';
  return `<div class="row ${ts === 'approved' || ts === 'missed' ? 'done' : ''}">
    ${mark}
    <div class="body"><div class="t1">${esc(it.title)}</div><div class="t2">${st}</div>${btns}</div>
    ${photo || `<div class="time">${esc(it.time || '')}</div>`}</div>`;
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
    return `<div class="card" style="border:2px solid var(--violet-soft)">
      <div style="display:flex;gap:12px;align-items:flex-start">
        <div style="flex:1"><b>${esc(l.title)}</b>
          <div class="small muted">${esc(kidName())} ${G('סימנה', 'סימן')} בוצע ${d} ב-${tHM(l.at)}${l.late ? ' (אחרי הזמן)' : ''} · ${l.claim || 0}⭐</div></div>
        ${l.photo ? `<div class="thumbwrap" data-photo="${esc(l.id)}"></div>` : ''}
      </div>
      <div class="actions" style="margin-top:12px">
        <button class="btn mint" data-approve="${esc(l.id)}">לאשר ✅</button>
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
    document.body.dataset.theme = OB.theme || 'purple';
    bars();
    app.innerHTML = onboarding(); bindOnboarding(); return;
  }
  if (!isChild() && S.me.unlocked === false) {
    document.body.dataset.theme = 'purple'; bars();
    app.innerHTML = lockScreen(); bindLock(); return;
  }
  pickKid();
  const th = kidInfo().theme;
  document.body.dataset.theme = th === 'yb' || th === 'orange' ? th : 'purple';
  applyDesign();
  bars();
  if (TAB === 'report' && isChild()) TAB = 'today';
  let body = '';
  if (TAB === 'today') body = isChild() ? childToday() : parentToday();
  else if (TAB === 'plan') body = planScreen();
  else if (TAB === 'report') body = reportScreen();
  else if (TAB === 'rewards') body = rewardsScreen();
  else body = settingsScreen();
  const pending = list('redeem').filter(r => r.status === 'pending').length;
  const badge = { today: !isChild() ? pendingTasks(true).length : 0, rewards: !isChild() && pending ? pending : 0 };
  app.innerHTML = body + (TAB === 'today' || TAB === 'plan' ? micFab() : '') + `
  <nav>${tabOrder().map(k => navBtn(k, TABS_ALL[k][0], TABS_ALL[k][1], badge[k] || 0)).join('')}</nav>`;
  bindCommon();
  fillPhotos();
  if (TAB === 'today') tickTimer = setInterval(() => { if (!MODAL && TAB === 'today') render(); }, 30000);
}
let lastBars = '';
function bars() {
  const c = document.body.dataset.theme === 'orange' ? '#7a2e00' : heroColor();
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
    return `<button class="${k.kid === KID ? 'on' : ''}" data-kid="${esc(k.kid)}"><span class="dot" style="background:${k.theme === 'yb' ? '#ffd200' : '#9c84ff'}"></span>${esc(k.name)}${n ? `<span class="badge">${n}</span>` : ''}</button>`;
  }).join('')}</div>`;
}

function hero(title, sub) {
  const sc = score();
  const today = occOf(new Date());
  const todayPts = mine('log').filter(l => l.occ === today).reduce((s, l) => s + (l.pts || 0), 0);
  const ls = S.me.lastSync ? Math.round((Date.now() - S.me.lastSync) / 60000) : null;
  return `<div class="hero">
    <div class="top"><div><h1>${title}</h1><div class="date">${sub}</div></div>
    <div style="display:flex;gap:6px">${!isChild() ? '<button class="sync" data-design="1" aria-label="עיצוב">🎨</button>' : ''}<button class="sync" data-sync="1">🔄 ${ls == null ? 'סנכרון' : ls < 1 ? 'עכשיו' : 'לפני ' + ls + ' דק׳'}</button></div></div>
    <div class="chips">
      <div class="chip"><b>\u200E${sc.pts}</b><span>⭐ נקודות</span></div>
      <div class="chip"><b>${sc.streak}</b><span>🔥 ימים ברצף</span></div>
      <div class="chip"><b>\u200E${todayPts >= 0 ? '+' : ''}${todayPts}</b><span>✨ היום</span></div>
    </div>${kidTabs()}</div>`;
}
function dateLine() {
  return new Date().toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });
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
  return hero(`${greet}, ${esc(S.me.name)} 👋`, dateLine()) + `<main>
    ${permBanner()}
    ${next}
    ${noAlarm ? `<div class="card center"><div style="font-size:34px">⏰</div><b>עוד אין שעון מעורר</b><p class="muted small">קובעים שעה, והשעון יצלצל עד שפותרים תרגיל קטן</p><button class="btn" data-new="alarm">לקבוע שעון מעורר</button></div>` : ''}
    <div class="sec-title"><h2>היום שלי</h2><button class="add" data-new="task">+ משימה</button></div>
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
  const gifts = `<button class="btn ghost block" data-new="gift">${kidInfo().theme === 'yb' ? '💛' : '💜'} לתת בונוס / מילה טובה ל${esc(kid)}</button>`;
  return hero(`${esc(kid)} היום`, dateLine()) + `<main>
    ${permBanner()}
    ${!S.me.pinSet ? `<div class="banner" style="background:var(--sun-soft);color:#6b4b00"><div style="flex:1">🔒 כדאי לקבוע קוד הורים – כדי שאף ילד לא יוכל להתחבר כהורה ולאשר לעצמו משימות</div><button class="btn small" data-setpin="1">לקבוע</button></div>` : ''}
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
    ${tasks.length ? tasks.map(t => `<div class="card item" data-edit="${esc(t.id)}">
        <div class="ico task">📝</div>
        <div style="flex:1"><b>${esc(t.title)}</b><div class="small muted">${daysText(t)} · עד ${esc(t.time || '')} · ${t.pts || 5}⭐${t.by ? ' · מאת ' + esc(t.by) : ''}</div></div></div>`).join('')
      : `<div class="card empty"><div class="e">📝</div>אין משימות פתוחות</div>`}
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
      ✅ משימה שההורים אישרו: כל הנקודות · באיחור: חצי<br>
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

    ${!child ? `<div class="sec-title"><h2>🔒 קוד הורים</h2></div>
    <div class="card"><div style="display:flex;align-items:center;gap:12px">
      <div style="flex:1"><b>${S.me.pinSet ? 'מוגדר ✅' : 'עוד לא הוגדר ⚠️'}</b><div class="small muted">נדרש כדי להצטרף כהורה וכדי להוציא טלפון של ילד מהמשפחה</div></div>
      <button class="btn ${S.me.pinSet ? 'light' : ''} small" data-setpin="1">${S.me.pinSet ? 'שינוי' : 'לקבוע'}</button></div></div>` : ''}

    <div class="sec-title"><h2>🔐 הרשאות בטלפון</h2></div>
    <div class="card">
      ${perm('notif', 'התראות', child ? 'תזכורות יציאה ומשימות' : 'עדכונים כשהילדים קמים / יוצאים')}
      ${child ? perm('exact', 'שעונים מדויקים', 'כדי שהשעון יצלצל בדיוק בזמן') : ''}
      ${child ? perm('full', 'מסך מלא לשעון המעורר', 'השעון נפתח על כל המסך גם כשהטלפון נעול') : ''}
      ${perm('battery', 'בלי הגבלת סוללה', 'כדי שאנדרואיד לא "ירדים" את האפליקציה')}
      ${p.samsung ? `<div class="hint">📱 <b>בסמסונג:</b> הגדרות ← סוללה ← הגבלות שימוש ברקע ← לוודא ש"בזמן" <b>לא</b> ברשימת "אפליקציות במצב שינה".</div>` : ''}
    </div>

    ${child ? `<div class="sec-title"><h2>🎨 הצבעים שלי</h2></div>
    <div class="card">
      <div class="theme-pick">${themeButtons(kidInfo().theme, t => `data-settheme="${t}"`)}</div>
      <label class="f">אני</label>
      <div class="seg"><button class="${kidInfo().gender !== 'm' ? 'on' : ''}" data-setgender="f">בת 👧</button><button class="${kidInfo().gender === 'm' ? 'on' : ''}" data-setgender="m">בן 👦</button></div>
    </div>` : `<div class="sec-title"><h2>🎨 עיצוב</h2></div>
    <div class="card"><button class="btn block" data-design="1">🎨 עיצוב אישי של המסך שלי</button>
      ${kids().map(k => `<label class="f">הצבעים של ${esc(k.name)}</label><div class="theme-pick">${themeButtons(k.theme, t => `data-kidtheme="${esc(k.kid)}|${t}"`)}</div>`).join('')}
      ${kids().length ? '<div class="small muted" style="margin-top:8px">הצבעים של הילד/ה מתעדכנים גם בטלפון שלו/ה</div>' : ''}
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
    <div class="card"><div class="small muted">סנכרון אחרון: ${ls}</div>
      <div class="actions" style="margin-top:10px"><button class="btn ghost" data-sync="1">לסנכרן עכשיו</button><button class="btn light" data-update="1">📥 ${S.fromPlay ? 'עדכון ב-Play' : 'עדכון גרסה'}</button></div>
    </div>

    ${!child ? `<div class="sec-title"><h2>▶️ Google Play</h2></div>
    <div class="card"><div class="small muted">${(item('cfg') || {}).playLink ? 'קישור ההצטרפות שמור – הוא נשלח עם קוד המשפחה' : 'אחרי שהאפליקציה עולה לבדיקה פנימית ב-Play, מדביקים כאן את קישור ההצטרפות'}</div>
      <button class="btn ghost block" style="margin-top:10px" data-playlink="1">🔗 ${(item('cfg') || {}).playLink ? 'שינוי הקישור' : 'הדבקת קישור ההצטרפות'}</button></div>` : ''}

    <div class="card small muted center">בזמן · גרסה ${esc(S.version)}<br><button class="btn danger small" style="margin-top:10px" data-reset="1">יציאה מהמשפחה והתחלה מחדש</button></div>
  </main>`;
}

function themeButtons(cur, attr) {
  const T = [['purple', 'סגול 💜'], ['orange', 'כתום 🧡'], ['yb', 'צהוב-שחור 💛🖤']];
  return T.map(([t, n]) => `<button class="tp-${t} ${((cur || 'purple') === t) ? 'on' : ''}" ${attr(t)}>${n}</button>`).join('');
}

// ---------- parents' PIN ----------
function lockScreen() {
  return `<div class="ob">
    <div class="logo">🔒</div><h1>קוד הורים</h1>
    <div class="card">
      ${S.me.pinSet ? `<p class="muted" style="margin-top:0">הטלפון הזה הצטרף למשפחה כהורה. כדי להמשיך, מקלידים את קוד ההורים שקבעו ההורים בהגדרות.</p>
        <input class="in time" id="pin-in" type="password" inputmode="numeric" maxlength="8" placeholder="••••">
        <div class="actions"><button class="btn light" data-lockreset="1">זה לא הורה</button><button class="btn" data-unlock="1">כניסה 🔓</button></div>`
      : `<p class="muted" style="margin-top:0">⏳ מחכים לנתוני המשפחה מהטלפונים האחרים… זה לוקח עד כמה דקות. צריך שלפחות טלפון אחד נוסף במשפחה יהיה דלוק ומחובר.</p>
        <div class="actions"><button class="btn light" data-lockreset="1">ביטול</button><button class="btn ghost" data-sync="1">🔄 לבדוק שוב</button></div>`}
    </div></div>`;
}
function bindLock() {
  const u = $('[data-unlock]');
  if (u) u.onclick = () => {
    if (B.unlockPin($('#pin-in').value)) { toast('ברוכים הבאים 👋'); load(); }
    else { toast('קוד לא נכון'); $('#pin-in').value = ''; }
  };
  const s = $('[data-sync]'); if (s) s.onclick = () => { B.syncNow(); toast('בודק…'); setTimeout(load, 4000); };
  const r = $('[data-lockreset]'); if (r) r.onclick = () => { S = JSON.parse(B.reset()); OB = { step: 1 }; render(); };
}
function pinModal(title, text, onOk, needOld) {
  openModal(`<h3>${esc(title)}</h3><p class="muted small">${esc(text)}</p>
    ${needOld === true ? `<label class="f">הקוד הנוכחי</label><input class="in time" id="pin-old" type="password" inputmode="numeric" maxlength="8">` : ''}
    <label class="f">${needOld === 'check' ? 'קוד הורים' : 'קוד חדש (4–8 ספרות)'}</label><input class="in time" id="pin-new" type="password" inputmode="numeric" maxlength="8">
    ${needOld === 'check' ? '' : `<label class="f">שוב, לאימות</label><input class="in time" id="pin-new2" type="password" inputmode="numeric" maxlength="8">`}
    <div class="actions"><button class="btn light" data-c="no">ביטול</button><button class="btn" data-c="yes">אישור</button></div>`, root => {
    root.querySelector('[data-c=no]').onclick = closeModal;
    root.querySelector('[data-c=yes]').onclick = () => {
      const o = root.querySelector('#pin-old'), n = root.querySelector('#pin-new').value, n2 = root.querySelector('#pin-new2');
      if (n2 && n !== n2.value) return toast('שני הקודים לא זהים');
      onOk(n, o ? o.value : '');
    };
  });
}
function openSetPin() {
  pinModal(S.me.pinSet ? 'שינוי קוד הורים' : 'קביעת קוד הורים',
    'הקוד נדרש כשמצטרפים למשפחה כהורה, וכשרוצים להוציא טלפון של ילד מהמשפחה. לא לספר אותו לילדים 🤫',
    (n, o) => {
      if (!/^\d{4,8}$/.test(n)) return toast('הקוד צריך להיות 4 עד 8 ספרות');
      if (B.setPin(n, o)) { MODAL = null; $('#modal-root').innerHTML = ''; load(); toast('קוד ההורים נשמר 🔒'); }
      else toast(S.me.pinSet ? 'הקוד הנוכחי לא נכון' : 'לא הצלחתי לשמור');
    }, S.me.pinSet ? true : false);
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
  document.querySelectorAll('[data-design]').forEach(b => b.onclick = openDesign);
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
    if (e.target.closest('[data-toggle]')) return;
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
  document.querySelectorAll('[data-update]').forEach(b => b.onclick = () => B.openUpdate ? B.openUpdate() : B.openUrl(S.apk));
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
  document.querySelectorAll('[data-reset]').forEach(b => b.onclick = () => (isChild() && S.me.pinSet && B.checkPin) ? pinModal('יציאה מהמשפחה', 'בטלפון של ילד צריך קוד הורים כדי לצאת מהמשפחה.', (n) => {
    if (!B.checkPin(n)) return toast('קוד לא נכון');
    MODAL = null; $('#modal-root').innerHTML = '';
    S = JSON.parse(B.reset()); OB = { step: 1 }; TAB = 'today'; render();
  }, 'check') : confirmBox('לצאת מהמשפחה?', 'כל הנתונים בטלפון הזה יימחקו. אפשר להצטרף שוב עם הקוד.', 'כן, לצאת', () => {
    S = JSON.parse(B.reset()); OB = { step: 1 }; TAB = 'today'; render();
  }, true));
}

function shareCode() {
  const cfg = item('cfg');
  const link = cfg && cfg.playLink;
  const txt = link
    ? `⏰ הצטרפות לאפליקציה "בזמן"\n\n1. פותחים את הקישור (בחשבון Google שנתתם לי):\n${link}\n\n2. לוחצים "הצטרפות כבודק/ת", ואז "הורדה מ-Google Play" ומתקינים\n\n3. פותחים, בוחרים הורה או ילד/ה, ובוחרים "יש לי קוד"\n\n4. קוד המשפחה: ${fmtCode(S.me.code)}`
    : `⏰ הצטרפות לאפליקציה "בזמן"\n\n1. מורידים ומתקינים:\n${S.apk}\n\n2. פותחים, בוחרים הורה או ילד/ה, ובוחרים "יש לי קוד"\n\n3. קוד המשפחה: ${fmtCode(S.me.code)}`;
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
    const d = { mode: (base.days && base.days.length) ? 'repeat' : 'once', days: base.days ? base.days.slice() : [], date: base.date || today, pts: base.pts || 5, photo: base.photo ? 1 : 0 };
    openModal(`<h3>${isNew ? 'משימה חדשה' : 'עריכת משימה'}</h3>
      <label class="f" style="margin-top:0">מה צריך לעשות?</label><div class="titlewrap"><input class="in" id="f-title" placeholder="למשל: שיעורי בית במתמטיקה" value="${esc(base.title || '')}"><button type="button" class="mic-in" data-micin="1">🎤</button></div>
      ${whenFields(d)}
      <label class="f">עד איזו שעה?</label><input class="in time" type="time" id="f-time" value="${esc(base.time || '20:00')}">
      ${isChild() ? `<div class="hint">⭐ ${isNew ? 'המשימה תהיה שווה' : 'המשימה שווה'} ${d.pts} נקודות. את הנקודות קובעים ההורים.</div>`
        : `<label class="f">כמה נקודות?</label>${opts('pts', [3, 5, 10, 15, 20], d.pts, v => v + '⭐')}
      <label class="f">📷 לבקש תמונה כשמסיימים?</label>${opts('photo', [0, 1], d.photo, v => v ? 'כן, עם תמונה' : 'בלי תמונה')}`}
      <div class="hint">🔔 תזכורת חצי שעה לפני ובזמן. "בוצע" נשלח להורים לאישור – בזמן = כל הנקודות, באיחור = חצי. "לא בוצע" (או בלי סימון עד סוף היום) = מינוס חצי.</div>
      <div class="actions">${del}<button class="btn" data-save="1">שמירה</button></div>`, root => {
      bindPick(root, d);
      root.querySelector('[data-save]').onclick = () => {
        const title = root.querySelector('#f-title').value.trim();
        const time = root.querySelector('#f-time').value;
        if (!title) return toast('צריך לכתוב מה');
        if (mins(time) < 0) return toast('צריך לבחור שעה');
        const out = {};
        if (!readWhen(root, d, out)) return;
        MODAL = null; $('#modal-root').innerHTML = '';
        const extra = isChild() ? { pts: base.pts || 5, photo: !!base.photo } : { pts: d.pts, photo: !!d.photo };
        save(Object.assign(base, out, { id: base.id || uid('tk'), kind: 'task', title, time }, extra));
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
      <label class="f">נקודות בונוס</label>${opts('pts', [0, 5, 10, 20, 50], d.pts, v => v ? '\u200E+' + v : 'רק מילה טובה')}
      <div class="actions"><button class="btn light" data-c="no">ביטול</button><button class="btn" data-save="1">לשלוח 💌</button></div>`, root => {
      bindPick(root, d);
      root.querySelector('[data-c=no]').onclick = closeModal;
      root.querySelector('[data-save]').onclick = () => {
        const title = root.querySelector('#f-title').value.trim() || 'כל הכבוד!';
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
