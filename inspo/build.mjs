// Builds inspo/index.json, the file the page searches: only blocks that have
// tags, packed small.
//   node inspo/build.mjs
//
// { c: [[slug, title, owner], …],
//   b: [[id, key, w, h, [channel indexes], tags, mine], …] }
import { readFileSync, writeFileSync } from 'node:fs';

const { channels, blocks } = JSON.parse(readFileSync(new URL('./blocks.json', import.meta.url)));
const tags = JSON.parse(readFileSync(new URL('./tags.json', import.meta.url)));
const slugs = Object.keys(channels);
const at = new Map(slugs.map((s, i) => [s, i]));
const b = blocks
  .filter((x) => tags[x.id])
  .map((x) => [x.id, x.key, x.w, x.h, x.ch.map((s) => at.get(s)), tags[x.id], x.mine ? 1 : 0]);
const c = slugs.map((s) => [s, channels[s].title, channels[s].owner]);
const out = JSON.stringify({ c, b });
writeFileSync(new URL('./index.json', import.meta.url), out);
console.log(`${b.length} blocks, ${(out.length / 1024).toFixed(0)}KB → inspo/index.json`);
