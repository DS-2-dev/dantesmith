import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const HTTP_PORT = 4174;
const DEBUG_PORT = 9223;

/* A section is up once its fade and its lift have run: 0.12s of delay and
   0.5s of travel, and the mark's 0.55s move to the corner, with room over. */
const SETTLE = 800;

function chromiumPath() {
  if (process.env.CHROMIUM_PATH && existsSync(process.env.CHROMIUM_PATH)) {
    return process.env.CHROMIUM_PATH;
  }

  const cache = join(homedir(), 'Library', 'Caches', 'ms-playwright');
  if (existsSync(cache)) {
    const installs = readdirSync(cache)
      .filter((name) => name.startsWith('chromium_headless_shell-'))
      .sort()
      .reverse();
    for (const install of installs) {
      const candidate = join(
        cache,
        install,
        'chrome-headless-shell-mac-arm64',
        'chrome-headless-shell',
      );
      if (existsSync(candidate)) return candidate;
    }
  }

  throw new Error('Set CHROMIUM_PATH to a Chromium or Chrome headless-shell executable.');
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(url, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch {}
    await sleep(50);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

class Cdp {
  #id = 0;
  #pending = new Map();
  #listeners = new Map();
  #socket;

  constructor(url) {
    this.#socket = new WebSocket(url);
    this.#socket.addEventListener('message', ({ data }) => {
      const message = JSON.parse(data);
      if (message.method) this.#listeners.get(message.method)?.(message.params);
      if (!message.id) return;
      const pending = this.#pending.get(message.id);
      if (!pending) return;
      this.#pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
    this.#socket.addEventListener('close', () => {
      for (const pending of this.#pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error('Chromium closed before answering a CDP command.'));
      }
      this.#pending.clear();
    });
  }

  async ready() {
    if (this.#socket.readyState === WebSocket.OPEN) return;
    await new Promise((resolve, reject) => {
      this.#socket.addEventListener('open', resolve, { once: true });
      this.#socket.addEventListener('error', reject, { once: true });
    });
  }

  send(method, params = {}) {
    const id = ++this.#id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`Timed out waiting for CDP command ${method}`));
      }, 10_000);
      this.#pending.set(id, { resolve, reject, timer });
      this.#socket.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, listener) {
    this.#listeners.set(method, listener);
  }

  close() {
    this.#socket.close();
  }
}

/* What Last.fm answers, stood in for so the test neither depends on the
   network nor on what happens to be playing. The art is a file the test's
   own server has. */
function recentTrack(extra) {
  return {
    recenttracks: {
      track: [{
        name: 'Nights',
        artist: { '#text': 'Frank Ocean' },
        album: { '#text': 'Blonde' },
        image: [{ size: 'large', '#text': `http://127.0.0.1:${HTTP_PORT}/images/apple-touch-icon.png` }],
        ...extra,
      }],
    },
  };
}
/* What Are.na answers for the channel, newest first: a link and a text
   block among the pictures, which the card has to skip. The pictures are
   files the test's own server has. */
function arenaChannel(files) {
  /* one id per picture, the way Are.na has one per block: the card knows a
     new picture by its id, so ids by position would make every set look the
     same */
  const picture = (file) => ({
    id: 'block-' + file,
    class: 'Image',
    title: file,
    image: { square: { url: `http://127.0.0.1:${HTTP_PORT}/images/${file}` } },
  });
  const [first, ...rest] = files.map(picture);
  return {
    contents: [
      { id: 999, class: 'Link', title: 'a link', image: { square: { url: `http://127.0.0.1:${HTTP_PORT}/images/og-card.jpg` } } },
      first,
      { id: 998, class: 'Text', title: 'a note', content: 'words' },
      ...rest,
    ],
  };
}
const ARENA = arenaChannel(['sidq-switch-ai.webp', 'sidq-your-context.webp', 'sidq-stop-explaining.webp', 'vantage.webp', 'weave-cover.webp']);
const ARENA_NEXT = arenaChannel(['wsu-ai-lab-poster.webp', 'sidq-switch-ai.webp', 'sidq-your-context.webp', 'sidq-stop-explaining.webp', 'vantage.webp']);

const NOW_PLAYING = recentTrack({ '@attr': { nowplaying: 'true' } });
const LAST_PLAYED = recentTrack({ date: { uts: String(Math.floor(Date.now() / 1000) - 300) } });

/* Runs an expression in the page and hands back what it returned. */
async function evaluate(cdp, expression) {
  const { result, exceptionDetails } = await cdp.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression,
  });
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
  return result.value;
}

/* A fresh load at a size. A phone is emulated as one — the viewport meta
   honoured and touch in place of a mouse — so (hover: none) matches there the
   way it does in a hand. */
async function load(cdp, width, height, phone = false) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: phone,
  });
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: phone });
  await cdp.send('Emulation.setEmulatedMedia', {
    features: [
      { name: 'hover', value: phone ? 'none' : 'hover' },
      { name: 'pointer', value: phone ? 'coarse' : 'fine' },
    ],
  });
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${HTTP_PORT}/` });
  await sleep(500);
  await evaluate(cdp, `(async () => {
    if (document.fonts?.ready) {
      await Promise.race([
        document.fonts.ready,
        new Promise((resolve) => setTimeout(resolve, 1500)),
      ]);
    }
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
  })()`);
}

async function open(cdp, view) {
  await evaluate(cdp, `document.querySelector('.menu-item[data-view="${view}"]').click()`);
  await sleep(SETTLE);
}

/* Where everything is once a section is up. */
function metrics(cdp, view) {
  return evaluate(cdp, `(() => {
    const rect = (el) => {
      const b = el.getBoundingClientRect();
      return { top: b.top, right: b.right, bottom: b.bottom, left: b.left, width: b.width, height: b.height };
    };
    const section = document.getElementById('${view}');
    return {
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      documentWidth: document.documentElement.scrollWidth,
      section: { ...rect(section), clientHeight: section.clientHeight, scrollHeight: section.scrollHeight },
      mark: rect(document.querySelector('.monogram')),
      menu: rect(document.querySelector('.menu')),
      projects: section.querySelector('.projects') && rect(section.querySelector('.projects')),
      cards: [...section.querySelectorAll('.project')].map((card) => ({
        card: rect(card),
        media: rect(card.querySelector('.project-media')),
        text: rect(card.querySelector('.project-text')),
        named: !!card.querySelector('.project-name')?.textContent.trim(),
        switching: card.classList.contains('project--switch'),
        /* which shared row the card is in, or -1 for a card with a row to itself */
        row: [...section.querySelectorAll('.project-row')].indexOf(card.parentElement),
        /* the ratio from the file's own width and height attributes, not from
           the drawn box, which is the thing being checked against it */
        /* the pictures showing: a switched-away panel's are not on the page */
        pictures: [...card.querySelectorAll('.project-media img')].filter((img) => !img.closest('[hidden]')).map((img) => ({
          ...rect(img),
          src: img.getAttribute('src'),
          ratio: img.getAttribute('width') / img.getAttribute('height'),
        })),
      })),
    };
  })()`);
}

/* Where a section's content sits at rest, and where its end lands once the
   section is scrolled all the way down. */
function reach(cdp, view) {
  return evaluate(cdp, `(async () => {
    const section = document.getElementById('${view}');
    const content = [...section.children].filter((el) => !el.classList.contains('sr-only'));
    const frame = () => new Promise(requestAnimationFrame);
    section.scrollTop = 0;
    await frame();
    const top = content[0].getBoundingClientRect().top;
    section.scrollTop = section.scrollHeight;
    await frame();
    const bottom = content.at(-1).getBoundingClientRect().bottom;
    section.scrollTop = 0;
    return { top, bottom };
  })()`);
}

/* The header floats over the sections, so what has to clear it is the
   content: at rest it starts below both the mark and the menu, and scrolled
   to the end its last line comes all the way into the window. */
async function assertClearOfChrome(cdp, view, m, at) {
  const { top, bottom } = await reach(cdp, view);
  const header = Math.max(m.mark.bottom, m.menu.bottom);
  assert.ok(top >= header - 1, `${at} ${view} starts under the header: ${top} against ${header}`);
  assert.ok(bottom <= m.viewportHeight + 1, `${at} ${view} cannot bring its end into the window: ${bottom} in ${m.viewportHeight}`);
}

async function pressKey(cdp, key, keyCode) {
  const event = { key, code: key, windowsVirtualKeyCode: keyCode };
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...event });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...event });
}
const pressTab = (cdp) => pressKey(cdp, 'Tab', 9);

test('the page', async (t) => {
  const profile = mkdtempSync(join(tmpdir(), 'portfolio-chromium-'));
  const server = spawn('python3', ['-m', 'http.server', String(HTTP_PORT), '--bind', '127.0.0.1'], {
    cwd: process.cwd(),
    stdio: 'ignore',
  });
  const browser = spawn(chromiumPath(), [
    '--headless',
    '--no-sandbox',
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${profile}`,
  ], { stdio: 'ignore' });

  t.after(async () => {
    server.kill('SIGTERM');
    browser.kill('SIGTERM');
    if (server.exitCode === null) await once(server, 'exit');
    if (browser.exitCode === null) await once(browser, 'exit');
    rmSync(profile, { recursive: true, force: true });
  });

  await waitFor(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
  await waitFor(`http://127.0.0.1:${HTTP_PORT}/`);
  const page = await fetch(
    `http://127.0.0.1:${DEBUG_PORT}/json/new?about:blank`,
    { method: 'PUT' },
  ).then((response) => response.json());
  const cdp = new Cdp(page.webSocketDebuggerUrl);
  await cdp.ready();
  t.after(() => cdp.close());
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  /* the page has to believe it is focused, or nothing inside it can be */
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });

  /* Every call to Last.fm is answered here, with whatever `lastfm` holds at
     the time. The CORS header is what the real API sends too. */
  let lastfm = { status: 200, body: NOW_PLAYING };
  let arena = { status: 200, body: ARENA };
  cdp.on('Fetch.requestPaused', ({ requestId, request }) => {
    const answer = request.url.includes('api.are.na') ? arena : lastfm;
    /* left unanswered, the way a stalled connection leaves a request */
    if (answer.hang) return;
    cdp.send('Fetch.fulfillRequest', {
      requestId,
      responseCode: answer.status,
      responseHeaders: [
        { name: 'Content-Type', value: 'application/json' },
        { name: 'Access-Control-Allow-Origin', value: '*' },
      ],
      body: Buffer.from(JSON.stringify(answer.body)).toString('base64'),
    }).catch(() => {});
  });
  await cdp.send('Fetch.enable', {
    patterns: [{ urlPattern: '*ws.audioscrobbler.com*' }, { urlPattern: '*api.are.na*' }],
  });

  /* The card at home: what it says, whether it shows, and where it sits
     against the menu in the other corner. */
  const listening = `(() => {
    const card = document.getElementById('listening');
    const style = getComputedStyle(card);
    const box = card.getBoundingClientRect();
    return {
      fill: style.backgroundColor,
      innerWidth,
      innerHeight,
      hidden: card.hidden,
      visibility: style.visibility,
      opacity: style.opacity,
      label: card.querySelector('.listening-label').textContent,
      /* a marquee sets the name twice; the first copy is the one read out */
      title: (card.querySelector('.listening-title .marquee-copy') || card.querySelector('.listening-title')).textContent,
      artist: (card.querySelector('.listening-artist .marquee-copy') || card.querySelector('.listening-artist')).textContent,
      titleScrolls: card.querySelector('.listening-title').classList.contains('is-long'),
      artistScrolls: card.querySelector('.listening-artist').classList.contains('is-long'),
      echoHidden: [...card.querySelectorAll('.marquee-copy + .marquee-copy')].every((copy) => copy.getAttribute('aria-hidden') === 'true'),
      moving: (() => {
        const track = card.querySelector('.listening-title .marquee');
        return !!track && getComputedStyle(track).animationName === 'marquee';
      })(),
      /* a ticker: one steady pace, no holding still at the start of a pass */
      steady: (() => {
        const track = card.querySelector('.listening-title .marquee');
        return !!track && getComputedStyle(track).animationTimingFunction === 'linear';
      })(),
      /* how far the loop's distance is from where the second copy really
         starts: anything but nothing is a jump at the seam */
      seam: (() => {
        const line = card.querySelector('.listening-title');
        const copies = line.querySelectorAll('.marquee-copy');
        if (copies.length < 2) return null;
        const real = copies[1].getBoundingClientRect().left - copies[0].getBoundingClientRect().left;
        return Math.abs(real - parseFloat(line.style.getPropertyValue('--marquee-distance')));
      })(),
      playing: card.classList.contains('is-playing'),
      art: card.classList.contains('has-art'),
      left: box.left,
      right: box.right,
      bottom: box.bottom,
    };
  })()`;

  await t.test('home shows what is playing, from Last.fm', async () => {
    lastfm = { status: 200, body: NOW_PLAYING };
    await load(cdp, 1440, 900);
    await sleep(SETTLE);
    let card = await evaluate(cdp, listening);
    assert.equal(card.hidden, false, 'the card did not come up with a track');
    assert.equal(card.opacity, '1', 'the card is not showing at home');
    assert.equal(card.label, 'Listening now');
    assert.equal(card.title, 'Nights');
    assert.equal(card.artist, 'Frank Ocean');
    assert.equal(card.titleScrolls, false, 'a name that fits was set scrolling');
    assert.equal(card.playing, true, 'the bars are not moving for a track playing now');
    assert.equal(card.art, true, 'the album art is not showing');
    assert.ok(Math.abs(card.left - 16) <= 1 && Math.abs(card.bottom - (card.innerHeight - 16)) <= 1,
      'the card is not in the bottom-left corner');
    /* the menu's white glass */
    const [red, green, blue] = card.fill.match(/[\d.]+/g).map(Number);
    assert.ok(Math.min(red, green, blue) > 240, `the card is not on the white glass: ${card.fill}`);

    await open(cdp, 'work');
    card = await evaluate(cdp, listening);
    assert.equal(card.visibility, 'hidden', 'the card stayed up in a section');

    lastfm = { status: 200, body: LAST_PLAYED };
    await load(cdp, 1440, 900);
    await sleep(SETTLE);
    card = await evaluate(cdp, listening);
    assert.equal(card.label, 'Last played 5m ago');
    assert.equal(card.playing, false, 'the bars move for a track that is over');

    lastfm = { status: 200, body: recentTrack({ image: [{ size: 'large', '#text': 'https://lastfm.freetls.fastly.net/i/u/174s/2a96cbd8b46e442fc41c2b86b821562f.png' }] }) };
    await load(cdp, 1440, 900);
    await sleep(SETTLE);
    card = await evaluate(cdp, listening);
    assert.equal(card.art, false, 'Last.fm\'s blank star was shown as album art');

    /* an address that turns out to be nothing leaves the note, not a
       broken-image mark */
    lastfm = { status: 200, body: recentTrack({ image: [{ size: 'large', '#text': `http://127.0.0.1:${HTTP_PORT}/images/not-there.png` }] }) };
    await load(cdp, 1440, 900);
    await sleep(SETTLE);
    card = await evaluate(cdp, listening);
    assert.equal(card.hidden, false, 'a missing picture kept the whole card down');
    assert.equal(card.art, false, 'art that failed to load was shown anyway');

    /* the longest line cannot push it off a phone */
    lastfm = { status: 200, body: recentTrack({ name: 'A title long enough to run the whole width of a phone and then some more', '@attr': { nowplaying: 'true' } }) };
    await load(cdp, 375, 667, true);
    await sleep(SETTLE);
    card = await evaluate(cdp, listening);
    assert.ok(card.right <= card.innerWidth - 15, `the card runs off the phone: ends ${card.right} of ${card.innerWidth}`);
    /* and a name too long for its line scrolls rather than being cut off,
       read out once, while the short artist beside it stays still */
    assert.equal(card.titleScrolls, true, 'the long name was cut off rather than scrolled');
    assert.equal(card.moving, true, 'the long name is not moving');
    assert.equal(card.title, 'A title long enough to run the whole width of a phone and then some more');
    assert.equal(card.echoHidden, true, 'the marquee\'s second copy is read out as well');
    assert.ok(card.seam < 0.05, `the loop comes round ${card.seam}px off, a visible jump`);
    assert.equal(card.steady, true, 'the name does not move at one steady pace');
    assert.equal(card.artistScrolls, false, 'the artist scrolls though it fits');

    lastfm = { status: 500, body: {} };
    await load(cdp, 1440, 900);
    await sleep(SETTLE);
    card = await evaluate(cdp, listening);
    assert.equal(card.hidden, true, 'the card came up with nothing to say');
    lastfm = { status: 200, body: NOW_PLAYING };
  });

  /* The black card beside it: the four newest pictures in the Are.na channel,
     newest first, links and text skipped, in the bottom-right corner, above
     the listening card on a phone, gone in a section, following a new
     picture without a reload, and not there at all if Are.na is down. */
  const inspo = `(() => {
    const card = document.getElementById('inspo');
    const style = getComputedStyle(card);
    const box = card.getBoundingClientRect();
    const chip = document.getElementById('listening').getBoundingClientRect();
    return {
      hidden: card.hidden,
      visibility: style.visibility,
      fill: style.backgroundColor,
      thumbs: [...card.querySelectorAll('.inspo-thumb img')].map((img) => (img.getAttribute('src') || '').split('/').pop()),
      href: card.getAttribute('href'),
      target: card.getAttribute('target'),
      left: box.left,
      right: box.right,
      top: box.top,
      bottom: box.bottom,
      chipTop: chip.top,
      chipRight: chip.right,
      width: innerWidth,
      height: innerHeight,
    };
  })()`;

  await t.test('home shows the newest from Are.na', async () => {
    arena = { status: 200, body: ARENA };
    lastfm = { status: 200, body: NOW_PLAYING };
    await load(cdp, 1440, 900);
    await sleep(SETTLE);
    let card = await evaluate(cdp, inspo);
    assert.equal(card.hidden, false, 'the card did not come up with pictures');
    assert.deepEqual(
      card.thumbs,
      ['sidq-switch-ai.webp', 'sidq-your-context.webp', 'sidq-stop-explaining.webp', 'vantage.webp'],
      'not the four newest pictures, newest first, with the link and the text skipped',
    );
    assert.equal(card.fill, 'rgb(0, 0, 0)', 'the card is not pure black');
    assert.equal(card.href, 'https://www.are.na/dante-smith/inspo-syd5sijpqmk');
    assert.equal(card.target, '_blank');
    assert.ok(Math.abs(card.right - (card.width - 16)) <= 1 && Math.abs(card.bottom - (card.height - 16)) <= 1,
      'the card is not in the bottom-right corner');
    assert.ok(card.left >= card.chipRight + 8, 'the card runs into the listening card');

    await open(cdp, 'work');
    assert.equal((await evaluate(cdp, inspo)).visibility, 'hidden', 'the card stayed up in a section');

    /* a new picture, picked up on coming back home and to the window */
    arena = { status: 200, body: ARENA_NEXT };
    await evaluate(cdp, `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
    await evaluate(cdp, `window.dispatchEvent(new Event('focus'))`);
    await sleep(1000);
    card = await evaluate(cdp, inspo);
    assert.deepEqual(
      card.thumbs,
      ['wsu-ai-lab-poster.webp', 'sidq-switch-ai.webp', 'sidq-your-context.webp', 'sidq-stop-explaining.webp'],
      'the card did not follow a new picture without a reload',
    );

    /* on a phone the two cards stack, the black one on top, both on screen */
    arena = { status: 200, body: ARENA };
    await load(cdp, 375, 667, true);
    await sleep(SETTLE);
    card = await evaluate(cdp, inspo);
    assert.ok(card.bottom <= card.chipTop - 4, `the cards overlap on a phone: black ends ${card.bottom}, listening starts ${card.chipTop}`);
    assert.ok(card.left >= 15 && card.right <= card.width - 15, 'the card runs off the phone');

    arena = { status: 500, body: {} };
    await load(cdp, 1440, 900);
    await sleep(SETTLE);
    assert.equal((await evaluate(cdp, inspo)).hidden, true, 'the card came up with nothing to show');
    arena = { status: 200, body: ARENA };
  });

  /* The card follows the music without a reload: the next scheduled check
     picks up a new track, a request that never answers does not stop it,
     and coming back to the window checks straight away. The page's long
     timers — the poll, and how long a request is given — are cut to a fifth
     of a second for this, so they come round within the test. */
  await t.test('the card follows a new track without a reload', async () => {
    const { identifier } = await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `(() => {
        const wait = window.setTimeout;
        window.setTimeout = (fn, ms, ...rest) => wait(fn, ms >= 5000 ? 200 : ms, ...rest);
      })()`,
    });
    try {
      lastfm = { status: 200, body: NOW_PLAYING };
      await load(cdp, 1440, 900);
      await sleep(SETTLE);
      assert.equal((await evaluate(cdp, listening)).title, 'Nights');

      lastfm = { status: 200, body: recentTrack({ name: 'Ivy', '@attr': { nowplaying: 'true' } }) };
      await sleep(1200);
      assert.equal((await evaluate(cdp, listening)).title, 'Ivy', 'the scheduled check did not pick up the new track');

      /* Last.fm stops answering for a while, then answers with a new song:
         the card has to pick it up without anyone reloading */
      lastfm = { hang: true };
      await sleep(700);
      lastfm = { status: 200, body: recentTrack({ name: 'Solo', '@attr': { nowplaying: 'true' } }) };
      await sleep(1500);
      assert.equal((await evaluate(cdp, listening)).title, 'Solo', 'a request that never answered stopped the card following the music');

      /* with the timers back to their real length, focus alone has to do it */
      await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier });
      await load(cdp, 1440, 900);
      await sleep(SETTLE);
      lastfm = { status: 200, body: recentTrack({ name: 'Pink + White', '@attr': { nowplaying: 'true' } }) };
      await evaluate(cdp, `window.dispatchEvent(new Event('focus'))`);
      /* partway through, the old track is fading out rather than swapped */
      await sleep(150);
      const midway = await evaluate(cdp, `(() => {
        const card = document.getElementById('listening');
        return { changing: card.classList.contains('is-changing'), opacity: Number(getComputedStyle(card.querySelector('.listening-text')).opacity) };
      })()`);
      assert.equal(midway.changing, true, 'a new track was swapped in rather than morphed');
      assert.ok(midway.opacity < 1, 'the old track did not fade on its way out');
      await sleep(800);
      assert.equal((await evaluate(cdp, listening)).title, 'Pink + White', 'coming back to the window did not check again');
      const settled = await evaluate(cdp, `(() => {
        const card = document.getElementById('listening');
        return { changing: card.classList.contains('is-changing'), width: card.style.width };
      })()`);
      assert.deepEqual(settled, { changing: false, width: '' }, 'the card did not settle after the morph');
    } finally {
      await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier }).catch(() => {});
      lastfm = { status: 200, body: NOW_PLAYING };
    }
  });

  /* Every project a card, every picture at its own file's ratio and big enough
     to read, none off the side and none taller than the box it scrolls in, so
     each can be seen whole between the mark and the menu. The words sit beside
     the pictures on a wide window and under them on a narrow one. */
  await t.test('the work reads at every size', async () => {
    for (const [width, height, phone] of [
      [1728, 1117, false],
      [1440, 900, false],
      [1280, 720, false],
      [1025, 700, false],
      [1024, 600, false],
      [700, 800, false],
      [390, 844, true],
      [375, 667, true],
    ]) {
      await load(cdp, width, height, phone);
      await open(cdp, 'work');
      const m = await metrics(cdp, 'work');
      const at = `${width}x${height}`;

      /* Sidq, the Vantage and Weave card, the shirt, the poster */
      assert.equal(m.cards.length, 4, `${at} did not render every card`);
      assert.equal(m.cards.flatMap((card) => card.pictures).length, 6, `${at} did not show every picture`);
      assert.ok(m.documentWidth <= m.viewportWidth + 1, `${at} scrolls sideways`);
      await assertClearOfChrome(cdp, 'work', m, at);

      /* Above a phone the campaign leads, every other piece is under its
         flyers' height, and the shirt and the poster share a row at one
         height. */
      if (width > 640) {
        const [lead, ...rest] = m.cards;
        const leadHeight = Math.min(...lead.pictures.map((picture) => picture.height));
        for (const picture of rest.flatMap((card) => card.pictures)) {
          assert.ok(
            picture.height < leadHeight,
            `${at} ${picture.src} at ${Math.round(picture.height)}px is not under the campaign's ${Math.round(leadHeight)}px`,
          );
        }
        const rows = [...new Set(m.cards.map((card) => card.row))].filter((row) => row >= 0);
        assert.equal(rows.length, 1, `${at} did not set the shirt and the poster in a row`);
        for (const row of rows) {
          const [first, second] = m.cards.filter((card) => card.row === row);
          assert.ok(
            Math.abs(first.card.top - second.card.top) <= 1 && second.card.left >= first.card.right,
            `${at} shared row ${row} is not one row`,
          );
          assert.ok(
            Math.abs(first.pictures[0].height - second.pictures[0].height) <= 2,
            `${at} shared row ${row} sits at ${Math.round(first.pictures[0].height)} and ${Math.round(second.pictures[0].height)}px`,
          );
        }
      }

      /* The switching card is fitted: the picture's column is only as wide as
         the covers, the words sit right against it (or right under it), the
         grey card is only as wide as the two plus its padding, and it sits in
         the middle of the column. */
      const switching = m.cards.find((card) => card.switching);
      assert.ok(switching, `${at} has no switching card`);
      {
        const { card, media, text } = switching;
        const padding = width > 1024 ? 16 : 12;
        const contentRight = Math.max(media.right, text.right);
        assert.ok(
          media.left - card.left <= padding + 1 && card.right - contentRight <= padding + 1,
          `${at} the switching card runs ${Math.round(media.left - card.left)} and ${Math.round(card.right - contentRight)}px past what it holds`,
        );
        const before = card.left - m.projects.left;
        const after = m.projects.right - card.right;
        assert.ok(Math.abs(before - after) <= 2, `${at} the switching card is off centre: ${Math.round(before)} against ${Math.round(after)}`);
        if (width > 1024) {
          assert.ok(text.left - media.right <= 29, `${at} the words sit ${Math.round(text.left - media.right)}px off the picture's column`);
        } else {
          assert.ok(Math.abs(text.left - media.left) <= 1, `${at} the words do not line up under the picture's column`);
        }
      }

      /* the phone floor is where a flyer's headline is still a headline */
      const floor = width <= 640 ? 300 : 180;
      for (const card of m.cards) {
        assert.ok(card.named, `${at} left a project without a name`);
        /* Every card keeps Sidq's spacing: the words start the grid's 1.75rem
           past the picture's right edge, or right under its left edge. */
        const name = card.pictures[0].src;
        const rightmost = Math.max(...card.pictures.map((picture) => picture.right));
        const leftmost = Math.min(...card.pictures.map((picture) => picture.left));
        if (width > 1024) {
          assert.ok(card.text.left >= card.media.right - 1, `${at} did not set the words beside the pictures`);
          assert.ok(
            Math.abs(card.text.left - rightmost - 28) <= 1,
            `${at} ${name}: the words sit ${Math.round(card.text.left - rightmost)}px from the picture, not 28`,
          );
        } else {
          assert.ok(card.text.top >= card.media.bottom - 1, `${at} did not set the words under the pictures`);
          assert.ok(
            Math.abs(card.text.left - leftmost) <= 1,
            `${at} ${name}: the words start ${Math.round(card.text.left - leftmost)}px off the picture's left edge`,
          );
        }
        for (const picture of card.pictures) {
          const drawn = picture.width / picture.height;
          assert.ok(
            Math.abs(drawn / picture.ratio - 1) < 0.015,
            `${at} ${picture.src} drawn at ${drawn.toFixed(3)}, the file is ${picture.ratio.toFixed(3)}`,
          );
          assert.ok(picture.width >= floor, `${at} ${picture.src} is ${Math.round(picture.width)}px wide`);
          assert.ok(
            picture.left >= card.card.left - 1 && picture.right <= card.card.right + 1,
            `${at} ${picture.src} spills out of its card`,
          );
          const band = m.viewportHeight - Math.max(m.mark.bottom, m.menu.bottom);
          assert.ok(
            picture.height <= band,
            `${at} ${picture.src} is ${Math.round(picture.height)}px tall under a header that leaves ${Math.round(band)}px`,
          );
        }
      }
    }
  });

  /* The text sections scroll whenever the window is short, and they scroll
     under the chrome, so theirs is the content that has to clear it. */
  await t.test('the text sections rest and end clear of the chrome', async () => {
    for (const [width, height, phone] of [[1440, 900, false], [375, 667, true]]) {
      for (const view of ['about', 'contact']) {
        await load(cdp, width, height, phone);
        await open(cdp, view);
        const m = await metrics(cdp, view);
        const at = `${width}x${height}`;
        assert.ok(m.documentWidth <= m.viewportWidth + 1, `${at} ${view} scrolls sideways`);
        await assertClearOfChrome(cdp, view, m, at);
      }
    }
  });

  /* The menu sits on glass throughout, so it reads over whatever scrolls
     under it. The mark floats bare, and takes glass only while something is
     under it: it is the name, not a panel. */
  await t.test('the menu sits on glass and the mark takes it only when needed', async () => {
    const chrome = `(() => {
      const look = (el) => {
        const style = getComputedStyle(el);
        return { blur: style.backdropFilter.includes('blur'), fill: style.backgroundColor };
      };
      return { mark: look(document.getElementById('home')), menu: look(document.querySelector('.menu')) };
    })()`;
    await load(cdp, 1440, 900);
    const home = await evaluate(cdp, chrome);
    assert.equal(home.mark.blur, false, 'the mark is on glass at home');
    assert.equal(home.mark.fill, 'rgba(0, 0, 0, 0)', 'the mark has a card at home');
    assert.equal(home.menu.blur, true, 'the menu is not on glass');
    await open(cdp, 'work');
    const away = await evaluate(cdp, chrome);
    assert.equal(away.mark.blur, false, 'the mark is on glass in a section');
    assert.equal(away.mark.fill, 'rgba(0, 0, 0, 0)', 'the mark has a card in a section');
    assert.equal(away.menu.blur, true, 'the menu lost its glass in a section');

    /* The mark's glass is its own layer, and only up while content is
       actually under the letters — not merely because the section has
       scrolled. It comes and goes without the letters moving. */
    const glass = `(() => {
      const mark = document.getElementById('home');
      const layer = getComputedStyle(mark, '::before');
      const glyph = mark.querySelector('.glyph').getBoundingClientRect();
      return { opacity: layer.opacity, blur: layer.backdropFilter.includes('blur'), at: [glyph.left, glyph.top] };
    })()`;
    assert.equal((await evaluate(cdp, glass)).opacity, '0', 'the mark has glass with nothing under it');

    /* At 1440 the work's column sits in from the corner, so however far it
       scrolls only white passes the letters, and the mark stays bare. */
    await evaluate(cdp, `document.getElementById('work').scrollTop = 300`);
    await sleep(450);
    assert.equal((await evaluate(cdp, glass)).opacity, '0', 'the mark took glass with only white under it');

    /* At 1024 the cards run out to the gutter and do pass under it. */
    await load(cdp, 1024, 768);
    await open(cdp, 'work');
    const rest = await evaluate(cdp, glass);
    assert.equal(rest.opacity, '0', 'the mark has glass before anything reaches it');
    await evaluate(cdp, `document.getElementById('work').scrollTop = 300`);
    await sleep(450);
    const under = await evaluate(cdp, glass);
    assert.equal(under.opacity, '1', 'the mark took no glass with the work under it');
    assert.equal(under.blur, true, 'the mark\'s glass does not blur what is under it');
    assert.deepEqual(under.at, rest.at, 'the letters moved when the glass came up');
    await evaluate(cdp, `document.getElementById('work').scrollTop = 0`);
    await sleep(450);
    assert.equal((await evaluate(cdp, glass)).opacity, '0', 'the glass stayed once the work scrolled back');
    await evaluate(cdp, `document.getElementById('work').scrollTop = 300`);
    await sleep(100);
    await evaluate(cdp, `document.getElementById('home').click()`);
    await sleep(450);
    assert.equal((await evaluate(cdp, glass)).opacity, '0', 'the glass came home with the mark');
  });

  /* The menu is a row of glass across the top: in the top-right corner,
     level with the mark, clear of it at every width down to a 360 phone,
     and never broken onto a second line. */
  await t.test('the menu is a row across the top, beside the mark', async () => {
    for (const [width, height, phone] of [
      [1440, 900, false],
      [1024, 768, false],
      [390, 844, true],
      [375, 667, true],
      [360, 740, true],
    ]) {
      await load(cdp, width, height, phone);
      await open(cdp, 'about');
      const h = await evaluate(cdp, `(() => {
        const box = (el) => { const b = el.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, left: b.left, right: b.right }; };
        return {
          menu: box(document.querySelector('.menu')),
          mark: box(document.querySelector('.monogram')),
          tops: [...document.querySelectorAll('.menu-item')].map((item) => Math.round(item.getBoundingClientRect().top)),
          width: innerWidth,
        };
      })()`);
      const at = `${width}x${height}`;
      assert.equal(new Set(h.tops).size, 1, `${at} the menu is not one row: ${h.tops}`);
      assert.ok(Math.abs(h.menu.right - (h.width - 16)) <= 1, `${at} the menu is not in the top-right corner`);
      const level = (h.menu.top + h.menu.bottom) / 2 - (h.mark.top + h.mark.bottom) / 2;
      assert.ok(Math.abs(level) <= 2, `${at} the menu sits ${level.toFixed(1)}px off the mark's centre line`);
      assert.ok(h.menu.left >= h.mark.right + 8, `${at} the menu runs into the mark: starts ${h.menu.left}, mark ends ${h.mark.right}`);
    }
  });

  /* The menu brings a section up and marks it, the mark comes home, and so
     does Escape. The mark is disabled at home, where it has nowhere to go. */
  await t.test('the menu, the mark and Escape move between the sections', async () => {
    const state = `(() => ({
      view: document.body.dataset.view,
      on: [...document.querySelectorAll('.view.is-on')].map((view) => view.id),
      current: [...document.querySelectorAll('.menu-item[aria-current="true"]')].map((item) => item.dataset.view),
      homeDisabled: document.getElementById('home').disabled,
    }))()`;
    const home = { view: 'home', on: [], current: [], homeDisabled: true };

    await load(cdp, 1440, 900);
    assert.deepEqual(await evaluate(cdp, state), home, 'the page did not open at home');

    for (const view of ['about', 'work', 'contact']) {
      await evaluate(cdp, `document.querySelector('.menu-item[data-view="${view}"]').click()`);
      assert.deepEqual(
        await evaluate(cdp, state),
        { view, on: [view], current: [view], homeDisabled: false },
        `the menu did not bring up ${view}`,
      );
    }

    await evaluate(cdp, `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
    assert.deepEqual(await evaluate(cdp, state), home, 'Escape did not come home');

    await evaluate(cdp, `document.querySelector('.menu-item[data-view="about"]').click()`);
    await evaluate(cdp, `document.getElementById('home').click()`);
    assert.deepEqual(await evaluate(cdp, state), home, 'the mark did not come home');
  });

  /* Vantage and Weave share a card and a switch. The switch is a tab list: the
     chosen tab is its one stop, the arrow keys move between the two and show
     as they go, and the demo link is there, once, only while Weave is. */
  await t.test('the switch trades Vantage for Weave', async () => {
    await load(cdp, 1440, 900);
    await open(cdp, 'work');
    const state = `(() => ({
      selected: [...document.querySelectorAll('.switch [role="tab"]')]
        .filter((tab) => tab.getAttribute('aria-selected') === 'true')
        .map((tab) => tab.textContent.trim()),
      shown: [...document.querySelectorAll('.project-panel')]
        .filter((panel) => getComputedStyle(panel).visibility === 'visible')
        .map((panel) => panel.id),
      focus: document.activeElement.textContent.trim(),
      height: document.querySelector('.project--switch').getBoundingClientRect().height,
      /* how far the sliding white is from the chosen name, edge and width */
      thumbOff: (() => {
        const thumb = document.querySelector('.switch-thumb').getBoundingClientRect();
        const tab = document.querySelector('.switch [aria-selected="true"]').getBoundingClientRect();
        return Math.abs(thumb.left - tab.left) + Math.abs(thumb.width - tab.width);
      })(),
    }))()`;
    /* the panel switched away keeps its visibility for the length of the fade */
    const FADE = 400;
    /* one lap from the mark: the chosen tab, anything in the card, the menu */
    const links = async () => {
      await evaluate(cdp, `document.getElementById('home').focus()`);
      const hrefs = [];
      for (let i = 0; i < 6; i++) {
        await pressTab(cdp);
        const href = await evaluate(cdp, `document.activeElement.closest('#work') ? document.activeElement.getAttribute('href') : null`);
        if (href) hrefs.push(href);
      }
      return hrefs;
    };

    let now = await evaluate(cdp, state);
    const height = now.height;
    assert.deepEqual(now.selected, ['Vantage'], 'the card did not open on Vantage');
    assert.deepEqual(now.shown, ['work-panel-vantage'], 'the card did not show Vantage alone');
    assert.deepEqual(await links(), [], 'the demo link was reachable with Weave hidden');

    await evaluate(cdp, `document.getElementById('work-tab-vantage').focus()`);
    await pressKey(cdp, 'ArrowRight', 39);
    await sleep(FADE);
    now = await evaluate(cdp, state);
    assert.deepEqual(now.selected, ['Weave'], 'the arrow key did not choose Weave');
    assert.deepEqual(now.shown, ['work-panel-weave'], 'choosing Weave did not show Weave alone');
    assert.equal(now.focus, 'Weave', 'the focus did not follow the arrow');
    assert.equal(now.height, height, 'the card changed height on the switch, moving everything under it');
    assert.ok(now.thumbOff <= 1, `the white did not settle under Weave: ${now.thumbOff}px out`);
    assert.deepEqual(await links(), ['https://weave2-demo.vercel.app/'], 'the demo link was not exactly one stop');

    await evaluate(cdp, `document.getElementById('work-tab-vantage').click()`);
    await sleep(FADE);
    now = await evaluate(cdp, state);
    assert.deepEqual(now.selected, ['Vantage'], 'clicking did not choose Vantage again');
    assert.deepEqual(now.shown, ['work-panel-vantage'], 'clicking did not show Vantage again');
  });

  /* Either way the button lands, the live region says so in plain words. */
  await t.test('the copy button says what happened', async () => {
    await load(cdp, 1440, 900);
    await open(cdp, 'contact');
    await evaluate(cdp, `document.querySelector('.copy').click()`);
    await sleep(200);
    const said = await evaluate(cdp, `document.querySelector('.sr-only[role="status"]').textContent`);
    assert.match(said, /^(Email address copied|Could not copy\. The address is \S+@\S+)$/);
  });
});
