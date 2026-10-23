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
function kidName() {
  const m = list('member').find(x => x.role === 'child');
  return m ? m.name : (isChild() ? S.me.name : 'הילדה');
}
function score() {
  const s = item('score');
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
}
window.onNative = () => { if (!MODAL) load(); else { try { S = JSON.parse(B.state()); } catch (e) {} } };
window.onBack = () => {
  if (MODAL) { closeModal(); return true; }
  if (S && S.me.role && TAB !== 'today') { TAB = 'today'; render(); return true; }
  return false;
};

function save(items) {
  S = JSON.parse(B.upsert(JSON.stringify(Array.isArray(items) ? items : [items])));
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

// ---------- agenda for a day ----------
function agenda(d) {
  const occ = occOf(d);
  const rows = [];
  list('alarm').filter(a => a.on !== false && occursOn(a, d) && mins(a.time) >= 0).forEach(a => {
    rows.push({ type: 'alarm', t: at(occ, mins(a.time)), it: a, occ,
      log: item(`woke:${a.id}:${occ}`), miss: item(`wakemiss:${a.id}:${occ}`), snooze: item(`snooze:${a.id}:${occ}`) });
  });
  list('event').filter(e => occursOn(e, d) && mins(e.start) >= 0).forEach(e => {
    const start = at(occ, mins(e.start));
    const leave = start - (e.travel || 0) * 60000;
    rows.push({ type: 'event', t: leave, start, leave, prepAt: leave - (e.prep || 0) * 60000, it: e, occ,
      log: item(`left:${e.id}:${occ}`), miss: item(`leavemiss:${e.id}:${occ}`) });
  });
  list('task').filter(k => occursOn(k, d)).forEach(k => {
    const m = mins(k.time);
    rows.push({ type: 'task', t: at(occ, m >= 0 ? m : 1439), it: k, occ, log: item(`task:${k.id}:${occ}`) });
  });
  return rows.sort((a, b) => a.t - b.t);
}

function rowHtml(r, child, now) {
  const it = r.it;
  if (r.type === 'alarm') {
    let st;
    if (r.log) st = `<span class="pill ok">${child ? 'קמת' : 'קמה'} ב-${tHM(r.log.at)} · \u200E+${r.log.pts}⭐</span>`;
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
    if (r.log) st = `<span class="pill ok">${child ? 'יצאת' : 'יצאה'} ב-${tHM(r.log.at)}${r.log.late ? ' (איחור ' + r.log.late + ' דק׳)' : ''} · \u200E+${r.log.pts}⭐</span>`;
    else if (r.miss) st = `<span class="pill warn">לא ${child ? 'סימנת' : 'סימנה'} יציאה</span>`;
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
  const done = !!r.log;
  const canTick = child && !done && r.occ === occOf(new Date());
  let st = done ? `<span class="pill ok">${child ? 'סיימת' : 'סיימה'} ב-${tHM(r.log.at)} · \u200E+${r.log.pts}⭐</span>`
    : (now > r.t ? `<span class="pill warn">עבר הזמן</span>` : `עד ${esc(it.time || 'סוף היום')} · ${it.pts || 5}⭐`);
  return `<div class="row ${done ? 'done' : ''}">
    ${canTick ? `<button class="check" data-act="task" data-ref="${esc(it.id)}" data-occ="${r.occ}"></button>` : `<div class="check ${done ? 'on' : ''}">${done ? '✓' : ''}</div>`}
    <div class="body"><div class="t1">${esc(it.title)}</div><div class="t2">${st}</div></div>
    <div class="time">${esc(it.time || '')}</div></div>`;
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
    if (r.type === 'task' && r.t > now - 3 * 3600000) return { r, t: r.t, what: '📝 ' + r.it.title, sub: `לסיים עד ${r.it.time}`, label: 'נשאר' };
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
  if (!S.me.role || !S.me.code) { app.innerHTML = onboarding(); bindOnboarding(); return; }
  let body = '';
  if (TAB === 'today') body = isChild() ? childToday() : parentToday();
  else if (TAB === 'plan') body = planScreen();
  else if (TAB === 'rewards') body = rewardsScreen();
  else body = settingsScreen();
  const pending = list('redeem').filter(r => r.status === 'pending').length;
  app.innerHTML = body + `
  <nav>
    ${navBtn('today', '🏠', 'היום')}
    ${navBtn('plan', '🗓️', 'לו״ז')}
    ${navBtn('rewards', '🎁', 'פרסים', !isChild() && pending ? pending : 0)}
    ${navBtn('settings', '⚙️', 'הגדרות')}
  </nav>`;
  bindCommon();
  if (TAB === 'today') tickTimer = setInterval(() => { if (!MODAL && TAB === 'today') render(); }, 30000);
}
function navBtn(id, ico, txt, badge) {
  return `<button class="${TAB === id ? 'on' : ''}" data-tab="${id}"><span class="ni">${ico}</span><span>${txt}${badge ? ` <span class="badge">${badge}</span>` : ''}</span></button>`;
}

function hero(title, sub) {
  const sc = score();
  const today = occOf(new Date());
  const todayPts = list('log').filter(l => l.occ === today).reduce((s, l) => s + (l.pts || 0), 0);
  const ls = S.me.lastSync ? Math.round((Date.now() - S.me.lastSync) / 60000) : null;
  return `<div class="hero">
    <div class="top"><div><h1>${title}</h1><div class="date">${sub}</div></div>
    <button class="sync" data-sync="1">🔄 ${ls == null ? 'סנכרון' : ls < 1 ? 'עכשיו' : 'לפני ' + ls + ' דק׳'}</button></div>
    <div class="chips">
      <div class="chip"><b>${sc.pts}</b><span>⭐ נקודות</span></div>
      <div class="chip"><b>${sc.streak}</b><span>🔥 ימים ברצף</span></div>
      <div class="chip"><b>\u200E+${todayPts}</b><span>✨ היום</span></div>
    </div></div>`;
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
  const noAlarm = !list('alarm').length;
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
  const logs = list('log');
  const vals = days.map(d => logs.filter(l => l.occ === occOf(d)).reduce((s, l) => s + (l.pts || 0), 0));
  const max = Math.max(10, ...vals);
  return `<div class="sec-title"><h2>7 ימים אחרונים</h2></div><div class="card"><div class="week">
    ${days.map((d, i) => `<div class="col"><div class="n">${vals[i] || ''}</div><div class="b" style="height:${Math.round(vals[i] / max * 80)}%"></div><div class="d">${DAYS[d.getDay()]}</div></div>`).join('')}
  </div></div>`;
}

function parentToday() {
  const now = Date.now();
  const kid = kidName();
  const joined = list('member').some(m => m.role === 'child');
  const rows = agenda(new Date());
  const pending = list('redeem').filter(r => r.status === 'pending');
  const gifts = `<button class="btn ghost block" data-new="gift">💜 לתת בונוס / מילה טובה ל${esc(kid)}</button>`;
  return hero(`${esc(kid)} היום`, dateLine()) + `<main>
    ${permBanner()}
    ${!joined ? `<div class="card"><b>📲 ${esc(kid)} עוד לא מחוברת</b><p class="muted small">מתקינים את האפליקציה בטלפון שלה, בוחרים "אני הילדה" ומקלידים את קוד המשפחה.</p><button class="btn block" data-share="1">שליחת הקוד בוואטסאפ</button></div>` : ''}
    ${pending.map(redeemCard).join('')}
    <div class="sec-title"><h2>מה קרה היום</h2><button class="add" data-new="task">+ משימה</button></div>
    <div class="card">${rows.length ? rows.map(r => rowHtml(r, false, now)).join('') : `<div class="empty"><div class="e">🗓️</div>אין כלום בלו״ז להיום.<br>מוסיפים בלשונית "לו״ז"</div>`}</div>
    ${gifts}
    ${weekCard()}
    ${tomorrowCard(false)}
    <p class="muted small center">העדכונים מהטלפון שלה מגיעים בדרך כלל תוך כרבע שעה</p>
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
  const alarms = list('alarm').sort((a, b) => mins(a.time) - mins(b.time));
  const events = list('event').sort((a, b) => (a.date || '') .localeCompare(b.date || '') || mins(a.start) - mins(b.start));
  const tasks = list('task').filter(t => !t.date || t.date >= occOf(new Date())).sort((a, b) => (a.date || '').localeCompare(b.date || '') || mins(a.time) - mins(b.time));
  const title = isChild() ? 'הלו״ז שלי' : 'הלו״ז של ' + esc(kidName());
  return `<div class="hero" style="padding-bottom:18px"><div class="top"><div><h1>${title}</h1><div class="date">שעונים, חוגים ומשימות</div></div></div></div><main>
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
  const rewards = list('reward').sort((a, b) => (a.cost || 0) - (b.cost || 0));
  const reqs = list('redeem').sort((a, b) => (b.at || b.upd) - (a.at || a.upd));
  const child = isChild();
  const pending = reqs.filter(r => r.status === 'pending');
  const stTxt = { pending: ['wait', 'מחכה לאישור'], approved: ['ok', 'אושר 🎉'], declined: ['warn', 'לא אושר'] };
  return `<div class="hero" style="padding-bottom:18px"><div class="top"><div><h1>פרסים 🎁</h1><div class="date">${child ? 'אוספים נקודות ומממשים' : 'קובעים פרסים ומאשרים בקשות'}</div></div></div>
    <div class="big-score"><b>${sc.pts}</b> ⭐</div></div><main>
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
    }).join('')}</div>` : `<div class="card empty"><div class="e">🎁</div>${child ? 'ההורים עוד לא הוסיפו פרסים. אפשר לבקש מהם!' : 'מוסיפים פרסים שהיא תרצה – כדאי לבחור אותם יחד איתה'}</div>`}
    ${!child ? `<div style="margin-top:14px">${'<button class="btn ghost block" data-new="gift">💜 לתת בונוס / מילה טובה</button>'}</div>` : ''}
    <div class="sec-title"><h2>היסטוריה</h2></div>
    <div class="card">${reqs.length ? reqs.map(r => `<div class="row"><div class="ico task">🎁</div><div class="body"><div class="t1">${esc(r.title)}</div><div class="t2">${r.cost} ⭐ · ${new Date(r.at || r.upd).toLocaleDateString('he-IL')}</div></div><span class="pill ${stTxt[r.status] ? stTxt[r.status][0] : 'wait'}">${stTxt[r.status] ? stTxt[r.status][1] : ''}</span></div>`).join('')
      : `<div class="empty">עוד לא מומשו פרסים</div>`}</div>
    <div class="card small muted">
      <b style="color:var(--ink)">איך מרוויחים נקודות?</b><br>
      ☀️ קמה בלי נודניק: 10 · עם נודניק: 5<br>
      🚪 יוצאת בזמן: 10 · עד 10 דק׳ איחור: 5<br>
      ✅ משימה בזמן: כל הנקודות · באיחור: חצי<br>
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
  return `<div class="hero" style="padding-bottom:18px"><div class="top"><div><h1>הגדרות</h1><div class="date">${esc(S.me.name)} · ${child ? 'הטלפון של הילדה' : 'טלפון של הורה'}</div></div></div></div><main>
    <div class="sec-title"><h2>👨‍👩‍👧 קוד המשפחה</h2></div>
    <div class="card">
      <div class="muted small">כל מי שמקליד את הקוד הזה מצטרף למשפחה (אבא, אמא, הילדה)</div>
      <div class="code">${fmtCode(S.me.code)}</div>
      <button class="btn block" data-share="1">📲 שליחה בוואטסאפ עם קישור להתקנה</button>
    </div>

    <div class="sec-title"><h2>🔐 הרשאות בטלפון</h2></div>
    <div class="card">
      ${perm('notif', 'התראות', child ? 'תזכורות יציאה ומשימות' : 'עדכונים כשהיא קמה / יוצאת')}
      ${child ? perm('exact', 'שעונים מדויקים', 'כדי שהשעון יצלצל בדיוק בזמן') : ''}
      ${child ? perm('full', 'מסך מלא לשעון המעורר', 'השעון נפתח על כל המסך גם כשהטלפון נעול') : ''}
      ${perm('battery', 'בלי הגבלת סוללה', 'כדי שאנדרואיד לא "ירדים" את האפליקציה')}
      ${p.samsung ? `<div class="hint">📱 <b>בסמסונג:</b> הגדרות ← סוללה ← הגבלות שימוש ברקע ← לוודא ש"בזמן" <b>לא</b> ברשימת "אפליקציות במצב שינה".</div>` : ''}
    </div>

    ${child ? `<div class="sec-title"><h2>⏰ בדיקה</h2></div>
    <div class="card"><p class="small muted" style="margin-top:0">לוחצים, נועלים את המסך ומחכים 10 שניות. השעון צריך לצלצל ולהיפתח על כל המסך.</p>
      <button class="btn coral block" data-test="1">בדיקת שעון מעורר</button></div>` : ''}

    <div class="sec-title"><h2>🔄 סנכרון</h2></div>
    <div class="card"><div class="small muted">סנכרון אחרון: ${ls}</div>
      <div class="actions" style="margin-top:10px"><button class="btn ghost" data-sync="1">לסנכרן עכשיו</button><button class="btn light" data-update="1">📥 עדכון גרסה</button></div>
    </div>

    <div class="card small muted center">בזמן · גרסה ${esc(S.version)}<br><button class="btn danger small" style="margin-top:10px" data-reset="1">יציאה מהמשפחה והתחלה מחדש</button></div>
  </main>`;
}

// ---------- onboarding ----------
function onboarding() {
  if (OB.step === 1) {
    return `<div class="ob">
      <div class="logo">⏰</div><h1>בזמן</h1>
      <p>קמים בזמן, יוצאים בזמן, אוספים נקודות ⭐</p>
      <button class="card choice" data-role="parent"><span class="e">👨‍👩‍👧</span><span>אני הורה<small>מנהלים את הלו״ז ומקבלים עדכונים</small></span></button>
      <button class="card choice" data-role="child"><span class="e">🧒</span><span>אני הילדה / הילד<small>השעון המעורר, התזכורות והנקודות שלי</small></span></button>
    </div>`;
  }
  const parent = OB.role === 'parent';
  const mode = OB.mode || (parent ? 'new' : 'join');
  return `<div class="ob">
    <div class="logo">${parent ? '👨‍👩‍👧' : '🧒'}</div>
    <div class="card">
      <label class="f" style="margin-top:0">איך קוראים לך?</label>
      <input class="in" id="ob-name" placeholder="${parent ? 'למשל: אבא / אמא' : 'השם שלך'}" value="${esc(OB.name || '')}">
      <label class="f">משפחה</label>
      <div class="seg"><button class="${mode === 'new' ? 'on' : ''}" data-mode="new">משפחה חדשה</button><button class="${mode === 'join' ? 'on' : ''}" data-mode="join">יש לי קוד</button></div>
      ${mode === 'join' ? `<label class="f">קוד המשפחה</label><input class="in" id="ob-code" dir="ltr" style="text-align:center;letter-spacing:2px;font-weight:800" placeholder="XXXXX-XXXXX" value="${esc(OB.code || '')}">
        <div class="hint">את הקוד מוצאים אצל מי שכבר מחובר: הגדרות ← קוד המשפחה</div>`
        : `<div class="hint">נוצר קוד חדש. אחרי זה שולחים אותו בוואטסאפ ל${parent ? 'בת ולבן/בת הזוג' : 'הורים'}.</div>`}
      <div class="actions"><button class="btn light" data-ob-back="1">חזרה</button><button class="btn" data-ob-go="1">יאללה! 🚀</button></div>
    </div></div>`;
}
function bindOnboarding() {
  document.querySelectorAll('[data-role]').forEach(b => b.onclick = () => { OB = { step: 2, role: b.dataset.role }; render(); });
  document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { OB.name = val('#ob-name'); OB.mode = b.dataset.mode; render(); });
  const back = $('[data-ob-back]'); if (back) back.onclick = () => { OB = { step: 1 }; render(); };
  const go = $('[data-ob-go]');
  if (go) go.onclick = () => {
    const name = val('#ob-name').trim();
    const mode = OB.mode || (OB.role === 'parent' ? 'new' : 'join');
    if (!name) return toast('צריך לכתוב שם 🙂');
    let code = mode === 'new' ? B.newCode() : val('#ob-code').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (code.length !== 10) return toast('הקוד צריך להיות 10 תווים');
    S = JSON.parse(B.setup(OB.role, name, code));
    TAB = mode === 'new' && OB.role === 'parent' ? 'settings' : 'today';
    render();
    if (mode === 'new') toast('המשפחה נוצרה! עכשיו שולחים את הקוד');
    else toast('מחוברים! הנתונים יגיעו תוך כמה דקות');
  };
}
const val = sel => { const e = $(sel); return e ? e.value : ''; };

// ---------- events ----------
function bindCommon() {
  document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { TAB = b.dataset.tab; render(); window.scrollTo(0, 0); });
  document.querySelectorAll('[data-sync]').forEach(b => b.onclick = () => { B.syncNow(); toast('מסנכרן…'); });
  document.querySelectorAll('[data-act]').forEach(b => b.onclick = (e) => {
    e.stopPropagation();
    const pts = B.action(b.dataset.act, b.dataset.ref, b.dataset.occ);
    load();
    if (pts > 0) { confetti(); toast((b.dataset.act === 'left' ? 'יצאת! 🚀' : 'סיימת! 💪') + ` \u200E+${pts} ⭐`); }
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
  document.querySelectorAll('[data-update]').forEach(b => b.onclick = () => B.openUrl(S.apk));
  document.querySelectorAll('[data-reset]').forEach(b => b.onclick = () => confirmBox('לצאת מהמשפחה?', 'כל הנתונים בטלפון הזה יימחקו. אפשר להצטרף שוב עם הקוד.', 'כן, לצאת', () => {
    S = JSON.parse(B.reset()); OB = { step: 1 }; TAB = 'today'; render();
  }, true));
}

function shareCode() {
  const txt = `⏰ הצטרפות לאפליקציה "בזמן"\n\n1. מורידים ומתקינים:\n${S.apk}\n\n2. פותחים, בוחרים הורה או ילדה, ובוחרים "יש לי קוד"\n\n3. קוד המשפחה: ${fmtCode(S.me.code)}`;
  B.share(txt);
}

// ---------- modal ----------
function openModal(html, bind) {
  MODAL = true;
  const root = $('#modal-root');
  root.innerHTML = `<div class="sheet-bg"><div class="sheet"><div class="grab"></div>${html}</div></div>`;
  root.querySelector('.sheet-bg').onclick = (e) => { if (e.target.classList.contains('sheet-bg')) closeModal(); };
  bind(root);
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

function openEditor(kind, it) {
  const isNew = !it;
  const base = it ? JSON.parse(JSON.stringify(it)) : {};
  const del = isNew ? '' : `<button class="btn danger" data-del="1">מחיקה</button>`;
  const today = occOf(new Date());

  if (kind === 'alarm') {
    const d = { days: base.days ? base.days.slice() : [0, 1, 2, 3, 4] };
    openModal(`<h3>${isNew ? 'שעון מעורר חדש' : 'עריכת שעון מעורר'}</h3>
      <input class="in time" type="time" id="f-time" value="${esc(base.time || '07:00')}">
      <label class="f">באילו ימים?</label>${dayPicker(d.days)}
      <label class="f">שם (לא חובה)</label><input class="in" id="f-label" placeholder="למשל: בית ספר" value="${esc(base.label || '')}">
      <div class="hint">🧠 כדי לכבות פותרים תרגיל חשבון קטן. נודניק אחד של 5 דקות מותר.</div>
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
      <label class="f" style="margin-top:0">מה?</label><input class="in" id="f-title" placeholder="למשל: חוג ריקוד" value="${esc(base.title || '')}">
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
    const d = { mode: (base.days && base.days.length) ? 'repeat' : 'once', days: base.days ? base.days.slice() : [], date: base.date || today, pts: base.pts || 5 };
    openModal(`<h3>${isNew ? 'משימה חדשה' : 'עריכת משימה'}</h3>
      <label class="f" style="margin-top:0">מה צריך לעשות?</label><input class="in" id="f-title" placeholder="למשל: שיעורי בית במתמטיקה" value="${esc(base.title || '')}">
      ${whenFields(d)}
      <label class="f">עד איזו שעה?</label><input class="in time" type="time" id="f-time" value="${esc(base.time || '20:00')}">
      <label class="f">כמה נקודות?</label>${opts('pts', [3, 5, 10, 15, 20], d.pts, v => v + '⭐')}
      <div class="hint">🔔 תזכורת חצי שעה לפני, ועוד אחת בזמן. בזמן = כל הנקודות, באיחור = חצי.</div>
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
        save(Object.assign(base, out, { id: base.id || uid('tk'), kind: 'task', title, time, pts: d.pts }));
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
