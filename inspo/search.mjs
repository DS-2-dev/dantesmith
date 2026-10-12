// Searches the inspo index from the terminal, the same way the page will:
//   node inspo/search.mjs warm film photo
import { readFileSync } from 'node:fs';

const blocks = JSON.parse(readFileSync(new URL('./blocks.json', import.meta.url))).blocks;
const channels = JSON.parse(readFileSync(new URL('./blocks.json', import.meta.url))).channels;
const tags = JSON.parse(readFileSync(new URL('./tags.json', import.meta.url)));

export const words = (s) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').match(/[a-z0-9]+/g) || [];

/* Tagged text counts most; a block's title and channel names a little. */
export function score(query, text, extra) {
  const q = words(query);
  if (!q.length) return 0;
  const t = words(text), e = words(extra);
  let s = 0, hit = 0;
  for (const w of q) {
    let best = 0;
    for (const x of t) best = Math.max(best, x === w ? 3 : x.startsWith(w) && w.length > 2 ? 2 : 0);
    for (const x of e) best = Math.max(best, x === w ? 1 : 0);
    if (best) hit++;
    s += best;
  }
  return hit === q.length ? s + hit * 2 : s * 0.3; // every word found beats some
}

const query = process.argv.slice(2).join(' ');
const results = blocks
  .filter((b) => tags[b.id])
  .map((b) => ({ b, s: score(query, tags[b.id], b.title + ' ' + b.ch.map((c) => channels[c]?.title).join(' ')) }))
  .filter((r) => r.s > 0)
  .sort((a, z) => z.s - a.s)
  .slice(0, 12);
for (const { b, s } of results) console.log(s.toFixed(1).padStart(5), `https://www.are.na/block/${b.id}`, '·', channels[b.ch[0]]?.title, '\n       ', tags[b.id].slice(0, 140));
if (!results.length) console.log('nothing yet');
