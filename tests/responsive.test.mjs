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
      const cards = [...document.querySelectorAll('.work-card')]
        .map((card) => card.getBoundingClientRect());
      return {
        viewportWidth: innerWidth,
        viewportHeight: innerHeight,
        documentHeight: document.documentElement.scrollHeight,
        bodyHeight: document.body.scrollHeight,
        bodyOverflow: getComputedStyle(document.body).overflow,
        isOverflowing: document.body.classList.contains('is-overflowing'),
        minCardWidth: Math.min(...cards.map((card) => card.width)),
        maxCardBottom: Math.max(...cards.map((card) => card.bottom)),
        footerBottom: document.querySelector('.footer').getBoundingClientRect().bottom,
      };
    })()`,
  });
  return result.value;
}

test('responsive viewport contract keeps scrolling exclusive to phones', async (t) => {
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

  for (const viewport of [
    { width: 1024, height: 600 },
    { width: 1280, height: 650 },
    { width: 1366, height: 650 },
  ]) {
    const metrics = await renderedMetrics(cdp, viewport.width, viewport.height);
    assert.ok(
      metrics.documentHeight <= metrics.viewportHeight + 1,
      `${viewport.width}x${viewport.height} scrolls: ${JSON.stringify(metrics)}`,
    );
    assert.equal(
      metrics.isOverflowing,
      false,
      `${viewport.width}x${viewport.height} activated the overflow fallback`,
    );
    assert.ok(
      metrics.minCardWidth >= 160,
      `${viewport.width}x${viewport.height} cards are too narrow: ${JSON.stringify(metrics)}`,
    );
    assert.ok(
      metrics.footerBottom <= metrics.viewportHeight + 1,
      `${viewport.width}x${viewport.height} footer leaves the viewport`,
    );
  }

  const large = await renderedMetrics(cdp, 1728, 1117);
  assert.ok(large.documentHeight <= large.viewportHeight + 1, 'large layout scrolls');
  assert.ok(large.minCardWidth >= 250, 'large layout lost its spacious card sizing');

  const phone = await renderedMetrics(cdp, 390, 844);
  assert.ok(phone.documentHeight > phone.viewportHeight + 1, 'phone layout should scroll');
  assert.equal(phone.bodyOverflow, 'visible', 'phone layout should expose page overflow');
});
