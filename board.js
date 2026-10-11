/* The message board: one Windows 95 window anyone can leave a note in. The
   notes live in the guestbook Worker's database, so they stay for good and
   every visitor sees the same list. It opens from its card in the space. */
(function () {
  const API = 'https://guestbook.now-playing.workers.dev/messages';
  const EVERY = 20000;
  const win = document.querySelector('.mb95');
  if (!win) return;

  const log = win.querySelector('.mb95-log');
  const form = win.querySelector('.mb95-compose');
  const nameIn = win.querySelector('#mb95-name');
  const bodyIn = win.querySelector('#mb95-body');
  const send = win.querySelector('.mb95-send');
  const status = win.querySelector('.mb95-status-text');
  const count = win.querySelector('.mb95-status-count');

  const store = {
    get(k) { try { return localStorage.getItem('mb95:' + k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem('mb95:' + k, v); } catch {} },
  };
  nameIn.value = store.get('name') || '';

  function when(iso) {
    const d = new Date(iso);
    const now = new Date();
    const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const then = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diff = Math.round((day - then) / 86400000);
    if (diff === 0) return 'Today at ' + time;
    if (diff === 1) return 'Yesterday at ' + time;
    return d.toLocaleDateString([], { month: '2-digit', day: '2-digit', year: 'numeric' });
  }

  /* Everything a visitor wrote goes in as text, never as markup. */
  function row(m) {
    const el = document.createElement('div');
    el.className = 'mb95-msg';
    el.dataset.id = m.id;
    const main = document.createElement('div');
    const head = document.createElement('div');
    head.className = 'mb95-head';
    const b = document.createElement('b');
    b.textContent = m.name;
    if (m.name === nameIn.value.trim()) b.className = 'mine';
    const i = document.createElement('i');
    i.textContent = when(m.at);
    head.append(b, i);
    const text = document.createElement('div');
    text.className = 'mb95-text';
    text.textContent = m.body;
    main.append(head, text);
    el.append(main);
    return el;
  }

  let shown = null;
  function render(messages) {
    const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 24;
    const ids = messages.map((m) => m.id).join();
    if (shown && ids === shown.map((m) => m.id).join()) return;
    shown = messages;
    const start = document.createElement('div');
    start.className = 'mb95-divider';
    start.textContent = 'Welcome to the board! Leave a message.';
    log.replaceChildren(start, ...messages.map(row));
    window.dispatchEvent(new CustomEvent('board:messages', { detail: messages }));
    count.textContent = messages.length + (messages.length === 1 ? ' message' : ' messages');
    if (atBottom || !log.dataset.ready) log.scrollTop = log.scrollHeight;
    log.dataset.ready = '1';
  }

  async function load() {
    try {
      const r = await fetch(API, { cache: 'no-store' });
      if (!r.ok) throw new Error();
      const data = await r.json();
      render(data.messages || []);
      status.textContent = 'Connected to MB-SERVER via 28.8 Kbps';
    } catch {
      status.textContent = 'Could not reach the server';
    }
  }

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const body = bodyIn.value.trim();
    if (!body) return;
    const name = nameIn.value.trim();
    store.set('name', name);
    send.disabled = true;
    status.textContent = 'Sending...';
    try {
      const r = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, body, website: form.website.value }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.status === 429) { status.textContent = 'Slow down. Wait ' + (data.wait || 30) + ' seconds.'; return; }
      if (!r.ok) { status.textContent = 'Message not sent'; return; }
      bodyIn.value = '';
      if (data.message) render([...(shown || []), data.message]);
      log.scrollTop = log.scrollHeight;
      status.textContent = 'Message sent';
    } catch {
      status.textContent = 'Could not reach the server';
    } finally {
      send.disabled = false;
    }
  });

  /* The space flies the window in from its card and back; this side fills
     it, and hands a close back to the space. */
  addEventListener('board:open', () => {
    load();
    setTimeout(() => bodyIn.focus({ preventScroll: true }), 800);
  });
  const close = () => { if (!win.hidden) window.dispatchEvent(new Event('board:closed')); };
  win.querySelector('[data-act="close"]').addEventListener('click', close);
  win.querySelector('[data-act="min"]').addEventListener('click', close);
  addEventListener('keydown', (ev) => { if (ev.key === 'Escape') close(); });
  load();

  setInterval(() => { if (!document.hidden) load(); }, EVERY);
})();
