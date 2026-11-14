/**
 * שלום כיתה א׳ – ניהול קוני הקורס בגיליון Google.
 * כל קונה = שורה. כל קוד פועל במכשיר אחד בלבד, למשך 30 יום מהכניסה הראשונה.
 * הקובץ הזה מודבק ב"תוספים ← Apps Script" של הגיליון, ומופעל כ"אפליקציית אינטרנט".
 */

// ===== הגדרות =====
const KEY = '__KEY__';            // מפתח הפתיחה של הקורס – סודי! לא לשתף ולא לשנות
const DAYS = 30;                  // כמה ימים הגישה בתוקף מהכניסה הראשונה
const LINK = 'https://heavyfocus-art.github.io/bezman/kita-a/';
const SHEET = 'קונים';
const HEAD = ['שם', 'טלפון', 'קוד', 'סטטוס', 'ימים', 'הופעל בתאריך', 'בתוקף עד', 'מכשיר', 'סוג מכשיר', 'כניסה אחרונה', 'הערות'];
const C = { name: 1, phone: 2, code: 3, status: 4, days: 5, start: 6, until: 7, dev: 8, ua: 9, seen: 10, note: 11 };
const ACTIVE = 'פעיל', BLOCKED = 'חסום';

// ===== תפריט בגיליון =====
function onOpen() {
  SpreadsheetApp.getUi().createMenu('🎓 שלום כיתה א׳')
    .addItem('➕ קונה חדש', 'newBuyer')
    .addItem('💬 הודעה לשליחה לקונה (בשורה המסומנת)', 'messageForRow')
    .addSeparator()
    .addItem('🔄 חידוש לחודש נוסף – קוד חדש', 'renew')
    .addItem('📱 איפוס מכשיר (הקונה החליף טלפון)', 'resetDevice')
    .addItem('⛔ חסימה / ביטול חסימה', 'toggleBlock')
    .addSeparator()
    .addItem('⚙️ הכנת הגיליון (פעם אחת)', 'setup')
    .addToUi();
}

function sheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(SHEET);
  if (!sh) sh = ss.insertSheet(SHEET);
  return sh;
}

function setup() {
  const sh = sheet_();
  sh.setRightToLeft(true);
  sh.getRange(1, 1, 1, HEAD.length).setValues([HEAD]).setFontWeight('bold').setBackground('#ffe0b2');
  sh.setFrozenRows(1);
  sh.getRange('C:C').setFontFamily('Courier New').setFontWeight('bold');
  sh.getRange('F:G').setNumberFormat('dd/MM/yyyy');
  sh.getRange('J:J').setNumberFormat('dd/MM/yyyy HH:mm');
  [140, 120, 120, 70, 60, 110, 110, 120, 90, 130, 200].forEach((w, i) => sh.setColumnWidth(i + 1, w));
  // a toast does not wait for a click (an alert would stop the script when it is run from the editor)
  SpreadsheetApp.getActive().toast('עכשיו: תפריט "🎓 שלום כיתה א׳" ← "➕ קונה חדש".', 'הגיליון מוכן ✅', 15);
}

// ===== קודים =====
function newCode_(sh) {
  const abc = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const used = new Set(sh.getLastRow() > 1 ? sh.getRange(2, C.code, sh.getLastRow() - 1, 1).getValues().map(r => String(r[0])) : []);
  for (;;) {
    const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Math.random());
    let s = '';
    for (let i = 0; i < 8; i++) s += abc.charAt(((bytes[i] % 256) + 256) % abc.length);
    const code = s.slice(0, 4) + '-' + s.slice(4);
    if (!used.has(code)) return code;
  }
}
const norm_ = v => { const s = String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); return s.length === 8 ? s.slice(0, 4) + '-' + s.slice(4) : s; };

function newBuyer() {
  const ui = SpreadsheetApp.getUi();
  const a = ui.prompt('קונה חדש', 'שם הקונה (למשל: משפחת כהן):', ui.ButtonSet.OK_CANCEL);
  if (a.getSelectedButton() !== ui.Button.OK || !a.getResponseText().trim()) return;
  const b = ui.prompt('קונה חדש', 'טלפון לוואטסאפ (למשל 0501234567). אפשר להשאיר ריק:', ui.ButtonSet.OK_CANCEL);
  if (b.getSelectedButton() !== ui.Button.OK) return;
  const sh = sheet_();
  if (sh.getLastRow() < 1) setup();
  const code = newCode_(sh);
  sh.appendRow([a.getResponseText().trim(), "'" + b.getResponseText().trim(), code, ACTIVE, DAYS, '', '', '', '', '', '']);
  showMessage_(sh.getLastRow());
}

function row_() {
  const act = SpreadsheetApp.getActive().getActiveSheet();
  const r = act.getActiveRange() ? act.getActiveRange().getRow() : 0;
  if (act.getName() !== SHEET || r < 2 || r > act.getLastRow()) {
    SpreadsheetApp.getUi().alert('קודם לוחצים על שורה של קונה בגיליון "' + SHEET + '".');
    return 0;
  }
  return r;
}

function messageForRow() { const r = row_(); if (r) showMessage_(r); }

function renew() {
  const r = row_(); if (!r) return;
  const sh = sheet_();
  sh.getRange(r, C.code).setValue(newCode_(sh));
  sh.getRange(r, C.status).setValue(ACTIVE);
  sh.getRange(r, C.start, 1, 4).clearContent();   // מתחיל חודש חדש מהכניסה הבאה
  appendNote_(r, 'חודש ' + fmt_(new Date()));
  showMessage_(r);
}

function resetDevice() {
  const r = row_(); if (!r) return;
  const sh = sheet_();
  sh.getRange(r, C.dev, 1, 2).clearContent();
  appendNote_(r, 'מכשיר אופס ' + fmt_(new Date()));
  SpreadsheetApp.getUi().alert('המכשיר אופס ✅\nבכניסה הבאה עם אותו קוד, הקוד יינעל על המכשיר החדש. תאריך הסיום לא משתנה.');
}

function toggleBlock() {
  const r = row_(); if (!r) return;
  const cell = sheet_().getRange(r, C.status);
  const now = cell.getValue() === BLOCKED ? ACTIVE : BLOCKED;
  cell.setValue(now);
  SpreadsheetApp.getUi().alert(now === BLOCKED ? 'הקוד נחסם ⛔ – בכניסה הבאה לא תהיה גישה.' : 'הקוד פעיל שוב ✅');
}

function appendNote_(r, t) {
  const cell = sheet_().getRange(r, C.note);
  cell.setValue((cell.getValue() ? cell.getValue() + ' · ' : '') + t);
}
const fmt_ = d => Utilities.formatDate(d, Session.getScriptTimeZone(), 'dd/MM/yyyy');

function showMessage_(r) {
  const v = sheet_().getRange(r, 1, 1, HEAD.length).getValues()[0];
  const name = v[C.name - 1], phone = String(v[C.phone - 1] || '').replace(/\D/g, ''), code = v[C.code - 1], days = v[C.days - 1] || DAYS;
  const text = 'שלום ' + name + ' 🎒\n' +
    'תודה שרכשתם את הקורס "שלום כיתה א׳"!\n\n' +
    'כניסה לקורס:\n' + LINK + '\n\n' +
    'הקוד האישי שלכם: ' + code + '\n\n' +
    '⚠️ הקוד אישי ופועל במכשיר אחד בלבד, למשך ' + days + ' יום מהכניסה הראשונה. ' +
    'מומלץ להיכנס מהטלפון או מהטאבלט שהילד ישחק בו.\n\nבהצלחה בכיתה א׳! 🌟';
  const intl = phone ? (phone.charAt(0) === '0' ? '972' + phone.slice(1) : phone) : '';
  const wa = 'https://wa.me/' + intl + '?text=' + encodeURIComponent(text);
  const html = '<div dir="rtl" style="font-family:Arial,sans-serif">' +
    '<textarea id="t" style="width:100%;height:230px;font-size:14px" dir="rtl">' + text.replace(/</g, '&lt;') + '</textarea>' +
    '<p><button onclick="document.getElementById(\'t\').select();document.execCommand(\'copy\');this.textContent=\'הועתק ✅\'" style="font-size:16px;padding:8px 16px">📋 העתקה</button> ' +
    '<a href="' + wa + '" target="_blank" style="font-size:16px;padding:8px 16px;background:#1fa855;color:#fff;border-radius:8px;text-decoration:none">💬 שליחה בוואטסאפ</a></p></div>';
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(480).setHeight(360), 'הודעה ל' + name);
}

// ===== מה שהקורס שואל (כתובת האפליקציה /exec) =====
/**
 * The decision for one code (also used by the tests). row: values of the buyer's row, or null.
 * Returns {ok, why, exp, first} – first = this is the first entry (write the device and dates).
 */
function decide_(row, dev, now) {
  if (!row) return { ok: false, why: 'nocode' };
  if (row[C.status - 1] === BLOCKED) return { ok: false, why: 'blocked' };
  const owner = String(row[C.dev - 1] || '');
  const until = row[C.until - 1] ? new Date(row[C.until - 1]).getTime() : 0;
  if (!owner) {
    if (until && now > until) return { ok: false, why: 'expired' };
    const days = Number(row[C.days - 1]) || DAYS;
    return { ok: true, first: true, exp: until || now + days * 86400000 };
  }
  if (owner !== dev) return { ok: false, why: 'device' };
  if (until && now > until) return { ok: false, why: 'expired' };
  return { ok: true, exp: until };
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  const out = o => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
  const code = norm_(p.c), dev = String(p.d || '').replace(/[^a-f0-9]/g, '').slice(0, 40);
  if (!code || !dev) return out({ ok: false, why: 'nocode' });
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = sheet_();
    const n = sh.getLastRow() - 1;
    if (n < 1) return out({ ok: false, why: 'nocode' });
    const vals = sh.getRange(2, 1, n, HEAD.length).getValues();
    const i = vals.findIndex(r => norm_(r[C.code - 1]) === code);
    const row = i < 0 ? null : vals[i];
    const now = Date.now();
    const d = decide_(row, dev, now);
    if (row) {
      const r = i + 2;
      if (d.first) {
        sh.getRange(r, C.start, 1, 4).setValues([[new Date(now), new Date(d.exp), dev, String(p.ua || '').slice(0, 20)]]);
      }
      sh.getRange(r, C.seen).setValue(new Date(now));
      if (!d.ok && d.why === 'device') appendNote_(r, 'ניסיון ממכשיר אחר ' + fmt_(new Date(now)));
    }
    if (!d.ok) return out({ ok: false, why: d.why });
    return out({ ok: true, exp: d.exp, key: KEY, name: row[C.name - 1] });
  } finally {
    lock.releaseLock();
  }
}
