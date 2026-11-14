/* שלום כיתה א׳ – the buyer's licence on this device (IndexedDB). Used by the page, the game and the service worker. */
'use strict';
const KITA_DB = 'kita-a';
function kitaDb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(KITA_DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function kitaGet(k) {
  const db = await kitaDb();
  return new Promise(res => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => res(undefined); });
}
async function kitaSet(k, v) {
  const db = await kitaDb();
  return new Promise(res => { const t = db.transaction('kv', 'readwrite'); v === undefined ? t.objectStore('kv').delete(k) : t.objectStore('kv').put(v, k); t.oncomplete = () => res(); t.onerror = () => res(); });
}
/** This device's id: made once, kept in IndexedDB and localStorage. */
async function kitaDevice() {
  let d = await kitaGet('dev');
  if (!d) { try { d = localStorage.getItem('kita-dev'); } catch (e) {} }
  if (!d) { const a = new Uint8Array(12); crypto.getRandomValues(a); d = Array.from(a, b => b.toString(16).padStart(2, '0')).join(''); }
  await kitaSet('dev', d);
  try { localStorage.setItem('kita-dev', d); } catch (e) {}
  return d;
}
/** Asks the seller's sheet. a: "act" (first entry) or "chk" (still allowed?). */
async function kitaAsk(api, a, code, dev) {
  const ua = /iPad/.test(navigator.userAgent) ? 'iPad' : /iPhone/.test(navigator.userAgent) ? 'iPhone' : /Android/.test(navigator.userAgent) ? 'Android' : /Mac/.test(navigator.userAgent) ? 'Mac' : /Windows/.test(navigator.userAgent) ? 'Windows' : 'אחר';
  const u = api + (api.indexOf('?') < 0 ? '?' : '&') + 'a=' + a + '&c=' + encodeURIComponent(code) + '&d=' + dev + '&ua=' + encodeURIComponent(ua) + '&t=' + Date.now();
  const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 15000);
  try { const r = await fetch(u, { signal: ctl.signal, cache: 'no-store' }); return await r.json(); } finally { clearTimeout(to); }
}
