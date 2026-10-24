// Stand-in for the phone bridge when the screens are opened in a normal browser (for testing only).
(function () {
  if (window.Android) return;
  const K = 'bezman-mock';
  const load = () => { try { return JSON.parse(localStorage.getItem(K)) || {}; } catch (e) { return {}; } };
  let D = Object.assign({ items: {}, me: { role: '', name: '', dev: 'browser01', code: '', live: true } }, load());
  const persist = () => { try { localStorage.setItem(K, JSON.stringify(D)); } catch (e) {} };
  const pad = n => String(n).padStart(2, '0');
  const occOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const mins = s => { const m = /^(\d{1,2}):(\d{2})$/.exec(s || ''); return m ? (+m[1]) * 60 + (+m[2]) : -1; };
  const at = (occ, m) => { const [y, mo, d] = occ.split('-').map(Number); return new Date(y, mo - 1, d, 0, m).getTime(); };
  const put = (it) => {
    const old = D.items[it.id];
    it.upd = Math.max(Date.now(), old ? old.upd + 1 : 0);
    it.dev = D.me.dev;
    if (!it.by) it.by = old ? old.by : D.me.name;
    D.items[it.id] = it;
  };
  const kidId = name => { const n = String(name || '').trim().replace(/\s+/g, ' ').toLowerCase(); let h = 0x811c9dc5; for (let i = 0; i < n.length; i++) { h ^= n.charCodeAt(i); h = Math.imul(h, 0x01000193); } return 'k_' + (h >>> 0).toString(16).padStart(8, '0'); };
  const myKid = () => kidId(D.me.name);
  const score = () => {
    if (D.me.role !== 'child') return;
    let pts = 0;
    const me = myKid();
    Object.values(D.items).forEach(o => {
      if (!o || o.del) return;
      if ((o.kid || me) !== me) return;
      if (o.kind === 'log') pts += o.pts || 0;
      if (o.kind === 'redeem' && o.status !== 'declined') pts -= o.cost || 0;
    });
    const old = D.items['score:' + me];
    if (!old || old.pts !== pts) put({ id: 'score:' + me, kind: 'score', kid: me, pts, streak: old ? old.streak || 0 : 0 });
  };
  let CEL = 0;
  const state = () => {
    const m = D.items['m_' + D.me.dev] || {};
    const me = Object.assign({ lastSync: Date.now() - 4 * 60000, unlocked: true }, D.me, { pinSet: !!(D.items.pin && D.items.pin.hash) }, D.me.role === 'child' ? { kid: myKid(), theme: m.theme || 'purple', gender: m.gender || 'f' } : {});
    const c = CEL; CEL = 0;
    return JSON.stringify({ items: D.items, me, version: '1.0-test', apk: 'https://example.com/bezman.apk', now: Date.now(), celebrate: !!c });
  };
  window.Android = {
    __mock: true,
    state,
    upsert(json) { let a = JSON.parse(json); if (!Array.isArray(a)) a = [a]; a.forEach(put); score(); persist(); return state(); },
    setup2(role, name, code, gender, theme) {
      D.me.role = role; D.me.name = name; D.me.code = code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      const m = { id: 'm_' + D.me.dev, kind: 'member', role, name, by: name };
      if (role === 'child') Object.assign(m, { kid: kidId(name), gender, theme, since: Date.now() });
      put(m); score(); persist(); return state();
    },
    setProfile(gender, theme) { const m = D.items['m_' + D.me.dev]; if (gender) m.gender = gender; if (theme) m.theme = theme; put(m); persist(); return state(); },
    _cel() { CEL = 1; },
    setup(role, name, code) {
      D.me.role = role; D.me.name = name; D.me.code = code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      put({ id: 'm_' + D.me.dev, kind: 'member', role, name, by: name }); score(); persist(); return state();
    },
    newCode() { const a = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 10; i++) s += a[Math.floor(Math.random() * a.length)]; return s; },
    syncNow() {},
    action(what, ref, occ) {
      if (what === 'approve' || what === 'reject') {
        const l = D.items[ref]; if (!l || l.status !== 'pending') return -1;
        const n = Object.assign({}, l, { status: what === 'approve' ? 'approved' : 'rejected', pts: what === 'approve' ? l.claim : 0, approvedBy: D.me.name });
        put(n); score(); persist(); return 1;
      }
      const it = D.items[ref]; if (!it) return -1;
      if (what === 'left') {
        const id = `left:${ref}:${occ}`; if (D.items[id]) return -1;
        const leave = at(occ, mins(it.start) - (it.travel || 0)); const now = Date.now();
        const pts = now <= leave + 120000 ? 10 : now <= leave + 600000 ? 5 : 2;
        if (pts === 10) CEL = 1;
        put({ id, kind: 'log', kid: myKid(), type: 'left', ref, occ, pts, title: it.title, at: now, late: Math.max(0, Math.round((now - leave) / 60000)) });
        score(); persist(); return pts;
      }
      if (what === 'task' || what === 'photo') {
        const id = `task:${ref}:${occ}`; const ex = D.items[id];
        if (ex && !ex.del && ex.status !== 'rejected') return -1;
        const due = at(occ, mins(it.time) >= 0 ? mins(it.time) : 1439); const base = it.pts || 5;
        const claim = Date.now() <= due ? base : Math.max(1, Math.floor(base / 2));
        if (Date.now() <= due) CEL = 1;
        put({ id, kind: 'log', kid: myKid(), type: 'task_done', status: 'pending', claim, ref, occ, pts: 0, title: it.title, at: Date.now(), late: Date.now() > due, photo: what === 'photo', by: D.me.name });
        score(); persist(); return claim;
      }
      if (what === 'missed') {
        const id = `task:${ref}:${occ}`; const ex = D.items[id];
        if (ex && !ex.del && ex.status !== 'rejected') return -1;
        const pen = Math.max(1, Math.floor((it.pts || 5) / 2));
        put({ id, kind: 'log', kid: myKid(), type: 'task_missed', status: 'missed', ref, occ, pts: -pen, title: it.title, at: Date.now(), by: D.me.name });
        score(); persist(); return pen;
      }
      return -1;
    },
    share(t) { console.log('SHARE', t); alert(t); },
    perms() { return JSON.stringify({ notif: true, exact: true, full: false, battery: false, samsung: true }); },
    fixPerm(w) { console.log('fix', w); },
    pickRingtone() { D.me.ringtone = 'Morning Flower'; persist(); window.onNative(); },
    pickSong() { D.me.ringtone = 'השיר שלי'; persist(); window.onNative(); },
    previewRingtone() {},
    takePhoto(id, occ) { this.action('photo', id, occ); persist(); setTimeout(() => window.onPhotoSent(), 50); },
    photo(id) { return D.items[id] && D.items[id].photo ? 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#ffd166"/><text x="100" y="120" font-size="80" text-anchor="middle">📚</text></svg>') : ''; },
    setLive(on) { D.me.live = on; persist(); },
    getPrefs() { return localStorage.getItem('bz-ui') || ''; },
    setPrefs(j) { localStorage.setItem('bz-ui', j); },
    setTextZoom(z) { document.body.style.zoom = z / 100; },
    voice() { setTimeout(() => window.onVoice(window.__nextVoice || 'לסדר את החדר מחר עד 8 בערב'), 100); },
    setPin(n, o) { const p = D.items.pin; if (p && p.hash !== 'h' + o) return false; put({ id: 'pin', kind: 'config', salt: 's', hash: 'h' + n }); persist(); return true; },
    checkPin(n) { const p = D.items.pin; return !!p && p.hash === 'h' + n; },
    unlockPin(n) { if (!this.checkPin(n)) return false; D.me.unlocked = true; persist(); return true; },
    lockParent() { D.me.unlocked = false; persist(); },
    testAlarm() { console.log('test alarm'); },
    toast(s) { console.log('toast', s); },
    openUrl(u) { console.log('open', u); },
    reset() { D = { items: {}, me: { role: '', name: '', dev: 'browser01', code: '' } }; persist(); return state(); },
  };
  window.__mockData = () => D;
})();
