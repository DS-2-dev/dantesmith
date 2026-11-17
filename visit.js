// Counts this page view on the guestbook worker (worker/src/index.js), which
// notes roughly where it came from. Only on the live site, so local previews
// don't count.
//
// Opening any page with ?me marks this browser as Dante's, and it stops
// counting itself from then on; ?notme undoes that. The flag lives in this
// browser only, so each device and browser needs it once.
//
// ?from=<tag> marks where a shared link was posted (?from=resume,
// ?from=linkedin-dm), since referrers mostly arrive empty or as a bare host.
//
// Beyond the view itself it sends how long the page was actually on screen,
// each time it's hidden, and what was done: links followed, plus whatever
// the page reports as a "site:did" event (space.js: work opened, About,
// email copied, searches).
(() => {
  const ENDPOINT = 'https://guestbook.now-playing.workers.dev/visit';
  const params = new URLSearchParams(location.search);
  const tag = params.get('from') || '';
  let mine = false;
  try {
    if (params.has('me')) localStorage.setItem('notCounted', '1');
    if (params.has('notme')) localStorage.removeItem('notCounted');
    mine = localStorage.getItem('notCounted') === '1';
  } catch {}

  if (params.has('me') || params.has('notme') || params.has('from')) {
    ['me', 'notme', 'from'].forEach((k) => params.delete(k));
    const query = params.toString();
    history.replaceState(null, '', location.pathname + (query ? '?' + query : '') + location.hash);
  }

  if (mine || location.hostname !== 'dantesmith.studio') return;

  // This one page view, so its time and clicks land on the right row.
  const view = crypto.randomUUID ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  const send = (path, body) => fetch(ENDPOINT + path, {
    method: 'POST', body: JSON.stringify({ view, ...body }), keepalive: true,
  }).catch(() => {});

  send('', { path: location.pathname, referrer: document.referrer, from: tag });

  // Time on screen: counts only while the tab is visible.
  let shown = 0, since = document.visibilityState === 'visible' ? Date.now() : 0;
  const seconds = () => Math.round((shown + (since ? Date.now() - since : 0)) / 1000);
  let sent = -1;
  const report = () => {
    const s = seconds();
    if (s !== sent) { sent = s; send('/time', { seconds: s }); }
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      if (since) { shown += Date.now() - since; since = 0; }
      report();
    } else if (!since) since = Date.now();
  });
  addEventListener('pagehide', report);

  const did = (what) => { if (what) send('/did', { what: String(what).slice(0, 120) }); };
  addEventListener('site:did', (e) => did(e.detail));
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a || a.getAttribute('href').startsWith('#')) return;
    did('clicked ' + (a.textContent.trim() || a.href));
  }, true);
})();
