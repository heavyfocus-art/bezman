'use strict';
/* בזמן – the kids' game screens. Each design (themes.js) can have:
   board(ctx) – a game picture at the top of the child's "today" (made from real data: tasks, wake-ups, points),
   done – the text on the "done" button, sec – the title of the list, sub(it) – what a task is worth, tag(it) – a small label.
   Loaded before app.js; uses its helpers only inside functions. */

// ---------- data the games are made of ----------
function weekStart(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - x.getDay()); return x; }
const myLogs = () => mine('log');
/** Today's tasks: how many, how many marked done (waiting or approved). */
function todayTasks() {
  const rows = agenda(new Date()).filter(r => r.type === 'task');
  const done = rows.filter(r => ['approved', 'pending'].indexOf(taskState(r.log)) >= 0).length;
  return { rows, total: rows.length, done, left: rows.filter(r => ['open', 'rejected'].indexOf(taskState(r.log)) >= 0).length };
}
/** Was this a "good" thing (on time) or a "bad" one (late / missed)? */
function goodBad(l) {
  switch (l.type) {
    case 'task_done': return l.status === 'rejected' ? 0 : l.late ? -1 : 1;
    case 'task_missed': case 'wake_missed': case 'leave_missed': return -1;
    case 'woke': return (l.pts || 0) >= 10 ? 1 : -1;
    case 'left': return l.late ? -1 : 1;
    default: return 0;
  }
}
function matchOf(from) {
  const a = occOf(from), b = occOf(dayAdd(from, 7));
  let me = 0, clock = 0;
  myLogs().forEach(l => { if (l.occ >= a && l.occ < b) { const g = goodBad(l); if (g > 0) me++; else if (g < 0) clock++; } });
  return { me, clock };
}
/** A good day: points earned and nothing missed. */
function goodDay(d) {
  const o = occOf(d);
  const ls = myLogs().filter(l => l.occ === o);
  return ls.some(l => (l.pts || 0) > 0) && !ls.some(l => goodBad(l) < 0);
}
function nextLine(nx, now) {
  if (!nx) return '';
  return nx.t > now ? `${esc(nx.what)} · ${nx.label || 'בעוד'} ${dur(nx.t - now)}` : `${esc(nx.what)} · עכשיו!`;
}
/** "25 דק׳", or "עכשיו!" when it is already due. */
const until = (nx, now) => nx.t > now ? dur(nx.t - now) : 'עכשיו!';
const initial = n => esc(String(n || '?').trim().charAt(0));

// ---------- pictures ----------
function rocketSvg(fuel) {
  const up = fuel >= 100;
  return `<svg viewBox="0 0 80 150" width="80" height="150" aria-hidden="true" class="${up ? 'liftoff' : ''}">
    <g class="rk">
      <path d="M40 6 C58 24 60 52 58 86 H22 C20 52 22 24 40 6z" fill="#EEF2FF"/>
      <path d="M40 6 C49 15 54 26 56 38 H24 C26 26 31 15 40 6z" fill="#FF6B4A"/>
      <circle cx="40" cy="56" r="10" fill="#7FE3FF" stroke="#2E3B7A" stroke-width="4"/>
      <path d="M22 70 L8 92 L22 88z M58 70 L72 92 L58 88z" fill="#FF6B4A"/>
      <rect x="28" y="86" width="24" height="8" rx="3" fill="#B5BFEA"/>
      ${up ? '<path class="flame" d="M30 94 Q40 132 50 94z" fill="#FFD84D"/><path class="flame" d="M34 94 Q40 116 46 94z" fill="#FF6B4A"/>' : ''}
    </g>
    <rect x="18" y="142" width="44" height="6" rx="3" fill="#2E3B7A"/></svg>`;
}
function petSvg(stage, happy) {
  const mouth = happy ? '<path d="M44 66 Q52 74 60 66" stroke="#2B2148" stroke-width="3.5" fill="none" stroke-linecap="round"/>'
    : '<ellipse cx="52" cy="69" rx="6" ry="5" fill="#2B2148"/>';
  const eyes = happy ? '<path d="M36 52 Q41 46 46 52 M58 52 Q63 46 68 52" stroke="#2B2148" stroke-width="3.5" fill="none" stroke-linecap="round"/>'
    : '<circle cx="41" cy="52" r="5" fill="#2B2148"/><circle cx="63" cy="52" r="5" fill="#2B2148"/><circle cx="43" cy="50" r="1.6" fill="#fff"/><circle cx="65" cy="50" r="1.6" fill="#fff"/>';
  if (stage <= 1) {
    return `<svg viewBox="0 0 104 110" width="110" height="116" aria-hidden="true" class="pet wob">
      <ellipse cx="52" cy="62" rx="36" ry="44" fill="#FFF1D6" stroke="#E8C98F" stroke-width="3"/>
      <path d="M22 58 L32 50 L40 60 L50 48 L58 60 L68 50 L80 58" stroke="#E8C98F" stroke-width="3" fill="none"/>
      ${eyes}<circle cx="34" cy="64" r="5" fill="#FF8FB1" opacity=".6"/><circle cx="70" cy="64" r="5" fill="#FF8FB1" opacity=".6"/></svg>`;
  }
  const s = 0.72 + stage * 0.07;
  return `<svg viewBox="0 0 104 110" width="${Math.round(140 * s)}" height="${Math.round(148 * s)}" aria-hidden="true" class="pet ${happy ? 'hop' : 'wob'}">
    ${stage >= 5 ? '<path d="M36 14 L42 2 L52 12 L62 2 L68 14z" fill="#FFC83D" stroke="#C99400" stroke-width="2"/>' : ''}
    <path d="M24 30 L18 8 L40 22z M80 30 L86 8 L64 22z" fill="#7A4FE0"/>
    <ellipse cx="52" cy="62" rx="40" ry="42" fill="#8B63F2"/>
    <ellipse cx="52" cy="76" rx="24" ry="20" fill="#B79CFF"/>
    ${eyes}${mouth}
    <circle cx="32" cy="64" r="6" fill="#FF8FB1" opacity=".7"/><circle cx="72" cy="64" r="6" fill="#FF8FB1" opacity=".7"/>
    <ellipse cx="34" cy="102" rx="10" ry="5" fill="#7A4FE0"/><ellipse cx="70" cy="102" rx="10" ry="5" fill="#7A4FE0"/></svg>`;
}
const STICKERS = ['⭐', '🦄', '🌈', '🍓', '🐱', '🌸', '🎈', '🐶', '🍦', '🦋', '🐼', '🌻'];
const FOODS = ['תפוח ענק 🍎', 'עוגייה 🍪', 'גזר 🥕', 'בננה 🍌', 'אבטיח 🍉', 'פנקייק 🥞', 'ענבים 🍇'];
const hashOf = s => { let h = 0; for (let i = 0; i < String(s).length; i++) h = (h * 31 + String(s).charCodeAt(i)) | 0; return Math.abs(h); };

// ---------- the games ----------
const GAMES = {
  // ח · ליגת הזמן – the week is a match: on time = your goal, late / missed = the clock's goal
  league: {
    done: 'גול! ⚽', sec: 'בעיטות לשער היום', sub: it => `${it.pts || 5} נקודות`,
    board(c) {
      const ws = weekStart(new Date());
      const m = matchOf(ws);
      let w = 0, d = 0, l = 0;
      for (let i = 1; i <= 4; i++) { const x = matchOf(dayAdd(ws, -7 * i)); if (!x.me && !x.clock) continue; if (x.me > x.clock) w++; else if (x.me < x.clock) l++; else d++; }
      const lead = m.me > m.clock ? 'מוביל' + G('ה', '') + '! 🔥' : m.me < m.clock ? 'השעון מוביל – אפשר להפוך את המשחק!' : 'תיקו – הגול הבא מכריע';
      return `<div class="gb gb-league">
        <div class="lg-top"><b>ליגת הזמן</b><span>משחק השבוע · יום ${new Date().getDay() + 1}</span></div>
        <div class="lg-score">
          <div class="lg-team"><span class="lg-av">${initial(c.name)}</span><b>${esc(c.name)}</b></div>
          <div class="lg-num"><span class="me">${m.me}</span><i>:</i><span>${m.clock}</span></div>
          <div class="lg-team"><span class="lg-av clock">⏰</span><b>השעון</b></div>
        </div>
        <div class="lg-lead">${lead}</div>
        <div class="lg-rule">משימה בזמן = גול שלך · באיחור או לא בוצע = גול של השעון</div>
        ${c.nx ? `<div class="lg-next"><span>הבא בתור</span><b>${esc(c.nx.what)}</b><em>${until(c.nx, c.now)}</em></div>` : ''}
        <div class="lg-season">העונה: <b>${w} ניצחונות</b> · ${d} תיקו · ${l} הפסדים</div>
      </div>`;
    },
  },
  // ו · משימה לחלל – today's tasks fill the rocket's fuel; a good day = a planet
  space: {
    done: 'סיימתי 🚀', sec: 'למלא דלק',
    sub: it => { const t = todayTasks().total || 1; return `‎+${Math.round(100 / t)}% דלק`; },
    board(c) {
      const t = c.tt, fuel = t.total ? Math.round(t.done / t.total * 100) : 100;
      const ws = weekStart(new Date()), today = occOf(new Date());
      let visited = 0;
      const planets = [0, 1, 2, 3, 4, 5, 6].map(i => {
        const d = dayAdd(ws, i), o = occOf(d);
        const ok = o < today ? goodDay(d) : o === today ? fuel >= 100 : false;
        if (ok) visited++;
        return `<div class="sp-pl ${ok ? 'on' : ''} ${o === today ? 'now' : ''}"><span></span>${DAYS[i].replace('׳', '')}</div>`;
      }).join('');
      return `<div class="gb gb-space">
        <div class="sp-row">${rocketSvg(fuel)}
          <div class="sp-info"><span class="sp-k">תחנת שיגור</span><b>${G('קפטנית', 'קפטן')} ${esc(c.name)}</b>
            ${c.nx ? `<span class="sp-t">${c.nx.t > c.now ? 'T-' + dur(c.nx.t - c.now) : 'עכשיו!'}</span>` : ''}
            <span>${t.left ? `עוד ${t.left} משימות והטיל ממריא!` : t.total ? '🚀 הטיל המריא! כל המשימות הושלמו' : 'אין משימות היום – הטיל מוכן'}</span>
            ${c.nx ? `<small>היעד הבא: ${esc(c.nx.what.replace(/^\S+ /, ''))}</small>` : ''}</div></div>
        <div class="sp-fuel"><span>דלק</span><b>${fuel}%</b></div><div class="sp-bar"><div style="width:${fuel}%"></div></div>
        <div class="sp-ph"><span>כוכבי הלכת של השבוע</span><span>${visited} מתוך 7</span></div>
        <div class="sp-planets">${planets}</div>
      </div>`;
    },
  },
  // ה · חבר שגדל – a pet that eats when tasks are done and grows with the points
  pet: {
    done: 'להאכיל 🍎', sec: 'להאכיל את פוקי', sub: it => FOODS[hashOf(it.id) % FOODS.length],
    board(c) {
      const t = c.tt;
      const full = t.total ? Math.round(t.done / t.total * 100) : 100;
      const happy = Math.min(100, 30 + c.sc.streak * 14);
      const stage = Math.min(5, c.L.lvl);
      const names = ['', 'ביצה', 'תינוק', 'צעיר', 'גדול', 'אלוף'];
      const open = t.rows.find(r => ['open', 'rejected'].indexOf(taskState(r.log)) >= 0);
      const msg = !t.total ? 'בוא נשחק! היום אין משימות 💜'
        : open ? `אני רעב! אם ${G('תסיימי', 'תסיים')} "${esc(open.it.title)}" עד ${esc(open.it.time || 'הערב')} אגדל עוד קצת`
        : 'אני שבע ומאושר! תודה 💜';
      const bar = (n, v, col) => `<div class="pt-st"><span>${n}</span><div class="pt-bar"><div style="width:${v}%;background:${col}"></div></div></div>`;
      return `<div class="gb gb-pet">
        <div class="pt-head"><b>פוקי של ${esc(c.name)}</b><span>שלב ${stage} מתוך 5 · ${names[stage]}</span></div>
        <div class="pt-stage"><div class="pt-bubble">${msg}</div>${petSvg(stage, !open)}</div>
        <div class="pt-stats">${bar('שמחה', happy, '#FF8FB1')}${bar('שובע', full, '#FFC83D')}${bar('גדילה', c.L.pct, '#8B63F2')}</div>
        <div class="pt-note">משימה שמתאחרת: פוקי נשאר רעב, אבל לא נעלב 😊</div>
      </div>`;
    },
  },
  // ד · מפת המסע – today's alarm, outings and tasks are stations on a path, a treasure at the end
  map: {
    done: 'סיימתי! קדימה ➜', sec: 'התחנות של היום', sub: () => 'בזמן = ⭐⭐⭐',
    board(c) {
      const st = c.rows.filter(r => !r.off).map(r => {
        let done = false, good = false;
        if (r.type === 'task') { const s = taskState(r.log); done = s === 'approved' || s === 'pending'; good = done && !r.log.late; }
        else { done = !!r.log; good = done && (r.type === 'alarm' ? r.log.pts >= 10 : !r.log.late); }
        const title = r.type === 'alarm' ? 'השכמה' : r.it.title;
        return { title, done, good, t: r.type === 'event' ? r.it.start : r.type === 'alarm' ? r.it.time : r.it.time };
      });
      const cur = st.findIndex(s => !s.done);
      const rw = mine('reward').filter(r => (r.cost || 0) > c.sc.pts).sort((a, b) => a.cost - b.cost)[0]
        || mine('reward').sort((a, b) => b.cost - a.cost)[0];
      const nodes = st.map((s, i) => `<div class="mp-n ${s.done ? 'done' : i === cur ? 'cur' : 'lock'}" style="--x:${i % 2 ? 4 : 30}%">
          <span class="mp-dot">${s.done ? (s.good ? '⭐' : '✓') : i === cur ? initial(c.name) : '🔒'}</span>
          <span class="mp-l"><b>${esc(s.title)}</b><small>${i === cur ? 'תחנה נוכחית · ' : ''}${esc(s.t || '')}${s.done ? (s.good ? ' · ⭐⭐⭐' : ' · ⭐') : ''}</small></span></div>`).join('');
      return `<div class="gb gb-map">
        <div class="mp-head"><b>המסע של ${esc(c.name)}</b><span>עולם ${c.L.lvl} · ${DAYS_LONG[new Date().getDay()]}</span></div>
        <div class="mp-path">${nodes || '<div class="mp-empty">היום בלי תחנות – יום חופש במפה 🏝️</div>'}
          <div class="mp-n chest ${cur < 0 && st.length ? 'open' : ''}" style="--x:${st.length % 2 ? 4 : 30}%"><span class="mp-dot">🎁</span>
            <span class="mp-l"><b>תיבת אוצר${rw ? ': ' + esc(rw.title) : ''}</b><small>${rw ? (c.sc.pts >= rw.cost ? 'אפשר לפתוח! 🎉' : `עוד ${rw.cost - c.sc.pts}⭐`) : 'ההורים יוסיפו פרסים'}</small></span></div>
        </div></div>`;
    },
  },
  // ב · מחברת מדבקות – every good day earns a sticker on the week's page
  stickers: {
    done: 'סיימתי ✨', sec: 'מה עוד היום', sub: it => `${it.pts || 5} נקודות`,
    board(c) {
      const ws = weekStart(new Date()), today = occOf(new Date());
      const slots = [0, 1, 2, 3, 4, 5, 6].map(i => {
        const d = dayAdd(ws, i), o = occOf(d);
        const st = STICKERS[(hashOf(o + KID)) % STICKERS.length];
        if (o < today) return goodDay(d) ? `<div class="stk on" style="--r:${(i % 3 - 1) * 8}deg">${st}<small>${DAYS[i]}</small></div>` : `<div class="stk miss"><small>${DAYS[i]}</small></div>`;
        if (o === today) return c.tt.total && !c.tt.left ? `<div class="stk on now" style="--r:6deg">${st}<small>היום</small></div>` : `<div class="stk q">?<small>היום</small></div>`;
        return `<div class="stk fut"><small>${DAYS[i]}</small></div>`;
      }).join('');
      return `<div class="gb gb-stk">
        <div class="stk-h"><b>המדבקות של השבוע</b><span>🔥 ${c.sc.streak} ימים ברצף</span></div>
        <div class="stk-grid">${slots}</div>
        <div class="stk-note">${c.tt.left ? `עוד ${c.tt.left} משימות – ומדבקה חדשה נדבקת היום!` : c.tt.total ? 'קיבלת מדבקה היום! 🎉' : 'יום בלי משימות – מדבקה על השכמה ויציאה בזמן'}</div>
        ${c.nx ? `<div class="stk-next">עוד מעט: <b>${nextLine(c.nx, c.now)}</b></div>` : ''}
      </div>`;
    },
  },
  // ז · כרטיס גיבור/ה – level, XP, accuracy and achievements; tasks are quests with rarity
  hero: {
    done: 'הושלם ⚔️', sec: 'הקווסטים של היום', sub: it => `‎+${(it.pts || 5) * 3} XP`,
    tag: it => { const p = it.pts || 5; return p >= 15 ? ['אפי', '#B47CFF'] : p >= 8 ? ['נדיר', '#5AA9FF'] : ['רגיל', '#A79BCB']; },
    board(c) {
      const ws = occOf(weekStart(new Date()));
      let good = 0, all = 0;
      myLogs().filter(l => l.occ >= ws).forEach(l => { const g = goodBad(l); if (g) { all++; if (g > 0) good++; } });
      const quests = myLogs().filter(l => l.type === 'task_done' && l.status === 'approved').length;
      const woke = myLogs().filter(l => l.type === 'woke' && l.pts >= 10).length;
      const ach = [['⏰', 'קמ' + G('ה', '') + ' בזמן 5 פעמים', woke >= 5], ['🔥', '5 ימים ברצף', c.sc.streak >= 5], ['📈', 'רמה 3', c.L.lvl >= 3], ['🏆', '20 קווסטים', quests >= 20]];
      return `<div class="gb gb-hero">
        <div class="hr-top">
          <div class="hr-shield"><svg viewBox="0 0 78 88" width="70" height="80" aria-hidden="true"><path d="M39 2 L74 14 V44 C74 66 58 80 39 86 C20 80 4 66 4 44 V14z" fill="#5B3FB0" stroke="#FFCF5C" stroke-width="3"/><path d="M39 20 l6 12 13 2-9 9 2 13-12-6-12 6 2-13-9-9 13-2z" fill="#FFCF5C"/></svg>
            <span>רמה ${c.L.lvl}</span></div>
          <div class="hr-id"><b>${esc(c.name)}</b><span>${G('קוסמת הזמן', 'קוסם הזמן')}</span>
            <div class="hr-xp"><span>ניסיון</span><span>‎${c.L.into * 3} / ${LEVEL_PTS * 3} XP</span></div>
            <div class="hr-bar"><div style="width:${c.L.pct}%"></div></div></div></div>
        <div class="hr-stats"><div><b style="color:#7FE3C4">${all ? Math.round(good / all * 100) + '%' : '—'}</b><span>דיוק בזמנים</span></div>
          <div><b style="color:#FF9F6B">${c.sc.streak}</b><span>ימים ברצף</span></div><div><b style="color:#FFCF5C">${quests}</b><span>קווסטים</span></div></div>
        <div class="hr-ach">${ach.map(([e, n, on]) => `<div class="hx ${on ? 'on' : ''}" title="${n}"><span>${on ? e : '🔒'}</span><small>${n}</small></div>`).join('')}</div>
      </div>`;
    },
  },
  // חדש · מרוץ המכוניות – the car drives along today's track; days in a row are laps
  race: {
    done: 'סיימתי 🏁', sec: 'המסלול של היום', sub: it => `‎+${it.pts || 5} קמ״ש`,
    board(c) {
      const t = c.tt, p = t.total ? t.done / t.total : 1;
      const place = !t.total || !t.left ? 1 : p >= 0.5 ? 2 : 3;
      return `<div class="gb gb-race">
        <div class="rc-top"><b>מרוץ הזמן</b><span>הקפה ${c.sc.streak + 1} · ${['', '🥇 מקום ראשון', '🥈 מקום שני', '🥉 מקום שלישי'][place]}</span></div>
        <div class="rc-track"><div class="rc-finish"></div><div class="rc-lane"></div>
          <div class="rc-car" style="--p:${Math.round(p * 100)}">🏎️</div>
          ${t.rows.map((r, i) => `<i class="rc-cp ${['approved', 'pending'].indexOf(taskState(r.log)) >= 0 ? 'on' : ''}" style="--p:${Math.round((i + 1) / (t.total || 1) * 100)}"></i>`).join('')}</div>
        <div class="rc-info"><div><b>${t.done}/${t.total}</b><span>תחנות</span></div><div><b>${c.sc.streak}</b><span>הקפות ברצף</span></div><div><b>‎${c.sc.pts}</b><span>⭐ דלק</span></div></div>
        ${c.nx ? `<div class="rc-next">🚦 ${nextLine(c.nx, c.now)}</div>` : ''}
      </div>`;
    },
  },
  // ג · לילה ניאון – a big glowing countdown ring
  neon: { done: 'סיימתי', sec: 'היום', board: c => neonRing(c) },
  neonyb: { done: 'סיימתי', sec: 'היום', board: c => neonRing(c) },
  // א · הרפתקה
  quest: { done: 'סיימתי!', sec: 'המשימות של היום' },
  questyb: { done: 'סיימתי!', sec: 'המשימות של היום' },
};
function neonRing(c) {
  const t = c.tt, p = t.total ? t.done / t.total : 0;
  const R = 94, L = 2 * Math.PI * R;
  const m = c.nx ? Math.round((c.nx.t - c.now) / 60000) : null;
  return `<div class="gb gb-neon"><div class="nr">
      <svg viewBox="0 0 220 220" width="220" height="220" aria-hidden="true"><circle cx="110" cy="110" r="${R}" fill="none" stroke="var(--field)" stroke-width="16"/>
        <circle cx="110" cy="110" r="${R}" fill="none" stroke="var(--violet)" stroke-width="16" stroke-linecap="round" stroke-dasharray="${L.toFixed(1)}" stroke-dashoffset="${(L * (1 - p)).toFixed(1)}" transform="rotate(-90 110 110)" class="nr-arc"/></svg>
      <div class="nr-c"><b>${m == null ? '✓' : m <= 0 ? '!' : m < 100 ? m : Math.round(m / 60)}</b><span>${m == null ? 'אין עוד משהו היום' : m <= 0 ? 'עכשיו!' : m < 100 ? 'דקות עד ' + (c.nx.label === 'יוצאים בעוד' ? 'שיוצאים' : 'הבא') : 'שעות עד הבא'}</span></div></div>
    ${c.nx ? `<div class="nr-what">${esc(c.nx.what.replace(/^\S+ /, ''))}</div><div class="nr-sub">${esc(c.nx.sub)}</div>` : ''}
    <div class="nr-sub">${t.done} מתוך ${t.total} משימות הושלמו</div></div>`;
}
const game = () => GAMES[themeOf(document.body.dataset.theme)] || {};
