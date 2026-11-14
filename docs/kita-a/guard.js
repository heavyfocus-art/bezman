/* שלום כיתה א׳ – inside the course: leave when the licence ends, and ask the sheet again now and then. */
(async function () {
  const out = why => location.replace('../?why=' + why);
  const lic = await kitaGet('lic');
  if (!lic || Date.now() > lic.exp) return out(lic ? 'expired' : 'none');
  setTimeout(() => out('expired'), Math.min(lic.exp - Date.now(), 2147483000));
  const api = (window.KITA || {}).api;
  if (!api || !navigator.onLine || Date.now() - (lic.chk || 0) < 6 * 3600000) return;
  try {
    const j = await kitaAsk(api, 'chk', lic.code, await kitaDevice());
    if (j && j.ok) { lic.chk = Date.now(); if (j.exp) lic.exp = j.exp; await kitaSet('lic', lic); }
    else if (j && j.why) { await kitaSet('lic', undefined); out(j.why); }
  } catch (e) { /* no internet: keep playing until the end date */ }
})();
