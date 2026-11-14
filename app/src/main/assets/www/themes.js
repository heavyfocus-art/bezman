'use strict';
/* בזמן – the kids' designs (from the "בזמן – עיצוב לילדים" canvas) + the original colors.
   Each design is a set of CSS variables in style.css (body[data-theme="…"]); here: name, preview, and game words.
   Same ids as Store.THEMES on the phone. */

const THEMES = {
  // the original three
  purple:   { name: 'סגול', desc: 'הסגול הקלאסי', sw: 'linear-gradient(135deg,#2b2160,#6c4bf5)', bar: '#2b2160', kc: '#8b6cf6',
              fx: ['#ffd166', '#ff7a59', '#9c84ff', '#3ddc97', '#ff6fb5', '#ffffff'] },
  orange:   { name: 'כתום', desc: 'כתום חמים', sw: 'linear-gradient(135deg,#d9580b,#ff9a3d)', bar: '#7a2e00', kc: '#f07a1a',
              fx: ['#ffd166', '#ff7a59', '#ffb36b', '#ffffff', '#e2435b'] },
  yb:       { name: 'צהוב-שחור', desc: 'צהוב-שחור קלאסי', sw: 'repeating-linear-gradient(135deg,#111 0 14px,#222 14px 28px)', ink: '#ffd200', bar: '#000000', kc: '#e6b800', yb: true,
              fx: ['#ffd200', '#ffffff', '#ffe866', '#fff4b8', '#ffb800'] },
  // designs from the canvas
  quest:    { name: 'הרפתקה', desc: 'שלבים ופס התקדמות', sw: 'linear-gradient(180deg,#2E8BFF 55%,#FFC83D 55%)', bar: '#2E8BFF', kc: '#2E8BFF', lvl: 'שלב', rank: ['אלופת הזמן', 'אלוף הזמן'],
              fx: ['#FFC83D', '#2E8BFF', '#3CCB7F', '#ffffff', '#FF8A3D'] },
  questyb:  { name: 'הרפתקה צהוב-שחור', desc: 'שלבים בצהוב-שחור', sw: 'linear-gradient(180deg,#111 55%,#FFD200 55%)', ink: '#FFD200', bar: '#111111', kc: '#e6b800', yb: true, lvl: 'שלב', rank: ['אלופת הזמן', 'אלוף הזמן'],
              fx: ['#ffd200', '#ffffff', '#ffe866', '#3CCB7F'] },
  stickers: { name: 'מחברת מדבקות', desc: 'מדבקה על כל יום טוב', sw: 'radial-gradient(circle at 30% 35%,#FF8FB1 0 22%,transparent 23%),radial-gradient(circle at 70% 65%,#7ED9C3 0 20%,transparent 21%),#FFF8EE', ink: '#3A2E4D', bar: '#E06A90', kc: '#E06A90', lvl: 'דף', rank: ['אספנית מדבקות', 'אספן מדבקות'],
              fx: ['#FF8FB1', '#FFD66B', '#B9A7FF', '#7ED9C3', '#ffffff'] },
  neon:     { name: 'לילה ניאון', desc: 'טבעת זוהרת עם ספירה לאחור', sw: 'radial-gradient(circle,#FF4FD8 0 30%,#0E0B1F 32%)', bar: '#0E0B1F', kc: '#FF4FD8', dark: true, lvl: 'שלב', rank: ['כוכבת הלילה', 'כוכב הלילה'],
              fx: ['#FF4FD8', '#8B6CFF', '#3BE8FF', '#2BD98E', '#FFD84D'] },
  neonyb:   { name: 'ניאון צהוב-שחור', desc: 'טבעת זוהרת בצהוב-שחור', sw: 'radial-gradient(circle,#FFD200 0 30%,#0B0B0B 32%)', bar: '#0B0B0B', kc: '#e6b800', dark: true, yb: true, lvl: 'שלב', rank: ['כוכבת הלילה', 'כוכב הלילה'],
              fx: ['#FFD200', '#ffffff', '#ffe866', '#2BD98E'] },
  map:      { name: 'מפת המסע', desc: 'תחנות במסלול ותיבת אוצר', sw: 'linear-gradient(135deg,#8FD694,#3E8F49)', bar: '#1F6F3A', kc: '#3E8F49',
              fx: ['#FFC83D', '#FF5A7A', '#4FA65A', '#ffffff'] },
  pet:      { name: 'חבר שגדל', desc: 'חיה שגדלה כשמסיימים משימות', sw: 'radial-gradient(circle at 50% 60%,#8B63F2 0 34%,#DFF6EE 36%)', bar: '#7A4FE0', kc: '#8B63F2',
              fx: ['#8B63F2', '#FF8FB1', '#FFC83D', '#ffffff'] },
  space:    { name: 'משימה לחלל', desc: 'ממלאים דלק ומשגרים טיל', sw: 'radial-gradient(circle at 70% 30%,#7FE3FF 0 12%,transparent 13%),radial-gradient(circle at 30% 70%,#FFD84D 0 8%,transparent 9%),#0B1236', bar: '#0B1236', kc: '#2E7FD0', dark: true,
              fx: ['#7FE3FF', '#FFD84D', '#FF6B4A', '#ffffff'] },
  hero:     { name: 'כרטיס גיבור/ה', desc: 'רמות, XP והישגים', sw: 'linear-gradient(135deg,#21163F 60%,#FFCF5C 60%)', bar: '#21163F', kc: '#C99A2E', dark: true,
              fx: ['#FFCF5C', '#B47CFF', '#7FE3C4', '#5AA9FF', '#FF9F6B'] },
  league:   { name: 'ליגת הזמן', desc: 'משחק כדורגל נגד השעון', sw: 'linear-gradient(180deg,#111 50%,#33A955 50%)', ink: '#FFD200', bar: '#111111', kc: '#e6b800', yb: true,
              fx: ['#FFD200', '#33A955', '#ffffff'] },
  race:     { name: 'מרוץ המכוניות', desc: 'מכונית שנוסעת במסלול', sw: 'repeating-conic-gradient(#111 0 25%,#fff 0 50%) 0 0/14px 14px', bar: '#1E2430', kc: '#E8392F',
              fx: ['#E8392F', '#FFD200', '#ffffff', '#2BB3FF'] },
};
// game designs first
const THEME_ORDER = ['league', 'space', 'pet', 'map', 'race', 'hero', 'stickers', 'neon', 'neonyb', 'quest', 'questyb', 'purple', 'orange', 'yb'];
const themeOf = id => THEMES[id] ? id : 'purple';
const TH = () => THEMES[themeOf(document.body.dataset.theme)];

/** Theme chooser: a grid of little previews. attr(id) = the data-… attribute for the button. */
function themeButtons(cur, attr) {
  cur = themeOf(cur);
  return THEME_ORDER.map(t => {
    const x = THEMES[t];
    return `<button type="button" class="tpick ${cur === t ? 'on' : ''}" ${attr(t)} aria-pressed="${cur === t}">
      <span class="tsw" style="background:${x.sw}">${GAMES[t] && GAMES[t].board ? '<em>🎮</em>' : ''}</span><span class="tnm">${x.name}</span>${x.desc ? `<span class="tds">${x.desc}</span>` : ''}</button>`;
  }).join('');
}

/** Levels: every 100 points earned (ever) is one more level. Shown on the child's home in the game designs. */
const LEVEL_PTS = 100;
function levelInfo(kid) {
  const earned = list('log').filter(l => kidOf(l) === kid && (l.pts || 0) > 0).reduce((s, l) => s + l.pts, 0);
  const lvl = Math.floor(earned / LEVEL_PTS) + 1;
  const into = earned % LEVEL_PTS;
  return { lvl, into, left: LEVEL_PTS - into, pct: Math.round(into / LEVEL_PTS * 100) };
}
function levelCard() {
  const t = TH();
  if (!t.lvl) return '';
  const L = levelInfo(KID);
  const sc = score();
  return `<div class="lvl">
    <div class="lvl-top"><b>${t.lvl} ${L.lvl}${t.rank ? ' · ' + G(t.rank[0], t.rank[1]) : ''}</b><span>🔥 ${sc.streak} ימים ברצף</span></div>
    <div class="lvl-bar"><div style="width:${L.pct}%"></div></div>
    <div class="lvl-sub">עוד ${L.left} נקודות ל${t.lvl} ${L.lvl + 1}</div></div>`;
}

/** The child picks a design: a big sheet with all the designs (game ones first). */
function openThemes(cur, onPick) {
  openModal(`<h3>🎨 בוחרים עיצוב</h3>
    <p class="muted small" style="margin-top:-6px">🎮 = עיצוב משחק: המסך הראשי הופך למשחק – כדורגל, טיל, חיה שגדלה, מפה ועוד</p>
    <div class="theme-pick big">${themeButtons(cur, t => `data-pickth="${t}"`)}</div>
    <div class="actions"><button class="btn light" data-c="no">סגירה</button></div>`, root => {
    root.querySelector('[data-c=no]').onclick = closeModal;
    root.querySelectorAll('[data-pickth]').forEach(b => b.onclick = () => { MODAL = null; $('#modal-root').innerHTML = ''; onPick(b.dataset.pickth); });
  });
}
