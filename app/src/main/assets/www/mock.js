// Stand-in for the phone bridge when the screens are opened in a normal browser (for testing only).
(function () {
  if (window.Android) return;
  const K = 'bezman-mock';
  const load = () => { try { return JSON.parse(localStorage.getItem(K)) || {}; } catch (e) { return {}; } };
  let D = Object.assign({ items: {}, me: { role: '', name: '', dev: 'browser01', code: '' } }, load());
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
  const score = () => {
    if (D.me.role !== 'child') return;
    let pts = 0;
    Object.values(D.items).forEach(o => {
      if (!o || o.del) return;
      if (o.kind === 'log') pts += o.pts || 0;
      if (o.kind === 'redeem' && o.status !== 'declined') pts -= o.cost || 0;
    });
    const old = D.items.score;
    if (!old || old.pts !== pts) put({ id: 'score', kind: 'score', pts, streak: old ? old.streak || 0 : 0 });
  };
  const state = () => JSON.stringify({ items: D.items, me: Object.assign({ lastSync: Date.now() - 4 * 60000 }, D.me), version: '1.0-test', apk: 'https://example.com/bezman.apk', now: Date.now() });
  window.Android = {
    __mock: true,
    state,
    upsert(json) { let a = JSON.parse(json); if (!Array.isArray(a)) a = [a]; a.forEach(put); score(); persist(); return state(); },
    setup(role, name, code) {
      D.me.role = role; D.me.name = name; D.me.code = code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      put({ id: 'm_' + D.me.dev, kind: 'member', role, name, by: name }); score(); persist(); return state();
    },
    newCode() { const a = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 10; i++) s += a[Math.floor(Math.random() * a.length)]; return s; },
    syncNow() {},
    action(what, ref, occ) {
      const it = D.items[ref]; if (!it) return -1;
      if (what === 'left') {
        const id = `left:${ref}:${occ}`; if (D.items[id]) return -1;
        const leave = at(occ, mins(it.start) - (it.travel || 0)); const now = Date.now();
        const pts = now <= leave + 120000 ? 10 : now <= leave + 600000 ? 5 : 2;
        put({ id, kind: 'log', type: 'left', ref, occ, pts, title: it.title, at: now, late: Math.max(0, Math.round((now - leave) / 60000)) });
        score(); persist(); return pts;
      }
      if (what === 'task') {
        const id = `task:${ref}:${occ}`; if (D.items[id]) return -1;
        const due = at(occ, mins(it.time) >= 0 ? mins(it.time) : 1439); const base = it.pts || 5;
        const pts = Date.now() <= due ? base : Math.max(1, Math.floor(base / 2));
        put({ id, kind: 'log', type: 'task_done', ref, occ, pts, title: it.title, at: Date.now(), late: Date.now() > due });
        score(); persist(); return pts;
      }
      return -1;
    },
    share(t) { console.log('SHARE', t); alert(t); },
    perms() { return JSON.stringify({ notif: true, exact: true, full: false, battery: false, samsung: true }); },
    fixPerm(w) { console.log('fix', w); },
    testAlarm() { console.log('test alarm'); },
    toast(s) { console.log('toast', s); },
    openUrl(u) { console.log('open', u); },
    reset() { D = { items: {}, me: { role: '', name: '', dev: 'browser01', code: '' } }; persist(); return state(); },
  };
  window.__mockData = () => D;
})();
