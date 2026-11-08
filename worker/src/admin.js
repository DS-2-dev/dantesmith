// The page at /admin: who left each message and who's been visiting. It asks
// for the admin token once and keeps it in this browser. Plain strings in the
// script below, no template literals, since the whole page is one.
export default `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Visitors</title>
<style>
  body { margin: 0; padding: 32px 16px 64px; font: 13px/1.4 -apple-system, system-ui, sans-serif; color: #000; background: #fff; }
  main { max-width: 1100px; margin: 0 auto; }
  h1 { margin: 0 0 20px; font-size: 16px; font-weight: 500; }
  h2 { margin: 36px 0 10px; font-size: 13px; font-weight: 500; }
  .totals { display: flex; flex-wrap: wrap; gap: 28px; }
  .totals dt { color: #6f6f6f; }
  .totals dd { margin: 0; font-size: 20px; font-variant-numeric: tabular-nums; }
  .wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 6px 12px 6px 0; border-bottom: 1px solid #ededed; text-align: left; vertical-align: top; white-space: nowrap; }
  th { color: #6f6f6f; font-weight: 400; }
  td.text { white-space: normal; min-width: 200px; }
  .muted { color: #8a8a8a; }
  button.who { padding: 1px 6px; border: 0; border-radius: 4px; background: rgba(237,237,237,.8); font: 12px ui-monospace, monospace; cursor: pointer; }
  .filter { margin-left: 8px; color: #6f6f6f; }
  .filter button { border: 0; background: none; padding: 0; color: #000; text-decoration: underline; cursor: pointer; font: inherit; }
</style>
</head>
<body>
<main>
  <h1>Visitors</h1>
  <dl class="totals"></dl>
  <h2>Messages</h2>
  <div class="wrap"><table class="messages"></table></div>
  <h2>Visits<span class="filter"></span></h2>
  <div class="wrap"><table class="visits"></table></div>
</main>
<script>
(function () {
  var KEY = 'guestbook-admin';
  var token = '';
  try { token = localStorage.getItem(KEY) || ''; } catch (e) {}
  var data = null, only = '';

  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function when(iso) { return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
  function place(r) { return [r.city, r.region, r.country].filter(Boolean).join(', ') || '<span class="muted">unknown</span>'; }
  function who(v) { return '<button class="who" data-who="' + esc(v) + '">' + esc(v) + '</button>'; }
  function ref(r) {
    if (!r) return '<span class="muted">direct</span>';
    try { return esc(new URL(r).host); } catch (e) { return esc(r); }
  }
  function table(el, head, rows) {
    el.innerHTML = '<tr>' + head.map(function (h) { return '<th>' + h + '</th>'; }).join('') + '</tr>' + rows.join('');
  }

  function render() {
    var t = data.totals;
    document.querySelector('.totals').innerHTML = [
      ['Last 24 hours', t.day + ' views, ' + t.day_people + ' people'],
      ['Last 7 days', t.week + ' views, ' + t.week_people + ' people'],
      ['All time', t.all_time + ' views, ' + t.all_people + ' people'],
    ].map(function (x) { return '<div><dt>' + x[0] + '</dt><dd>' + x[1] + '</dd></div>'; }).join('');

    table(document.querySelector('.messages'), ['When', 'Name', 'Message', 'From', 'Network', 'Device', 'Visitor'],
      data.messages.map(function (m) {
        return '<tr><td>' + when(m.at) + '</td><td>' + esc(m.name) + '</td><td class="text">' + esc(m.body) + '</td><td>' + place(m) +
          '</td><td>' + esc(m.network || '') + '</td><td>' + esc(m.device || '') + '</td><td>' + who(m.visitor) + '</td></tr>';
      }));

    var visits = only ? data.visits.filter(function (v) { return v.visitor === only; }) : data.visits;
    document.querySelector('.filter').innerHTML = only ? 'only ' + esc(only) + ' &middot; <button data-who="">show all</button>' : '';
    table(document.querySelector('.visits'), ['When', 'Page', 'Came from', 'From', 'Network', 'Device', 'Visitor'],
      visits.map(function (v) {
        return '<tr><td>' + when(v.at) + '</td><td>' + esc(v.path) + '</td><td>' + ref(v.referrer) + '</td><td>' + place(v) +
          '</td><td>' + esc(v.network || '') + '</td><td>' + esc(v.device || '') + '</td><td>' + who(v.visitor) + '</td></tr>';
      }));
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-who]');
    if (!b || !data) return;
    only = only === b.dataset.who ? '' : b.dataset.who;
    render();
  });

  function load() {
    if (!token) token = prompt('Admin token') || '';
    fetch('/admin/data', { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' }).then(function (r) {
      if (r.status === 401) {
        try { localStorage.removeItem(KEY); } catch (e) {}
        token = '';
        document.querySelector('h1').textContent = 'Wrong token. Reload to try again.';
        return;
      }
      try { localStorage.setItem(KEY, token); } catch (e) {}
      return r.json().then(function (d) { data = d; render(); });
    });
  }
  load();
})();
</script>
</body>
</html>
`;
