// Counts this page view on the guestbook worker (worker/src/index.js), which
// notes roughly where it came from. Only on the live site, so local previews
// don't count.
if (location.hostname === 'dantesmith.studio') {
  fetch('https://guestbook.now-playing.workers.dev/visit', {
    method: 'POST',
    body: JSON.stringify({ path: location.pathname, referrer: document.referrer }),
    keepalive: true,
  }).catch(() => {});
}
