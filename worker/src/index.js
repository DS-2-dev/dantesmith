// guestbook: the message board on dantesmith.studio. Anyone can read every
// message and leave one; nothing is ever edited. Deleting takes the admin
// token, a Worker secret (`npx wrangler secret put ADMIN_TOKEN`).
// It also counts page views from the site's beacon. Each message and visit
// keeps roughly where it came from (Cloudflare's city, region, country and
// network) and the device; never the address itself. Only /admin shows them.

import ADMIN_PAGE from './admin.js';

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
/* The same visitor on the same page within this many seconds is one visit. */
export const VISIT_GAP = 1800;
const ADMIN_VISITS = 500;

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

/* What Cloudflare knows about where a request came from. Missing outside
   Cloudflare (and in tests that don't set it). */
export function whereFrom(request) {
  const cf = request.cf || {};
  return { city: cf.city || null, region: cf.region || null, country: cf.country || null, network: cf.asOrganization || null };
}

/* A short name for the device: the OS, then the browser, or the app whose
   built-in browser it is, since that says where the link was tapped. */
export function device(ua) {
  ua = ua || '';
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android'
    : /CrOS/.test(ua) ? 'ChromeOS' : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '';
  const app = /Instagram/.test(ua) ? 'Instagram' : /FBAN|FBAV/.test(ua) ? 'Facebook' : /musical_ly|TikTok|BytedanceWebview/.test(ua) ? 'TikTok'
    : /Snapchat/.test(ua) ? 'Snapchat' : /LinkedInApp/.test(ua) ? 'LinkedIn' : /Discord/.test(ua) ? 'Discord' : '';
  const browser = app ? app + ' app' : /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\/|FxiOS/.test(ua) ? 'Firefox'
    : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
  return [os, browser].filter(Boolean).join(' ') || 'unknown';
}

const BOT = /bot|crawl|spider|slurp|preview|headless|lighthouse|python|curl|wget/i;

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
  const w = whereFrom(request);
  const row = await env.DB.prepare('INSERT INTO messages (name, body, created_at, ip_hash, city, region, country, network, device) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id')
    .bind(name, body, at, key, w.city, w.region, w.country, w.network, device(request.headers.get('User-Agent'))).first();
  return json({ message: { id: row.id, name, body, at } }, 201, origin);
}

/* A page view. Sent as text/plain so the browser needs no preflight; the
   body is still JSON. Always answers 204, so a page never waits on it. */
async function visit(request, env, origin) {
  const done = new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (!allowedOrigin(origin)) return done;
  const ua = request.headers.get('User-Agent') || '';
  if (BOT.test(ua) || request.cf?.verifiedBotCategory) return done;
  let input = {};
  try { input = JSON.parse(await request.text()); } catch {}
  const path = clean(input.path, 200) || '/';
  const referrer = clean(input.referrer, 300) || null;
  const ip = request.headers.get('CF-Connecting-IP');
  const key = ip ? await visitorKey(ip, env.SALT || 'guestbook') : 'unknown';
  if (ip) {
    const seen = await env.DB.prepare('SELECT 1 FROM visits WHERE ip_hash = ? AND path = ? AND at > ? LIMIT 1')
      .bind(key, path, ago(VISIT_GAP)).first();
    if (seen) return done;
  }
  const w = whereFrom(request);
  await env.DB.prepare('INSERT INTO visits (at, path, referrer, ip_hash, city, region, country, network, device) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(new Date().toISOString(), path, referrer, key, w.city, w.region, w.country, w.network, device(ua)).run();
  return done;
}

async function isAdmin(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  return sameSecret(token, env.ADMIN_TOKEN);
}

/* Everything /admin shows. `visitor` is a short form of the hashed address:
   the same visitor gets the same one across messages and visits. */
async function adminData(request, env) {
  if (!(await isAdmin(request, env))) return json({ error: 'no' }, 401, null);
  const visitor = 'substr(ip_hash, 1, 6) AS visitor';
  const [messages, visits, totals] = await Promise.all([
    env.DB.prepare(`SELECT id, name, body, created_at AS at, ${visitor}, city, region, country, network, device FROM messages ORDER BY id DESC LIMIT ${READ_LIMIT}`).all(),
    env.DB.prepare(`SELECT at, path, referrer, ${visitor}, city, region, country, network, device FROM visits ORDER BY id DESC LIMIT ${ADMIN_VISITS}`).all(),
    env.DB.prepare(`SELECT
        (SELECT COUNT(*) FROM visits WHERE at > ?1) AS day,
        (SELECT COUNT(DISTINCT ip_hash) FROM visits WHERE at > ?1) AS day_people,
        (SELECT COUNT(*) FROM visits WHERE at > ?2) AS week,
        (SELECT COUNT(DISTINCT ip_hash) FROM visits WHERE at > ?2) AS week_people,
        (SELECT COUNT(*) FROM visits) AS all_time,
        (SELECT COUNT(DISTINCT ip_hash) FROM visits) AS all_people`).bind(ago(86400), ago(7 * 86400)).first(),
  ]);
  return json({ totals, messages: messages.results, visits: visits.results }, 200, null);
}

async function remove(request, env, origin, id) {
  if (!(await isAdmin(request, env))) return json({ error: 'no' }, 401, origin);
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
    if (pathname === '/visit' && request.method === 'POST') return visit(request, env, origin);
    if (pathname === '/admin' && request.method === 'GET') {
      return new Response(ADMIN_PAGE, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
    }
    if (pathname === '/admin/data' && request.method === 'GET') return adminData(request, env);
    const one = pathname.match(/^\/messages\/(\d+)$/);
    if (one && request.method === 'DELETE') return remove(request, env, origin, +one[1]);
    return json({ error: 'not found' }, 404, origin);
  },
};
