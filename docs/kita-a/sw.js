/* שלום כיתה א׳ – opens the encrypted course only on a device with a valid licence. */
'use strict';
importScripts('lic.js');
const CACHE = 'kita-enc-1';
const SHELL = 'kita-shell-1';
const SHELL_FILES = ['./', 'index.html', 'lic.js', 'config.js', 'guard.js', 'icon.png'];
const MIME = { html: 'text/html; charset=utf-8', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', mp3: 'audio/mpeg', js: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml' };

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== SHELL).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || e.request.method !== 'GET') return;
  const scope = new URL(self.registration.scope).pathname;
  if (!u.pathname.startsWith(scope)) return;
  const rel = u.pathname.slice(scope.length);
  if (rel.startsWith('app/')) { e.respondWith(serve(decodeURIComponent(rel.slice(4)) || 'index.html', e.request)); return; }
  if (rel.startsWith('enc/')) return;
  // the entry page: newest from the network, the saved copy when offline
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const c = r.clone(); caches.open(SHELL).then(s => s.put(e.request, c)); } return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});

let keyCache = null;
async function serve(rel, req) {
  const lic = await kitaGet('lic');
  if (!lic || !lic.key || Date.now() > lic.exp) {
    if (req.mode === 'navigate') return Response.redirect(new URL('./?why=' + (lic ? 'expired' : 'none'), self.registration.scope).href, 302);
    return new Response('', { status: 403 });
  }
  if (!keyCache || keyCache.raw !== lic.key) {
    const raw = Uint8Array.from(atob(lic.key), c => c.charCodeAt(0));
    keyCache = { raw: lic.key, k: await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']) };
  }
  const encUrl = new URL('enc/' + rel + '.bin', self.registration.scope).href;
  let res = await caches.match(encUrl);
  if (!res) {
    try { res = await fetch(encUrl); } catch (e) { return new Response('', { status: 504 }); }
    if (!res.ok) return new Response('', { status: 404 });
    const copy = res.clone();
    caches.open(CACHE).then(c => c.put(encUrl, copy));
  }
  let plain;
  try {
    const buf = await res.arrayBuffer();
    plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.slice(0, 12) }, keyCache.k, buf.slice(12));
  } catch (e) { return new Response('', { status: 403 }); }
  const type = MIME[(rel.split('.').pop() || '').toLowerCase()] || 'application/octet-stream';
  const size = plain.byteLength;
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range') || '');
  if (range) { // audio on iPhone asks for parts of the file
    let a = range[1] === '' ? size - (+range[2]) : +range[1];
    let b = range[1] === '' || range[2] === '' ? size - 1 : Math.min(+range[2], size - 1);
    a = Math.max(0, a);
    return new Response(plain.slice(a, b + 1), { status: 206, headers: { 'Content-Type': type, 'Content-Range': `bytes ${a}-${b}/${size}`, 'Content-Length': String(b - a + 1), 'Accept-Ranges': 'bytes' } });
  }
  return new Response(plain, { headers: { 'Content-Type': type, 'Content-Length': String(size), 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' } });
}
