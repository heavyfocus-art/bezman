'use strict';
/* בזמן – parents' calendar: a month, and a day split between the children
   (each child gets an equal part of the screen). Uses app.js helpers inside functions only. */

let CAL = null; // { y, m, day: 'yyyy-mm-dd' | null }
const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
const KID_COLORS = { purple: '#8b6cf6', orange: '#f07a1a', yb: '#e6b800' };
const kidColor = k => KID_COLORS[k && k.theme] || KID_COLORS.purple;

function calState() {
  if (!CAL) { const n = new Date(); CAL = { y: n.getFullYear(), m: n.getMonth(), day: null }; }
  return CAL;
}

/** How many tasks / outings a child has that day (and how many were turned off). */
function calCounts(kid, d) {
  const occ = occOf(d);
  let n = 0, off = 0;
  list('task').concat(list('event')).forEach(it => {
    if (kidOf(it) !== kid || !occursOn(it, d)) return;
    if (offOn(it.id, occ)) off++; else n++;
  });
  return { n, off };
}

function calendarScreen() {
  const c = calState();
  if (c.day) return dayScreen(c.day);
  const ks = kids();
  const first = new Date(c.y, c.m, 1);
  const start = dayAdd(first, -first.getDay());
  const last = new Date(c.y, c.m + 1, 0);
  const weeks = Math.ceil((first.getDay() + last.getDate()) / 7);
  const today = occOf(new Date());
  let cells = '';
  for (let i = 0; i < weeks * 7; i++) {
    const d = dayAdd(start, i);
    const occ = occOf(d);
    const dots = ks.map(k => {
      const x = calCounts(k.kid, d);
      if (!x.n && !x.off) return '';
      return `<i style="--kc:${kidColor(k)}" class="${x.n ? '' : 'z'}">${x.n || '·'}</i>`;
    }).join('');
    cells += `<button class="cday ${d.getMonth() === c.m ? '' : 'out'} ${occ === today ? 'today' : ''}" data-cday="${occ}">
      <b>${d.getDate()}</b><span class="dots">${dots}</span></button>`;
  }
  const legend = ks.length ? `<div class="clegend">${ks.map(k => `<span><i style="background:${kidColor(k)}"></i>${esc(k.name)}</span>`).join('')}
    <span class="muted">המספר = משימות וחוגים באותו יום</span></div>` : '';
  return `<div class="hero" style="padding-bottom:18px"><div class="top"><div><h1>📅 יומן</h1><div class="date">לוחצים על יום כדי לראות ולשנות</div></div>
      <button class="sync" data-calnow="1">היום</button></div>
    <div class="calnav"><button data-calm="-1" aria-label="חודש קודם">→</button><b>${MONTHS[c.m]} ${c.y}</b><button data-calm="1" aria-label="חודש הבא">←</button></div></div>
  <main>
    ${ks.length ? '' : `<div class="card empty"><div class="e">📅</div>כשילד יתחבר, המשימות שלו יופיעו כאן</div>`}
    <div class="card cal">
      <div class="cgrid head">${DAYS.map(x => `<span>${x}</span>`).join('')}</div>
      <div class="cgrid">${cells}</div>
    </div>
    ${legend}
  </main>`;
}

/** One row in a child's half of the day. */
function calRow(r, k, now) {
  const it = r.it;
  const icon = { alarm: '⏰', event: '🎒', task: '📝' }[r.type];
  let time, title, sub, st = '';
  if (r.type === 'alarm') {
    time = it.time;
    title = 'שעון מעורר' + (it.label ? ' · ' + esc(it.label) : '');
    sub = r.off ? 'כבוי ביום הזה' : r.log ? `${k.gender === 'm' ? 'קם' : 'קמה'} ב-${tHM(r.log.at)}` : 'מצלצל ומעיר';
    if (!r.off && !r.log) st = alarmNote(r, now);
  } else if (r.type === 'event') {
    time = it.start;
    title = esc(it.title);
    sub = r.off ? 'לא מתקיים ביום הזה' : `יוצאים ב-${tHM(r.leave)}`;
    if (r.log) st = ` <span class="pill ok">יצא${k.gender === 'm' ? '' : 'ה'} ב-${tHM(r.log.at)}</span>`;
  } else {
    time = it.time || '—';
    title = esc(it.title);
    sub = r.off ? 'לא צריך ביום הזה' : `עד ${esc(it.time || 'סוף היום')} · ${it.pts || 5}⭐${it.photo ? ' · 📷' : ''}`;
    const ts = taskState(r.log);
    if (ts === 'approved') st = ` <span class="pill ok">✓ אושר</span>`;
    else if (ts === 'pending') st = ` <span class="pill wait">⏳ מחכה לאישור</span>`;
    else if (ts === 'missed') st = ` <span class="pill warn">✕ לא בוצע</span>`;
    else if (ts === 'rejected') st = ` <span class="pill warn">↩️ הוחזר</span>`;
  }
  // a parent can turn it off for this day only (not once it was already done / marked)
  const canOff = !r.log && r.occ >= occOf(new Date());
  const offBtn = canOff ? `<button class="offbtn ${r.off ? 'is-off' : ''} ${r.type === 'alarm' ? 'al' : ''}" data-off="${esc(it.id)}|${r.occ}|${esc(k.kid)}">${
    r.off ? '↩️ להחזיר' : r.type === 'alarm' ? '🔕 לכבות' : '🚫 לא היום'}</button>` : '';
  return `<div class="crow ${r.off ? 'isoff' : ''}" data-cedit="${esc(it.id)}">
    <div class="ct">${esc(time)}</div>
    <div class="cb"><div class="t1">${icon} ${title}</div><div class="t2">${sub}${st}</div></div>
    ${offBtn}</div>`;
}

function dayScreen(occ) {
  const d = new Date(at(occ, 0));
  const ks = kids();
  const now = Date.now();
  const isToday = occ === occOf(new Date());
  const title = (isToday ? 'היום · ' : '') + d.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });
  const panes = ks.map(k => {
    const rows = agenda(d, k.kid, true);
    const n = rows.filter(r => r.type === 'task' && !r.off).length;
    return `<section class="pane" style="--kc:${kidColor(k)}">
      <div class="pane-h"><i></i><b>${esc(k.name)}</b><span>${n ? n + ' משימות' : 'בלי משימות'}</span>
        <button class="add" data-newfor="${esc(k.kid)}|${occ}">+ משימה</button></div>
      <div class="pane-b">${rows.length ? rows.map(r => calRow(r, k, now)).join('')
        : `<div class="empty small">🌈 אין כלום ביום הזה</div>`}</div>
    </section>`;
  }).join('');
  return `<div class="dayview">
    <div class="dv-top">
      <button class="dv-btn" data-calback="1" aria-label="חזרה ללוח">📅 חודש</button>
      <button class="dv-arr" data-cstep="-1" aria-label="יום קודם">→</button>
      <div class="dv-t">${esc(title)}</div>
      <button class="dv-arr" data-cstep="1" aria-label="יום הבא">←</button>
    </div>
    <div class="dv-hint">לוחצים על שורה כדי לשנות · 🚫 / 🔕 מכבים רק ליום הזה</div>
    <div class="panes">${panes || `<div class="card empty" style="margin:16px"><div class="e">📅</div>עוד אין ילדים מחוברים</div>`}</div>
  </div>`;
}

function bindCalendar() {
  if (TAB !== 'calendar') return;
  const c = calState();
  const nav = document.querySelector('nav');
  if (nav) document.body.style.setProperty('--navh', nav.offsetHeight + 'px');
  document.querySelectorAll('[data-calm]').forEach(b => b.onclick = () => {
    const x = new Date(c.y, c.m + (+b.dataset.calm), 1);
    c.y = x.getFullYear(); c.m = x.getMonth(); render();
  });
  document.querySelectorAll('[data-calnow]').forEach(b => b.onclick = () => {
    const n = new Date(); c.y = n.getFullYear(); c.m = n.getMonth(); c.day = occOf(n); render();
  });
  document.querySelectorAll('[data-cday]').forEach(b => b.onclick = () => { c.day = b.dataset.cday; render(); });
  document.querySelectorAll('[data-calback]').forEach(b => b.onclick = () => {
    const d = new Date(at(c.day, 0)); c.y = d.getFullYear(); c.m = d.getMonth(); c.day = null; render();
  });
  document.querySelectorAll('[data-cstep]').forEach(b => b.onclick = () => {
    const d = dayAdd(new Date(at(c.day, 0)), +b.dataset.cstep);
    c.day = occOf(d); c.y = d.getFullYear(); c.m = d.getMonth(); render();
  });
  document.querySelectorAll('[data-cedit]').forEach(b => b.onclick = (e) => {
    if (e.target.closest('[data-off]')) return;
    const it = item(b.dataset.cedit);
    if (it) openEditor(it.kind, it);
  });
  document.querySelectorAll('[data-newfor]').forEach(b => b.onclick = () => {
    const [kid, occ] = b.dataset.newfor.split('|');
    openEditor('task', null, { kid, date: occ });
  });
  document.querySelectorAll('[data-off]').forEach(b => b.onclick = (e) => {
    e.stopPropagation();
    const [ref, occ, kid] = b.dataset.off.split('|');
    const id = `off:${ref}:${occ}`;
    const it = item(ref);
    const cur = item(id);
    if (cur) save(Object.assign({}, cur, { del: true }));
    else save({ id, kind: 'off', ref, occ, kid, title: it ? (it.title || it.label || it.time || '') : '' });
    const alarm = it && it.kind === 'alarm';
    toast(cur ? (alarm ? 'השעון יצלצל ביום הזה ⏰' : 'חזר ללו״ז של היום ✅')
      : (alarm ? 'השעון לא יצלצל ביום הזה 🔕' : 'בוטל ליום הזה בלבד 🚫'));
  });
}
