'use strict';
/* בזמן – personal design (parents), voice tasks (everyone), parents' report.
   Loaded before app.js; uses its helpers only inside functions. */

// =====================================================================
// 1) Personal design – kept on this phone only
// =====================================================================
const ACCENTS = {
  auto:   { name: 'לפי הילד', sw: 'linear-gradient(135deg,#6c4bf5 50%,#ffd200 50%)' },
  purple: { name: 'סגול', sw: '#6c4bf5', v: { violet: '#6c4bf5', soft: '#ece7ff', text: '#6c4bf5', on: '#fff', shadow: '#4b33c9', a2: '#9c84ff', h1: '#2b2160', h2: '#4b33c9' } },
  blue:   { name: 'כחול', sw: '#2f6fed', v: { violet: '#2f6fed', soft: '#e3ecff', text: '#2558c4', on: '#fff', shadow: '#1d4fb8', a2: '#7fa6ff', h1: '#10275c', h2: '#1f4fb3' } },
  green:  { name: 'ירוק', sw: '#1fa971', v: { violet: '#1fa971', soft: '#dcf6ea', text: '#137a51', on: '#fff', shadow: '#13804f', a2: '#6fd8aa', h1: '#0d3b2c', h2: '#147a55' } },
  pink:   { name: 'ורוד', sw: '#e94f8a', v: { violet: '#e94f8a', soft: '#ffe3ee', text: '#c23570', on: '#fff', shadow: '#b8336a', a2: '#ff94bd', h1: '#4a1530', h2: '#a3305f' } },
  orange: { name: 'כתום', sw: '#f07a1a', v: { violet: '#f07a1a', soft: '#ffecd9', text: '#b95807', on: '#fff', shadow: '#c25c0b', a2: '#ffb36b', h1: '#4a2208', h2: '#a8500d' } },
  teal:   { name: 'טורקיז', sw: '#0ea5b7', v: { violet: '#0ea5b7', soft: '#d9f5f8', text: '#0b7f8d', on: '#fff', shadow: '#0a7f8c', a2: '#6ad7e3', h1: '#073b42', h2: '#0b7f8d' } },
  yb:     { name: 'צהוב-שחור', sw: 'repeating-linear-gradient(135deg,#111 0 8px,#ffd200 8px 16px)' },
};
const BGS = {
  lavender: { name: 'לבנדר', c: '#f6f3ff' },
  white:    { name: 'לבן', c: '#ffffff' },
  sand:     { name: 'חול', c: '#f7f2e8' },
  mint:     { name: 'מנטה', c: '#eef8f3' },
  sky:      { name: 'שמיים', c: '#eef4fb' },
  gray:     { name: 'אפור', c: '#eef0f3' },
};
const SIZES = { s: { name: 'קטן', z: 90 }, m: { name: 'רגיל', z: 100 }, l: { name: 'גדול', z: 115 }, xl: { name: 'ענק', z: 130 } };
const SECTIONS = {
  approvals: '📝 מחכה לאישור',
  redeems:   '🎁 בקשות לפרסים',
  stats:     '📊 סיכום קצר',
  today:     '🗓️ מה קרה היום',
  gift:      '💜 כפתור בונוס',
  week:      '📈 7 ימים אחרונים',
  tomorrow:  '🌙 מחר',
};
const DEF_ORDER = ['approvals', 'redeems', 'stats', 'today', 'gift', 'week', 'tomorrow'];
const TABS_ALL = {
  today:   ['🏠', 'היום'],
  calendar:['📅', 'יומן'],
  plan:    ['🗓️', 'לו״ז'],
  report:  ['📊', 'דוח'],
  rewards: ['🎁', 'פרסים'],
  settings:['⚙️', 'הגדרות'],
};
const DEF_TABS_PARENT = ['today', 'calendar', 'plan', 'report', 'rewards', 'settings'];
const DEF_TABS_CHILD = ['today', 'plan', 'rewards', 'settings'];

let UI = null;
function uiPrefs() {
  if (UI) return UI;
  let p = {};
  try { p = JSON.parse((B.getPrefs && B.getPrefs()) || '{}') || {}; } catch (e) { p = {}; }
  UI = Object.assign({ accent: 'auto', bg: 'lavender', size: 'm', order: DEF_ORDER.slice(), hidden: [], tabs: null }, p);
  // keep lists complete after app updates
  UI.order = UI.order.filter(k => SECTIONS[k]).concat(DEF_ORDER.filter(k => UI.order.indexOf(k) < 0));
  return UI;
}
function saveUi() {
  try { if (B.setPrefs) B.setPrefs(JSON.stringify(UI)); } catch (e) {}
}
function tabOrder() {
  const def = isChild() ? DEF_TABS_CHILD : DEF_TABS_PARENT;
  const t = (!isChild() && uiPrefs().tabs) || def;
  const out = t.filter(k => def.indexOf(k) >= 0);
  // a tab added in a newer version goes next to its usual neighbour
  def.forEach((k, i) => { if (out.indexOf(k) < 0) out.splice(i ? out.indexOf(def[i - 1]) + 1 : 0, 0, k); });
  return out;
}

/** Applies colors / background / text size. Only parents personalise; kids keep their own theme. */
function applyDesign() {
  const st = document.body.style;
  ['--violet', '--violet-soft', '--acc-text', '--on-acc', '--acc-shadow', '--acc-2', '--hero', '--ob', '--bg']
    .forEach(k => st.removeProperty(k));
  let zoom = 100;
  if (S && S.me && S.me.role && !isChild()) {
    const p = uiPrefs();
    if (p.accent === 'yb') document.body.dataset.theme = 'yb';
    else if (p.accent !== 'auto' && ACCENTS[p.accent]) {
      document.body.dataset.theme = 'purple';
      const v = ACCENTS[p.accent].v;
      st.setProperty('--violet', v.violet);
      st.setProperty('--violet-soft', v.soft);
      st.setProperty('--acc-text', v.text);
      st.setProperty('--on-acc', v.on);
      st.setProperty('--acc-shadow', v.shadow);
      st.setProperty('--acc-2', v.a2);
      st.setProperty('--hero', `linear-gradient(160deg, ${v.h1} 0%, ${v.h2} 60%, ${v.violet} 100%)`);
    }
    if (document.body.dataset.theme !== 'yb' && BGS[p.bg]) st.setProperty('--bg', BGS[p.bg].c);
    zoom = (SIZES[p.size] || SIZES.m).z;
  }
  if (B.setTextZoom) B.setTextZoom(zoom);
  else document.body.style.zoom = zoom / 100;
}
function heroColor() {
  if (document.body.dataset.theme === 'yb') return '#000000';
  if (S && S.me && !isChild()) {
    const a = ACCENTS[uiPrefs().accent];
    if (a && a.v) return a.v.h1;
  }
  return '#2b2160';
}

function openDesign() {
  const p = uiPrefs();
  const sw = (group, key, style, label, on) =>
    `<button class="sw ${on ? 'on' : ''}" data-${group}="${key}" style="${style}" aria-label="${esc(label)}"><span>${esc(label)}</span></button>`;
  const html = () => `<h3>🎨 עיצוב אישי</h3>
    <p class="muted small" style="margin-top:-6px">נשמר רק בטלפון הזה. השינויים נראים מאחורי החלון.</p>
    <label class="f">צבע</label>
    <div class="swatches">${Object.entries(ACCENTS).map(([k, a]) => sw('accent', k, `background:${a.sw}`, a.name, p.accent === k)).join('')}</div>
    <label class="f">רקע</label>
    <div class="swatches">${Object.entries(BGS).map(([k, b]) => sw('bg', k, `background:${b.c}`, b.name, p.bg === k)).join('')}</div>
    <label class="f">גודל טקסט</label>
    <div class="seg">${Object.entries(SIZES).map(([k, s]) => `<button class="${p.size === k ? 'on' : ''}" data-size="${k}" style="font-size:${s.z * 0.15}px">${s.name}</button>`).join('')}</div>
    <label class="f">מה מופיע במסך "היום" ובאיזה סדר</label>
    <div class="orderlist">${p.order.map((k, i) => `<div class="ordrow ${p.hidden.indexOf(k) >= 0 ? 'hid' : ''}">
        <button class="eye" data-eye="${k}">${p.hidden.indexOf(k) >= 0 ? '🚫' : '👁️'}</button>
        <span class="on">${SECTIONS[k]}</span>
        <button class="mv" data-up="${k}" ${i === 0 ? 'disabled' : ''}>▲</button>
        <button class="mv" data-down="${k}" ${i === p.order.length - 1 ? 'disabled' : ''}>▼</button></div>`).join('')}</div>
    <label class="f">סדר הכפתורים בתחתית</label>
    <div class="orderlist">${tabOrder().map((k, i, arr) => `<div class="ordrow">
        <span class="on">${TABS_ALL[k][0]} ${TABS_ALL[k][1]}</span>
        <button class="mv" data-tup="${k}" ${i === 0 ? 'disabled' : ''}>▲</button>
        <button class="mv" data-tdown="${k}" ${i === arr.length - 1 ? 'disabled' : ''}>▼</button></div>`).join('')}</div>
    <div class="actions"><button class="btn light" data-dreset="1">איפוס</button><button class="btn" data-c="no">סיום ✅</button></div>`;
  const move = (arr, k, d) => { const i = arr.indexOf(k), j = i + d; if (i < 0 || j < 0 || j >= arr.length) return; arr.splice(i, 1); arr.splice(j, 0, k); };
  const refresh = () => {
    saveUi();
    const sheet = $('#modal-root .sheet');
    const y = sheet ? sheet.scrollTop : 0;
    render();
    if (sheet) { sheet.innerHTML = '<div class="grab"></div>' + html(); sheet.scrollTop = y; bindIt($('#modal-root')); }
  };
  const bindIt = root => {
    root.querySelector('[data-c=no]').onclick = closeModal;
    root.querySelectorAll('[data-accent]').forEach(b => b.onclick = () => { p.accent = b.dataset.accent; refresh(); });
    root.querySelectorAll('[data-bg]').forEach(b => b.onclick = () => { p.bg = b.dataset.bg; refresh(); });
    root.querySelectorAll('[data-size]').forEach(b => b.onclick = () => { p.size = b.dataset.size; refresh(); });
    root.querySelectorAll('[data-eye]').forEach(b => b.onclick = () => {
      const k = b.dataset.eye, i = p.hidden.indexOf(k);
      if (i >= 0) p.hidden.splice(i, 1); else p.hidden.push(k);
      refresh();
    });
    root.querySelectorAll('[data-up]').forEach(b => b.onclick = () => { move(p.order, b.dataset.up, -1); refresh(); });
    root.querySelectorAll('[data-down]').forEach(b => b.onclick = () => { move(p.order, b.dataset.down, 1); refresh(); });
    root.querySelectorAll('[data-tup]').forEach(b => b.onclick = () => { p.tabs = tabOrder(); move(p.tabs, b.dataset.tup, -1); refresh(); });
    root.querySelectorAll('[data-tdown]').forEach(b => b.onclick = () => { p.tabs = tabOrder(); move(p.tabs, b.dataset.tdown, 1); refresh(); });
    root.querySelector('[data-dreset]').onclick = () => {
      UI = { accent: 'auto', bg: 'lavender', size: 'm', order: DEF_ORDER.slice(), hidden: [], tabs: null };
      Object.assign(p, UI); UI = p; refresh();
    };
  };
  openModal(html(), bindIt);
}

/** Parent home: sections in the parent's own order, hidden ones left out. */
function parentSections(parts) {
  const p = uiPrefs();
  return p.order.filter(k => p.hidden.indexOf(k) < 0).map(k => parts[k] || '').join('');
}

// =====================================================================
// 2) Voice: speak a task → filled-in editor
// =====================================================================
const HEB_NUM = {
  'אחת': 1, 'אחד': 1, 'שתיים': 2, 'שתים': 2, 'שניים': 2, 'שלוש': 3, 'שלושה': 3, 'ארבע': 4, 'ארבעה': 4, 'חמש': 5, 'חמישה': 5,
  'שש': 6, 'שישה': 6, 'שבע': 7, 'שבעה': 7, 'שמונה': 8, 'תשע': 9, 'תשעה': 9, 'עשר': 10, 'עשרה': 10,
  'אחת עשרה': 11, 'אחד עשר': 11, 'שתים עשרה': 12, 'שתיים עשרה': 12, 'שנים עשר': 12,
};
const DAY_WORDS = { 'ראשון': 0, 'שני': 1, 'שלישי': 2, 'רביעי': 3, 'חמישי': 4, 'שישי': 5, 'שבת': 6 };

/** Very small Hebrew parser: what / when / what time. Everything can be fixed in the editor. */
function parseVoice(raw) {
  let t = ' ' + String(raw || '').replace(/[.,!?]/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
  const out = { kind: 'task', title: '', date: '', days: [], time: '' };
  const cut = re => { const m = t.match(re); if (m) t = t.replace(m[0], ' '); return m; };

  // kind
  if (/שעון מעורר|להעיר אות|תעיר אות|השכמה/.test(t)) out.kind = 'alarm';
  else if (/(^| )(חוג|אימון|לצאת ל|יציאה ל|הסעה|מסיבה|מפגש|תור ל)/.test(t)) out.kind = 'event';

  // day
  const today = new Date();
  let m;
  if ((m = cut(/ (בימי חול|כל יום חול|ימי חול|ראשון עד חמישי|א עד ה) /))) out.days = [0, 1, 2, 3, 4];
  else if ((m = cut(/ (?:כל|בכל|בימי) (?:יום )?(ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת) /))) out.days = [DAY_WORDS[m[1]]];
  else if ((m = cut(/ (כל יום|בכל יום|כל ערב|כל בוקר) /))) out.days = [0, 1, 2, 3, 4, 5, 6];
  else if ((m = cut(/ (מחרתיים) /))) out.date = occOf(dayAdd(today, 2));
  else if ((m = cut(/ (מחר|למחר) /))) out.date = occOf(dayAdd(today, 1));
  else if ((m = cut(/ (היום|הערב|הבוקר) /))) out.date = occOf(today);
  else if ((m = cut(/ (?:ב?יום |ב)(ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת) /))) {
    const want = DAY_WORDS[m[1]];
    let d = new Date(today);
    for (let i = 1; i <= 7; i++) { d = dayAdd(today, i); if (d.getDay() === want) break; }
    out.date = occOf(d);
  }

  // part of day
  let pm = null;
  if (/ (בערב|בלילה|אחר הצהריים|אחרי הצהריים|אחה"צ|אחהצ) /.test(t)) pm = true;
  else if (/ (בבוקר|לפנות בוקר) /.test(t)) pm = false;
  else if (/ (בצהריים) /.test(t)) pm = 'noon';
  t = t.replace(/ (בערב|בלילה|אחר הצהריים|אחרי הצהריים|אחה"צ|אחהצ|בבוקר|לפנות בוקר|בצהריים) /g, ' ');

  // time
  let h = -1, mi = 0;
  if ((m = cut(/ (?:עד |ב-?|בשעה |לשעה |עד השעה |עד שעה )?(\d{1,2})[:.](\d{2}) /))) { h = +m[1]; mi = +m[2]; }
  else if ((m = cut(/ (?:עד |ב-?|בשעה |לשעה |עד השעה |עד שעה )(\d{1,2})(?: ו?(חצי|רבע))? /))) {
    h = +m[1]; mi = m[2] === 'חצי' ? 30 : m[2] === 'רבע' ? 15 : 0;
  } else {
    const words = Object.keys(HEB_NUM).sort((a, b) => b.length - a.length).join('|');
    const re = new RegExp(` (?:עד |ב|בשעה |לשעה |עד השעה )(${words})(?: ו(חצי|רבע))? `);
    if ((m = cut(re))) { h = HEB_NUM[m[1]]; mi = m[2] === 'חצי' ? 30 : m[2] === 'רבע' ? 15 : 0; }
  }
  if (h >= 0 && h < 24) {
    if (h <= 12) {
      if (pm === true && h < 12) h += 12;
      else if (pm === 'noon' && h < 6) h += 12;
      else if (pm === null && out.kind !== 'alarm' && h >= 1 && h <= 7) h += 12; // "עד 6" for homework = 18:00
    }
    out.time = pad(h % 24) + ':' + pad(mi);
  }

  // what's left is the title
  t = t.replace(/ (תזכיר לי|תזכירי לי|תוסיף|תוסיפי|להוסיף|הוסף|הוסיפי|משימה חדשה|משימה|תרשום|תרשמי|צריך|צריכה|צריכים|אני רוצה|בבקשה|שעון מעורר|לקבוע) /g, ' ');
  t = t.replace(/ (עד|בשעה|ב|ל|של|ו)$/, ' ').replace(/^ (ל|את) /, ' ').replace(/\s+/g, ' ').trim();
  out.title = t ? t.charAt(0) + t.slice(1) : '';
  return out;
}

let VOICE_MODE = 'new';
function startVoice(mode) {
  VOICE_MODE = mode || 'new';
  if (!B.voice) return toast('המיקרופון לא זמין בגרסה הזו');
  B.voice();
}
/** Called by the phone with what was said ('' if nothing / no recogniser). */
window.onVoice = (text, err) => {
  if (err) { toast(err); return; }
  text = String(text || '').trim();
  if (!text) { toast('לא שמעתי… נסו שוב 🎤'); return; }
  if (VOICE_MODE === 'title') {
    const f = document.querySelector('#f-title');
    if (f) { f.value = text; f.dispatchEvent(new Event('input')); }
    return;
  }
  const v = parseVoice(text);
  const pre = { title: v.title || text };
  if (v.kind === 'alarm') {
    if (v.time) pre.time = v.time;
    if (v.days.length) pre.days = v.days;
  } else if (v.kind === 'event') {
    if (v.time) pre.start = v.time;
    if (v.date) pre.date = v.date;
    if (v.days.length) pre.days = v.days;
  } else {
    if (v.time) pre.time = v.time;
    if (v.date) pre.date = v.date;
    if (v.days.length) pre.days = v.days;
  }
  if (MODAL) closeModal();
  openEditor(v.kind, null, pre);
  toast(`🎤 "${text}"`);
};

function micFab() {
  return `<button class="mic-fab" data-mic="1" aria-label="הוספה בקול">🎤</button>`;
}

// =====================================================================
// 3) Parents' report
// =====================================================================
let REP = 'week';
function periodStart(p) {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  if (p === 'week') { d.setDate(d.getDate() - d.getDay()); return d; }
  if (p === 'month') { d.setDate(1); return d; }
  if (p === '30') { d.setDate(d.getDate() - 29); return d; }
  return null;
}
function kidStats(kid, p) {
  const from = periodStart(p);
  const fromOcc = from ? occOf(from) : '0000';
  const inP = o => (o.occ || occOf(new Date(o.at || o.upd || 0))) >= fromOcc;
  const logs = list('log').filter(l => kidOf(l) === kid && inP(l));
  const reds = list('redeem').filter(r => kidOf(r) === kid && r.status !== 'declined' && (r.at || r.upd || 0) >= (from ? from.getTime() : 0));
  const s = {
    earned: 0, lost: 0, spent: reds.reduce((a, r) => a + (r.cost || 0), 0), rewards: reds.length,
    done: 0, onTime: 0, late: 0, pending: 0, missed: 0, autoMissed: 0,
    woke: 0, wokeOnTime: 0, wakeMissed: 0, left: 0, leftOnTime: 0, leaveMissed: 0, bonus: 0, logs,
  };
  logs.forEach(l => {
    const pts = l.pts || 0;
    if (pts > 0) s.earned += pts; else s.lost += -pts;
    switch (l.type) {
      case 'task_done':
        if (l.status === 'pending') s.pending++;
        else if (l.status === 'approved' || !l.status) { s.done++; if (l.late) s.late++; else s.onTime++; }
        break;
      case 'task_missed': s.missed++; if (l.auto) s.autoMissed++; break;
      case 'woke': s.woke++; if (pts >= 10) s.wokeOnTime++; break;
      case 'wake_missed': s.wakeMissed++; break;
      case 'left': s.left++; if (!l.late) s.leftOnTime++; break;
      case 'leave_missed': s.leaveMissed++; break;
      case 'gift': case 'bonus': s.bonus += pts; break;
    }
  });
  s.rate = (s.done + s.missed) ? Math.round(s.done / (s.done + s.missed) * 100) : null;
  const sc = item('score:' + kid) || (kid === legacyKid() ? item('score') : null);
  s.balance = sc ? sc.pts || 0 : 0;
  s.streak = sc ? sc.streak || 0 : 0;
  return s;
}
function ring(pct, label) {
  const p = pct == null ? 0 : pct;
  const col = pct == null ? '#cfcbe0' : p >= 80 ? 'var(--mint)' : p >= 50 ? 'var(--sun)' : 'var(--red)';
  return `<div class="ring" style="background:conic-gradient(${col} ${p * 3.6}deg, var(--line) 0)"><div><b>${pct == null ? '—' : p + '%'}</b><span>${label}</span></div></div>`;
}
function reportScreen() {
  const ks = kids();
  const per = { week: 'השבוע', month: 'החודש', '30': '30 יום', all: 'הכל' };
  const head = `<div class="hero" style="padding-bottom:18px"><div class="top"><div><h1>📊 דוח</h1><div class="date">משימות ונקודות – ${per[REP]}</div></div></div>${kidTabs()}</div>`;
  if (!ks.length) return head + `<main><div class="card empty"><div class="e">📊</div>כשילד יתחבר, יופיע כאן הדוח שלו</div></main>`;
  const s = kidStats(KID, REP);
  const tile = (n, l, cls) => `<div class="tile ${cls || ''}"><b>‎${n}</b><span>${l}</span></div>`;

  // daily bars
  const from = periodStart(REP) || (() => { const d = new Date(); d.setDate(d.getDate() - 29); d.setHours(0, 0, 0, 0); return d; })();
  const days = [];
  for (let d = new Date(from); d <= new Date(); d = dayAdd(d, 1)) days.push(new Date(d));
  const show = days.slice(-31);
  const vals = show.map(d => s.logs.filter(l => l.occ === occOf(d)).reduce((a, l) => a + (l.pts || 0), 0));
  const max = Math.max(10, ...vals.map(Math.abs));
  const bars = `<div class="week rep">${show.map((d, i) => `<div class="col"><div class="n">${vals[i] ? '‎' + vals[i] : ''}</div>
      <div class="b ${vals[i] < 0 ? 'neg' : ''}" style="height:${Math.max(vals[i] ? 6 : 2, Math.round(Math.abs(vals[i]) / max * 80))}%"></div>
      <div class="d">${show.length > 8 ? d.getDate() : DAYS[d.getDay()]}</div></div>`).join('')}</div>`;

  // history
  const hist = s.logs.filter(l => l.type === 'task_done' || l.type === 'task_missed')
    .sort((a, b) => (b.at || b.upd || 0) - (a.at || a.upd || 0)).slice(0, 40);
  const st = l => l.type === 'task_missed' ? ['warn', l.auto ? 'לא סומן' : 'לא בוצע']
    : l.status === 'pending' ? ['wait', 'מחכה'] : l.status === 'rejected' ? ['warn', 'הוחזר'] : [l.late ? 'sun' : 'ok', l.late ? 'באיחור' : 'בזמן'];
  const histHtml = hist.length ? hist.map(l => {
    const [c, t] = st(l);
    const d = new Date(at(l.occ, 0));
    return `<div class="row"><div class="ico ${l.type === 'task_missed' ? 'event' : 'task'}">${l.type === 'task_missed' ? '✕' : '✓'}</div>
      <div class="body"><div class="t1">${esc(l.title)}</div><div class="t2">${DAYS_LONG[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}</div></div>
      <span class="pill ${c}">${t} · ‎${l.pts > 0 ? '+' : ''}${l.pts || 0}⭐</span></div>`;
  }).join('') : `<div class="empty">אין משימות בתקופה הזו</div>`;

  // compare kids
  const cmp = ks.length > 1 ? `<div class="sec-title"><h2>👧👦 השוואה</h2></div><div class="card"><table class="cmp">
      <tr><th></th><th>⭐ הרוויחו</th><th>✅ בוצעו</th><th>✕ לא</th><th>%</th></tr>
      ${ks.map(k => { const x = kidStats(k.kid, REP); return `<tr class="${k.kid === KID ? 'me' : ''}" data-kid="${esc(k.kid)}"><td>${esc(k.name)}</td><td>‎${x.earned}</td><td>${x.done}</td><td>${x.missed}</td><td>${x.rate == null ? '—' : x.rate + '%'}</td></tr>`; }).join('')}
    </table></div>` : '';

  return head + `<main>
    <div class="seg" style="margin-top:4px">${Object.entries(per).map(([k, n]) => `<button class="${REP === k ? 'on' : ''}" data-rep="${k}">${n}</button>`).join('')}</div>

    <div class="sec-title"><h2>⭐ נקודות – ${esc(kidName())}</h2></div>
    <div class="tiles">
      ${tile('+' + s.earned, 'הרוויח' + G('ה', ''), 'good')}
      ${tile('-' + s.lost, 'ירדו', s.lost ? 'bad' : '')}
      ${tile(s.spent, 'מומשו בפרסים')}
      ${tile(s.balance, 'יתרה עכשיו', 'big')}
    </div>

    <div class="sec-title"><h2>✅ משימות</h2></div>
    <div class="card"><div style="display:flex;gap:14px;align-items:center">
      ${ring(s.rate, 'בוצעו')}
      <div class="tiles mini" style="flex:1">
        ${tile(s.done, 'בוצעו ואושרו', 'good')}
        ${tile(s.onTime, 'מתוכן בזמן')}
        ${tile(s.missed, 'לא בוצעו', s.missed ? 'bad' : '')}
        ${tile(s.pending, 'מחכות לאישור')}
      </div></div></div>

    <div class="sec-title"><h2>⏰ השכמה ויציאה</h2></div>
    <div class="tiles">
      ${tile(s.wokeOnTime + '/' + (s.woke + s.wakeMissed), 'קמ' + G('ה', '') + ' בלי נודניק')}
      ${tile(s.wakeMissed, 'לא כיבו את השעון', s.wakeMissed ? 'bad' : '')}
      ${tile(s.leftOnTime + '/' + (s.left + s.leaveMissed), 'יצא' + G('ה', '') + ' בזמן')}
      ${tile(s.streak, '🔥 ימים ברצף')}
    </div>

    <div class="sec-title"><h2>📈 נקודות לפי יום</h2></div>
    <div class="card">${bars}</div>
    ${cmp}
    <div class="sec-title"><h2>📝 היסטוריית משימות</h2></div>
    <div class="card">${histHtml}</div>
  </main>`;
}
function statsMini() {
  const s = kidStats(KID, 'week');
  return `<div class="sec-title"><h2>📊 השבוע</h2><button class="add" data-tab="report">לדוח המלא</button></div>
    <div class="tiles mini4">
      <div class="tile good"><b>‎+${s.earned}</b><span>נקודות</span></div>
      <div class="tile"><b>${s.done}</b><span>משימות בוצעו</span></div>
      <div class="tile ${s.missed ? 'bad' : ''}"><b>${s.missed}</b><span>לא בוצעו</span></div>
      <div class="tile"><b>${s.rate == null ? '—' : s.rate + '%'}</b><span>הצלחה</span></div>
    </div>`;
}
