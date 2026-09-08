import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const HTTP_PORT = 4174;
const DEBUG_PORT = 9223;

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

async function waitFor(url, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

class Cdp {
  #id = 0;
  #pending = new Map();
  #socket;

  constructor(url) {
    this.#socket = new WebSocket(url);
    this.#socket.addEventListener('message', ({ data }) => {
      const message = JSON.parse(data);
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

  close() {
    this.#socket.close();
  }
}

async function renderedMetrics(cdp, width, height) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${HTTP_PORT}/` });
  await new Promise((resolve) => setTimeout(resolve, 500));
  const { result } = await cdp.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      if (document.fonts?.ready) {
        await Promise.race([
          document.fonts.ready,
          new Promise((resolve) => setTimeout(resolve, 1500)),
        ]);
      }
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      const tiles = [...document.querySelectorAll('.tile')]
        .map((tile) => tile.getBoundingClientRect());
      const bar = document.querySelector('.bar').getBoundingClientRect();
      const about = document.getElementById('about');
      return {
        viewportWidth: innerWidth,
        viewportHeight: innerHeight,
        documentWidth: document.documentElement.scrollWidth,
        tiles: tiles.length,
        /* one x per column: the grid puts every tile in a row at the same
           left edge, so counting the distinct ones counts the columns */
        columns: new Set(tiles.map((tile) => Math.round(tile.x))).size,
        minTileWidth: Math.min(...tiles.map((tile) => tile.width)),
        barHeight: bar.height,
        /* the bar is fixed, so this is the test that the grid starts under it
           rather than behind it */
        firstTileTop: tiles[0].top,
        /* one line, always: three groups that wrapped would double its height */
        barWraps: bar.height > 72,
        aboutHidden: about.hidden,
        aboutDisplay: getComputedStyle(about).display,
      };
    })()`,
  });
  return result.value;
}

/* Runs a sequence of expressions in the page and hands back what the last one
   returned. The behaviour tests below are all "click this, then read that",
   which the metrics helper above cannot express because it reloads. */
async function evaluate(cdp, expression) {
  const { result } = await cdp.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression,
  });
  return result.value;
}

test('the grid, the bar, the theme and the about sheet', async (t) => {
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
  const page = await fetch(
    `http://127.0.0.1:${DEBUG_PORT}/json/new?http://127.0.0.1:${HTTP_PORT}/`,
    { method: 'PUT' },
  ).then((response) => response.json());
  const cdp = new Cdp(page.webSocketDebuggerUrl);
  await cdp.ready();
  t.after(() => cdp.close());
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  /* The grid drops a column rather than narrowing the tiles. Three across is
     the desktop shape, two on a tablet, one on a phone — and at no width may
     the page be wider than the window. */
  for (const [viewport, columns] of [
    [{ width: 1728, height: 1117 }, 3],
    [{ width: 1366, height: 900 }, 3],
    [{ width: 1024, height: 600 }, 3],
    [{ width: 900, height: 800 }, 2],
    [{ width: 700, height: 800 }, 2],
    [{ width: 390, height: 844 }, 1],
  ]) {
    const m = await renderedMetrics(cdp, viewport.width, viewport.height);
    const at = `${viewport.width}x${viewport.height}`;

    assert.equal(m.tiles, 8, `${at} did not render every piece`);
    assert.equal(m.columns, columns, `${at} laid out ${m.columns} columns, wanted ${columns}`);
    assert.ok(
      m.documentWidth <= m.viewportWidth + 1,
      `${at} scrolls sideways: ${JSON.stringify(m)}`,
    );
    /* The bar floats over the grid, so a tile that started at the top of the
       page would be behind it. */
    assert.ok(
      m.firstTileTop >= m.barHeight - 1,
      `${at} put the first tile under the bar: ${JSON.stringify(m)}`,
    );
    assert.ok(!m.barWraps, `${at} wrapped the bar onto a second line`);
    /* Shut, and shut in the way that keeps it out of the tab order. */
    assert.equal(m.aboutHidden, true, `${at} loaded with the about sheet open`);
    assert.equal(m.aboutDisplay, 'none', `${at} left the hidden sheet displayed`);
  }

  /* A tile is a piece of work, not a thumbnail. This is the floor the column
     count exists to protect. */
  const wide = await renderedMetrics(cdp, 1728, 1117);
  assert.ok(wide.minTileWidth >= 400, `wide layout shrank its tiles to ${wide.minTileWidth}`);
  const laptop = await renderedMetrics(cdp, 1024, 600);
  assert.ok(laptop.minTileWidth >= 280, `laptop layout shrank its tiles to ${laptop.minTileWidth}`);

  /* The switch flips the theme, says what it will do next, and is remembered. */
  await renderedMetrics(cdp, 1440, 900);
  const theme = await evaluate(cdp, `(async () => {
    const button = document.getElementById('theme');
    const before = document.documentElement.dataset.theme || 'dark';
    button.click();
    const after = document.documentElement.dataset.theme || 'dark';
    const stored = localStorage.getItem('theme');
    const label = button.getAttribute('aria-label');
    button.click();
    return { before, after, stored, label, back: document.documentElement.dataset.theme || 'dark' };
  })()`);
  assert.equal(theme.before, 'dark', 'the page did not start dark');
  assert.equal(theme.after, 'light', 'the switch did not reach the light theme');
  assert.equal(theme.stored, 'light', 'the choice was not remembered');
  assert.match(theme.label, /dark/i, 'the switch did not name what it would do next');
  assert.equal(theme.back, 'dark', 'the switch did not come back');

  /* The sheet opens, takes the focus, holds the page still under it, and
     Escape puts everything back. */
  const about = await evaluate(cdp, `(async () => {
    const panel = document.getElementById('about');
    const open = document.getElementById('about-open');
    open.click();
    const opened = {
      hidden: panel.hidden,
      expanded: open.getAttribute('aria-expanded'),
      focus: document.activeElement.id,
      bodyOverflow: document.body.style.overflow,
      hasContact: !!panel.querySelector('.deposit-go'),
    };
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    return { opened, closed: {
      hidden: panel.hidden,
      expanded: open.getAttribute('aria-expanded'),
      focus: document.activeElement.id,
      bodyOverflow: document.body.style.overflow,
    } };
  })()`);
  assert.equal(about.opened.hidden, false, 'the about control did not open the sheet');
  assert.equal(about.opened.expanded, 'true', 'the about control did not say it was open');
  assert.equal(about.opened.focus, 'about-close', 'opening the sheet did not move the focus into it');
  assert.equal(about.opened.bodyOverflow, 'hidden', 'the page still scrolled behind the sheet');
  assert.equal(about.opened.hasContact, true, 'the sheet does not carry the contact details');
  assert.equal(about.closed.hidden, true, 'Escape did not close the sheet');
  assert.equal(about.closed.expanded, 'false', 'the control still says it is open');
  assert.equal(about.closed.focus, 'about-open', 'closing the sheet stranded the focus');
  assert.equal(about.closed.bodyOverflow, '', 'the page was left unable to scroll');
});
