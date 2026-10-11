import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, it } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import worker, { BODY_MAX, COOLDOWN, HOURLY_MAX, NAME_MAX, SITE, clean, sameSecret } from '../src/index.js';

/* D1's prepare/bind/first/all/run, over an in-memory SQLite with the real
   schema. Nothing here ever touches the live database. */
function memoryD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  const statement = (sql, args = []) => ({
    bind: (...next) => statement(sql, next),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => db.prepare(sql).run(...args),
  });
  return { prepare: (sql) => statement(sql), raw: db };
}

let env;
beforeEach(() => { env = { DB: memoryD1(), ADMIN_TOKEN: 'test-token', SALT: 'test-salt' }; });

const call = (method, path, { origin = SITE, ip = '203.0.113.7', body, auth } = {}) => {
  const headers = {};
  if (origin) headers.Origin = origin;
  if (ip) headers['CF-Connecting-IP'] = ip;
  if (auth) headers.Authorization = auth;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  return worker.fetch(new Request('https://guestbook.test' + path, {
    method, headers, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  }), env);
};
const post = (body, opts) => call('POST', '/messages', { body, ...opts });
const read = async () => (await (await call('GET', '/messages')).json()).messages;
/* Moves every stored message back in time, as if they were posted earlier. */
const age = (seconds) => env.DB.raw.prepare('UPDATE messages SET created_at = ?').run(new Date(Date.now() - seconds * 1000).toISOString());

describe('posting', () => {
  it('saves a message and hands it back with its id', async () => {
    const res = await post({ name: 'dante', body: 'hello' });
    assert.equal(res.status, 201);
    const { message } = await res.json();
    assert.equal(message.name, 'dante');
    assert.equal(message.body, 'hello');
    assert.deepEqual((await read()).map((m) => m.id), [message.id]);
  });

  it('calls a nameless visitor guest', async () => {
    const { message } = await (await post({ body: 'hi' })).json();
    assert.equal(message.name, 'guest');
  });

  it('cuts names and messages to length', async () => {
    const { message } = await (await post({ name: 'n'.repeat(99), body: 'b'.repeat(999) })).json();
    assert.equal(message.name.length, NAME_MAX);
    assert.equal(message.body.length, BODY_MAX);
  });

  it('refuses an empty message', async () => {
    assert.equal((await post({ body: '   ' })).status, 400);
    assert.equal((await read()).length, 0);
  });

  it('refuses a body that is not JSON', async () => {
    assert.equal((await post('{nope')).status, 400);
  });

  it('only takes messages from the site and from localhost', async () => {
    assert.equal((await post({ body: 'hi' }, { origin: 'https://elsewhere.example' })).status, 403);
    assert.equal((await post({ body: 'hi' }, { origin: null })).status, 403);
    assert.equal((await post({ body: 'hi' }, { origin: 'http://localhost:8765' })).status, 201);
  });

  it('tells a bot that filled the hidden field it worked, and saves nothing', async () => {
    const res = await post({ body: 'buy now', website: 'spam.example' });
    assert.equal(res.status, 200);
    assert.equal((await read()).length, 0);
  });
});

describe('slowing down', () => {
  it('holds one visitor to one message per cooldown', async () => {
    assert.equal((await post({ body: 'one' })).status, 201);
    const res = await post({ body: 'two' });
    assert.equal(res.status, 429);
    assert.equal((await res.json()).wait, COOLDOWN);
    age(COOLDOWN + 1);
    assert.equal((await post({ body: 'three' })).status, 201);
  });

  it('keeps visitors apart', async () => {
    assert.equal((await post({ body: 'a' }, { ip: '203.0.113.1' })).status, 201);
    assert.equal((await post({ body: 'b' }, { ip: '203.0.113.2' })).status, 201);
  });

  it('does not lump visitors with no known address together', async () => {
    assert.equal((await post({ body: 'a' }, { ip: null })).status, 201);
    assert.equal((await post({ body: 'b' }, { ip: null })).status, 201);
  });

  it('stops everyone once the hour is full', async () => {
    const insert = env.DB.raw.prepare("INSERT INTO messages (name, body, created_at, ip_hash) VALUES ('x', 'x', ?, 'x')");
    for (let i = 0; i < HOURLY_MAX; i++) insert.run(new Date().toISOString());
    assert.equal((await post({ body: 'late' }, { ip: '198.51.100.9' })).status, 429);
    age(3601);
    assert.equal((await post({ body: 'next hour' }, { ip: '198.51.100.9' })).status, 201);
  });
});

describe('reading', () => {
  it('lists oldest first and never shows who posted', async () => {
    await post({ body: 'first' }, { ip: '203.0.113.1' });
    await post({ body: 'second' }, { ip: '203.0.113.2' });
    const messages = await read();
    assert.deepEqual(messages.map((m) => m.body), ['first', 'second']);
    assert.deepEqual(Object.keys(messages[0]).sort(), ['at', 'body', 'id', 'name']);
  });

  it('lets the site read across origins', async () => {
    const res = await call('GET', '/messages');
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), SITE);
  });
});

describe('deleting', () => {
  it('needs the admin token', async () => {
    const { message } = await (await post({ body: 'keep me' })).json();
    assert.equal((await call('DELETE', `/messages/${message.id}`)).status, 401);
    assert.equal((await call('DELETE', `/messages/${message.id}`, { auth: 'Bearer wrong' })).status, 401);
    assert.equal((await read()).length, 1);
  });

  it('removes exactly the message asked for', async () => {
    const { message: a } = await (await post({ body: 'a' }, { ip: '203.0.113.1' })).json();
    await post({ body: 'b' }, { ip: '203.0.113.2' });
    assert.equal((await call('DELETE', `/messages/${a.id}`, { auth: 'Bearer test-token' })).status, 200);
    assert.deepEqual((await read()).map((m) => m.body), ['b']);
  });

  it('refuses everyone when no token is set', async () => {
    env.ADMIN_TOKEN = undefined;
    assert.equal((await call('DELETE', '/messages/1', { auth: 'Bearer ' })).status, 401);
  });
});

describe('helpers', () => {
  it('clean strips control characters and squeezes space', () => {
    assert.equal(clean('  a\u0000b   c\n\n\n\nd  ', 99), 'ab c\n\nd');
    assert.equal(clean(undefined, 9), '');
  });

  it('sameSecret matches only the exact secret', async () => {
    assert.equal(await sameSecret('abc', 'abc'), true);
    assert.equal(await sameSecret('abd', 'abc'), false);
    assert.equal(await sameSecret('', ''), false);
  });
});

it('answers anything else with 404', async () => {
  assert.equal((await call('GET', '/nope')).status, 404);
});
