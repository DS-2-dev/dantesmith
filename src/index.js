// guestbook: the message board on dantesmith.studio. Anyone can read every
// message and leave one; nothing is ever edited. Deleting takes the admin
// token, a Worker secret (`npx wrangler secret put ADMIN_TOKEN`).

export const SITE = 'https://dantesmith.studio';
const LOCALHOST = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
export const NAME_MAX = 24;
export const BODY_MAX = 280;
/* One message per visitor per this many seconds. */
export const COOLDOWN = 30;
/* Across everyone, at most this many messages an hour: a ceiling on what a
   bot rotating addresses could pour in before anyone notices. */
export const HOURLY_MAX = 60;
const READ_LIMIT = 200;

/* Browsers may read from anywhere the site lives; only these may write. */
export function allowedOrigin(origin) {
  return !!origin && (origin === SITE || LOCALHOST.test(origin));
}

function corsHeaders(origin) {
  return allowedOrigin(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...corsHeaders(origin) },
  });
}

/* Control characters out, runs of spaces down to one, at most one blank line. */
export function clean(text, max) {
  return String(text ?? '')
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max);
}

async function sha256(text) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

/* Compares the two as digests, every byte, so how long it takes says
   nothing about how close a guess was. */
export async function sameSecret(given, expected) {
  if (!expected) return false;
  const [a, b] = await Promise.all([sha256(given), sha256(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function visitorKey(ip, salt) {
  const digest = await sha256(salt + ip);
  return [...digest.slice(0, 12)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const ago = (seconds) => new Date(Date.now() - seconds * 1000).toISOString();

async function list(env, origin) {
  const { results } = await env.DB.prepare(
    `SELECT id, name, body, created_at AS at FROM messages ORDER BY id DESC LIMIT ${READ_LIMIT}`
  ).all();
  return json({ messages: results.reverse() }, 200, origin);
}

async function post(request, env, origin) {
  if (!allowedOrigin(origin)) return json({ error: 'origin' }, 403, origin);
  let input;
  try { input = await request.json(); } catch { return json({ error: 'bad json' }, 400, origin); }
  // A field people never see; anything that fills it in is a bot. It is told
  // it succeeded, so it has no reason to try again.
  if (input.website) return json({ ok: true }, 200, origin);
  const name = clean(input.name, NAME_MAX) || 'guest';
  const body = clean(input.body, BODY_MAX);
  if (!body) return json({ error: 'empty' }, 400, origin);

  const flood = await env.DB.prepare('SELECT COUNT(*) AS n FROM messages WHERE created_at > ?').bind(ago(3600)).first();
  if (flood.n >= HOURLY_MAX) return json({ error: 'busy', wait: 600 }, 429, origin);

  /* The cooldown keys on the visitor's address, hashed. When Cloudflare
     can't say who it is, there is no cooldown to share; the hourly ceiling
     still holds. */
  const ip = request.headers.get('CF-Connecting-IP');
  const key = ip ? await visitorKey(ip, env.SALT || 'guestbook') : 'unknown';
  if (ip) {
    const recent = await env.DB.prepare('SELECT 1 FROM messages WHERE ip_hash = ? AND created_at > ? LIMIT 1')
      .bind(key, ago(COOLDOWN)).first();
    if (recent) return json({ error: 'slow down', wait: COOLDOWN }, 429, origin);
  }

  const at = new Date().toISOString();
  const row = await env.DB.prepare('INSERT INTO messages (name, body, created_at, ip_hash) VALUES (?, ?, ?, ?) RETURNING id')
    .bind(name, body, at, key).first();
  return json({ message: { id: row.id, name, body, at } }, 201, origin);
}

async function remove(request, env, origin, id) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!(await sameSecret(token, env.ADMIN_TOKEN))) return json({ error: 'no' }, 401, origin);
  await env.DB.prepare('DELETE FROM messages WHERE id = ?').bind(id).run();
  return json({ ok: true }, 200, origin);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const { pathname } = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: { ...corsHeaders(origin), 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' },
      });
    }
    if (pathname === '/messages' && request.method === 'GET') return list(env, origin);
    if (pathname === '/messages' && request.method === 'POST') return post(request, env, origin);
    const one = pathname.match(/^\/messages\/(\d+)$/);
    if (one && request.method === 'DELETE') return remove(request, env, origin, +one[1]);
    return json({ error: 'not found' }, 404, origin);
  },
};
