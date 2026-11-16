// Counts this page view on the guestbook worker (worker/src/index.js), which
// notes roughly where it came from. Only on the live site, so local previews
// don't count.
//
// Opening any page with ?me marks this browser as Dante's, and it stops
// counting itself from then on; ?notme undoes that. The flag lives in this
// browser only, so each device and browser needs it once.
(() => {
  const params = new URLSearchParams(location.search);
  let mine = false;
  try {
    if (params.has('me')) localStorage.setItem('notCounted', '1');
    if (params.has('notme')) localStorage.removeItem('notCounted');
    mine = localStorage.getItem('notCounted') === '1';
  } catch {}

  if (params.has('me') || params.has('notme')) {
    params.delete('me');
    params.delete('notme');
    const query = params.toString();
    history.replaceState(null, '', location.pathname + (query ? '?' + query : '') + location.hash);
  }

  if (mine || location.hostname !== 'dantesmith.studio') return;
  fetch('https://guestbook.now-playing.workers.dev/visit', {
    method: 'POST',
    body: JSON.stringify({ path: location.pathname, referrer: document.referrer }),
    keepalive: true,
  }).catch(() => {});
})();
