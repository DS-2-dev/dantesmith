// guestbook: the message board on dantesmith.studio. Anyone can read every
// message and leave one; nothing is ever edited. Deleting takes the admin
// token, a Worker secret (`npx wrangler secret put ADMIN_TOKEN`).

const SITE = 'https://dantesmith.studio';
const LOCALHOST = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const NAME_MAX = 24;
const BODY_MAX = 280;
/* One message per visitor per this many seconds. */
const COOLDOWN = 30;

function cors(origin) {
  if (!origin || !(origin === SITE || LOCALHOST.test(origin))) return {};
  return { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' };
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors(origin) },
  });
}

/* Control characters out, runs of whitespace down to one. */
function clean(text, max) {
  return String(text ?? '')
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max);
}

async function hashIp(ip, salt) {
  const data = new TextEncoder().encode(salt + ip);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: { ...cors(origin), 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' },
      });
    }

    if (url.pathname === '/messages' && request.method === 'GET') {
      const { results } = await env.DB.prepare(
        'SELECT id, name, body, created_at AS at FROM messages ORDER BY id DESC LIMIT 200'
      ).all();
      return json({ messages: results.reverse() }, 200, origin);
    }

    if (url.pathname === '/messages' && request.method === 'POST') {
      // Only the site itself (and local dev) may write.
      if (!cors(origin)['Access-Control-Allow-Origin']) return json({ error: 'origin' }, 403, origin);
      let input;
      try { input = await request.json(); } catch { return json({ error: 'bad json' }, 400, origin); }
      // A field people never see; anything that fills it is a bot.
      if (input.website) return json({ ok: true }, 200, origin);
      const name = clean(input.name, NAME_MAX) || 'guest';
      const body = clean(input.body, BODY_MAX);
      if (!body) return json({ error: 'empty' }, 400, origin);

      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      const ipHash = await hashIp(ip, env.SALT || 'guestbook');
      const since = new Date(Date.now() - COOLDOWN * 1000).toISOString();
      const recent = await env.DB.prepare('SELECT 1 FROM messages WHERE ip_hash = ? AND created_at > ? LIMIT 1').bind(ipHash, since).first();
      if (recent) return json({ error: 'slow down', wait: COOLDOWN }, 429, origin);

      const at = new Date().toISOString();
      const row = await env.DB.prepare('INSERT INTO messages (name, body, created_at, ip_hash) VALUES (?, ?, ?, ?) RETURNING id')
        .bind(name, body, at, ipHash).first();
      return json({ message: { id: row.id, name, body, at } }, 201, origin);
    }

    const del = url.pathname.match(/^\/messages\/(\d+)$/);
    if (del && request.method === 'DELETE') {
      const auth = request.headers.get('Authorization') || '';
      if (!env.ADMIN_TOKEN || auth !== `Bearer ${env.ADMIN_TOKEN}`) return json({ error: 'no' }, 401, origin);
      await env.DB.prepare('DELETE FROM messages WHERE id = ?').bind(+del[1]).run();
      return json({ ok: true }, 200, origin);
    }

    return json({ error: 'not found' }, 404, origin);
  },
};
