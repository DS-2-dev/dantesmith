// Pulls the Are.na blocks that feed the inspo search: every block in my own
// channels, plus every block in the channels I follow (only channels I follow
// directly; the people I follow are not walked). Public API, no key.
//
//   node inspo/sync.mjs           update inspo/blocks.json
//
// A channel whose updated_at hasn't moved since the last run is not fetched
// again. Image URLs are stored as their storage key; the page rebuilds the
// sized URL (see imageUrl in this file and in the page).

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const API = 'https://api.are.na/v3';
const ME = 'dante-smith';
const OUT = new URL('./blocks.json', import.meta.url);
const PAUSE = 250; // ms between requests, to stay polite

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* An Are.na personal access token, if there is one, from inspo/.env
   (ignored by git) or the environment. Optional: everything read here is
   public, the token only lifts the rate limit. */
function token() {
  if (process.env.ARENA_TOKEN) return process.env.ARENA_TOKEN;
  const env = new URL('./.env', import.meta.url);
  if (!existsSync(env)) return null;
  const m = readFileSync(env, 'utf8').match(/^ARENA_TOKEN=(.+)$/m);
  return m ? m[1].trim() : null;
}
const TOKEN = token();
const HEADERS = { Accept: 'application/json', ...(TOKEN && { Authorization: `Bearer ${TOKEN}` }) };

async function get(path, tries = 5) {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(API + path, { headers: HEADERS });
    if (res.ok) { await sleep(PAUSE); return res.json(); }
    if (res.status === 429 || res.status >= 500) {
      const wait = (+res.headers.get('retry-after') || 2 ** i * 2) * 1000;
      console.warn(`  ${res.status} on ${path}, waiting ${wait / 1000}s`);
      await sleep(wait);
      continue;
    }
    throw new Error(`${res.status} on ${path}`);
  }
  throw new Error(`gave up on ${path}`);
}

async function* pages(path) {
  for (let page = 1; ; page++) {
    const sep = path.includes('?') ? '&' : '?';
    const { data, meta } = await get(`${path}${sep}per=100&page=${page}`);
    yield* data;
    if (!meta?.has_more_pages) return;
  }
}

/* The original upload's storage key, e.g. "41413636/original_7933….jpg". */
export function imageKey(src) {
  const m = src && src.match(/cloudfront\.net\/(.+?)(\?|$)/);
  return m ? decodeURIComponent(m[1]) : null;
}

/* Are.na's resizer takes the key and the edits as base64 JSON. */
export function imageUrl(key, size = 400) {
  const spec = { bucket: 'arena_images', key, edits: { resize: { width: size, height: size, fit: 'inside', withoutEnlargement: true }, webp: { quality: 75 }, jpeg: { quality: 75 }, rotate: null } };
  return 'https://images.are.na/' + Buffer.from(JSON.stringify(spec)).toString('base64');
}

function compact(b, channel, mine) {
  const key = imageKey(b.image?.src);
  if (!key) return null; // text blocks and anything else without a picture
  return {
    id: b.id,
    type: b.type,
    title: b.title || '',
    key,
    w: b.image.width, h: b.image.height,
    url: b.source?.url || undefined,
    by: b.connection?.connected_by?.slug,
    at: b.connection?.connected_at,
    ch: [channel],
    mine: mine || undefined,
  };
}

async function main() {
  const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { channels: {}, blocks: [] };
  const prevBlocks = new Map(prev.blocks.map((b) => [b.id, b]));

  const channels = [];
  for await (const c of pages(`/users/${ME}/contents?type=Channel`)) if (c.visibility !== 'private') channels.push({ c, mine: true }); // 'closed' is public to view
  for await (const c of pages(`/users/${ME}/following`)) if (c.type === 'Channel') channels.push({ c, mine: false });
  console.log(TOKEN ? 'using Are.na token' : 'no Are.na token, public rate limit');
  console.log(`${channels.length} channels (${channels.filter((x) => x.mine).length} mine)`);

  const outChannels = {};
  const blocks = new Map();
  const add = (b) => {
    const have = blocks.get(b.id);
    if (!have) return blocks.set(b.id, b);
    for (const ch of b.ch) if (!have.ch.includes(ch)) have.ch.push(ch);
    if (b.mine) have.mine = true;
  };

  for (const { c, mine } of channels) {
    const meta = { title: c.title, owner: c.owner?.name || c.owner?.title || '', updated: c.updated_at, count: c.counts?.contents ?? 0, mine: mine || undefined };
    outChannels[c.slug] = meta;
    const old = prev.channels[c.slug];
    if (old && old.updated === c.updated_at) {
      // unchanged: reuse what we had
      for (const b of prevBlocks.values()) if (b.ch.includes(c.slug)) add({ ...b, ch: [c.slug], mine: mine || b.mine });
      console.log(`  = ${c.title} (unchanged)`);
      continue;
    }
    let n = 0;
    for await (const b of pages(`/channels/${c.slug}/contents`)) {
      if (b.type === 'Channel') continue;
      const r = compact(b, c.slug, mine);
      if (r) { add(r); n++; }
    }
    console.log(`  + ${c.title}: ${n} with images`);
  }

  const list = [...blocks.values()].sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  writeFileSync(OUT, JSON.stringify({ synced: new Date().toISOString(), channels: outChannels, blocks: list }));
  console.log(`${list.length} blocks with images → inspo/blocks.json`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
