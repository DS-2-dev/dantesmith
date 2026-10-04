/* Everything the page does. Loaded as a module, so this file has its own scope
   and needs no wrapper — nothing here reaches the global object.

   The previous script is on the makeover branch: the game, the pointer-following
   panels and the name cards all live there and can be brought across one block
   at a time. This file is what the page needs today; who stands in the corner
   of home, and what they say, is in cast.js. */
import { CAST } from './cast.js';


/* The views.

   One page, no routes: the sections are all in the document and a data-view on
   <body> says which one is up. The stylesheet does the rest — it is what moves
   the name, fades the section in and marks the menu — so nothing here touches
   a style, only the one attribute everything else reads.

   The name is the way back. It is disabled at home, which keeps it out of the
   tab order as well as out of reach: a heading that is only sometimes a
   control has to say which it is at the time. */
(function () {
  const body = document.body;
  const home = document.getElementById('home');
  const items = Array.from(document.querySelectorAll('.menu-item[data-view]'));
  const views = Array.from(document.querySelectorAll('.view'));
  if (!home || !items.length) return;

  function go(view) {
    body.dataset.view = view;
    home.disabled = view === 'home';
    /* The stylesheet knows which section is up from this class, not from its
       id, so adding a view is markup and a menu item and nothing else. */
    views.forEach((section) => section.classList.toggle('is-on', section.id === view));
    items.forEach((item) => {
      /* "true" and removed, not "true" and "false": aria-current="false" is
         still an announced state on some readers, and the honest answer for
         a section you are not in is that the attribute is not there. */
      if (item.dataset.view === view) item.setAttribute('aria-current', 'true');
      else item.removeAttribute('aria-current');
    });
    /* Coming out of a section leaves the page scrolled where that section
       ended, and home is one screen with nothing below it. */
    if (view === 'home') window.scrollTo({ top: 0, behavior: 'auto' });
  }

  items.forEach((item) => {
    item.addEventListener('click', () => go(item.dataset.view));
  });
  home.addEventListener('click', () => go('home'));
  /* the same way out as every other layer on this page */
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && body.dataset.view !== 'home') go('home');
  });
})();


/* The mark, bent by the pointer.

   At home the initials are the page, and a pointer near them presses into the
   lettering: the outline swells away from it, trails it a little as it moves,
   and springs back once it goes. No colour, only shape.

   Each trace's outline is cut into short cubic pieces once, on load, so a long
   straight edge of the D can curve rather than only tip at its two ends. Every
   frame, each point of those pieces is pushed out from the pointer by

     (p − c) · s · e^(−|p − c|² / 2σ²)

   which is smooth everywhere, nothing at the pointer itself, and most at σ
   out. Under s ≈ 2.2 it never folds an edge over its neighbour, so the letters
   bulge and bend but never tear or cross. The dots ride the same field.

   Only at home, only with a mouse, and never with motion turned down. When
   the pointer is well clear the outline goes back to the trace exactly, and
   nothing runs. */
(function () {
  const body = document.body;
  const mark = document.getElementById('home');
  if (!mark) return;
  const glyphs = Array.from(mark.querySelectorAll('.glyph path'));
  const dots = Array.from(mark.querySelectorAll('.dot'));
  if (!glyphs.length) return;
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
  const still = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* how hard, and how far out, as fractions of the letters' height */
  const STRENGTH = 0.85;
  const REACH = 0.3;
  /* the longest piece an outline is cut into, in the trace's own units: about
     six pixels at the largest the mark is drawn */
  const STEP = 240;
  /* the pointer's lag, a little under critically damped so it wobbles once;
     and how fast the bend comes and goes */
  const FOLLOW = { stiffness: 180, damping: 19 };
  const FADE = { stiffness: 110, damping: 21 };

  /* A trace's outline as subpaths of cubics: each subpath one flat list,
     its start point and then three points for every piece. Potrace writes
     only M, m, l, c and z. A line becomes a cubic with its handles on it. */
  function outline(d) {
    const tokens = d.match(/[a-z]|[-+]?(?:\d+\.?\d*|\.\d+)/gi);
    const subpaths = [];
    let points = null;
    let x = 0, y = 0, sx = 0, sy = 0;
    let command = '';
    let i = 0;
    const num = () => parseFloat(tokens[i++]);
    const piece = (x1, y1, x2, y2, x3, y3) => {
      cut(points, x, y, x1, y1, x2, y2, x3, y3);
      x = x3; y = y3;
    };
    const line = (x3, y3) => piece(x + (x3 - x) / 3, y + (y3 - y) / 3, x + (x3 - x) * 2 / 3, y + (y3 - y) * 2 / 3, x3, y3);

    while (i < tokens.length) {
      if (/[a-z]/i.test(tokens[i])) command = tokens[i++];
      const relative = command === command.toLowerCase();
      const ox = relative ? x : 0;
      const oy = relative ? y : 0;
      switch (command.toLowerCase()) {
        case 'm':
          x = sx = ox + num();
          y = sy = oy + num();
          points = [x, y];
          subpaths.push(points);
          /* pairs after a move are lines */
          command = relative ? 'l' : 'L';
          break;
        case 'l':
          line(ox + num(), oy + num());
          break;
        case 'c':
          piece(ox + num(), oy + num(), ox + num(), oy + num(), ox + num(), oy + num());
          break;
        case 'z':
          if (x !== sx || y !== sy) line(sx, sy);
          x = sx; y = sy;
          command = '';
          break;
        default:
          return null;
      }
    }
    return subpaths.map((list) => Float64Array.from(list));
  }

  /* Adds a cubic to a subpath in as many equal-parameter pieces as its length
     needs, each split off the front by de Casteljau. */
  function cut(points, x0, y0, x1, y1, x2, y2, x3, y3) {
    const length = Math.hypot(x1 - x0, y1 - y0) + Math.hypot(x2 - x1, y2 - y1) + Math.hypot(x3 - x2, y3 - y2);
    for (let n = Math.max(1, Math.ceil(length / STEP)); n > 1; n--) {
      const t = 1 / n;
      const ax = x0 + (x1 - x0) * t, ay = y0 + (y1 - y0) * t;
      const bx = x1 + (x2 - x1) * t, by = y1 + (y2 - y1) * t;
      const cx = x2 + (x3 - x2) * t, cy = y2 + (y3 - y2) * t;
      const dx = ax + (bx - ax) * t, dy = ay + (by - ay) * t;
      const ex = bx + (cx - bx) * t, ey = by + (cy - by) * t;
      const fx = dx + (ex - dx) * t, fy = dy + (ey - dy) * t;
      points.push(ax, ay, dx, dy, fx, fy);
      x0 = fx; y0 = fy; x1 = ex; y1 = ey; x2 = cx; y2 = cy;
    }
    points.push(x1, y1, x2, y2, x3, y3);
  }

  const traces = glyphs.map((path) => {
    const d = path.getAttribute('d');
    return { path, d, subpaths: outline(d) };
  }).filter((trace) => trace.subpaths);

  /* the pointer, and the lagging point the field is centred on */
  const pointer = { x: 0, y: 0, near: false };
  const centre = { x: 0, y: 0, vx: 0, vy: 0 };
  const bend = { value: 0, velocity: 0 };
  let frame = 0;
  let last = 0;
  let bent = false;

  function allowed() {
    return body.dataset.view === 'home' && fine.matches && !still.matches;
  }

  function warp(trace, cx, cy, sigma, s) {
    /* past four σ the push is under a thousandth of the distance */
    const far = 16 * sigma * sigma;
    const fall = 1 / (2 * sigma * sigma);
    let d = '';
    for (const list of trace.subpaths) {
      for (let k = 0; k < list.length; k += 2) {
        let x = list[k];
        let y = list[k + 1];
        const dx = x - cx;
        const dy = y - cy;
        const r2 = dx * dx + dy * dy;
        if (r2 < far) {
          const push = s * Math.exp(-r2 * fall);
          x += dx * push;
          y += dy * push;
        }
        d += (k === 0 ? 'M' : k % 6 === 2 ? 'C' : ' ') + x.toFixed(1) + ' ' + y.toFixed(1);
      }
      d += 'Z';
    }
    trace.path.setAttribute('d', d);
  }

  function rest() {
    traces.forEach((trace) => trace.path.setAttribute('d', trace.d));
    dots.forEach((dot) => { dot.style.translate = ''; });
    bent = false;
  }

  function draw() {
    const s = STRENGTH * bend.value;
    const height = mark.getBoundingClientRect().height;
    const sigmaPx = REACH * height;
    traces.forEach((trace) => {
      const ctm = trace.path.getScreenCTM();
      if (!ctm) return;
      const inverse = ctm.inverse();
      const cx = inverse.a * centre.x + inverse.c * centre.y + inverse.e;
      const cy = inverse.b * centre.x + inverse.d * centre.y + inverse.f;
      warp(trace, cx, cy, sigmaPx / Math.hypot(ctm.a, ctm.b), s);
    });
    dots.forEach((dot) => {
      /* measured where it would be with nothing applied */
      dot.style.translate = '';
      const box = dot.getBoundingClientRect();
      const dx = box.left + box.width / 2 - centre.x;
      const dy = box.top + box.height / 2 - centre.y;
      const push = s * Math.exp(-(dx * dx + dy * dy) / (2 * sigmaPx * sigmaPx));
      dot.style.translate = (dx * push).toFixed(2) + 'px ' + (dy * push).toFixed(2) + 'px';
    });
    bent = true;
  }

  function spring(state, key, speed, target, { stiffness, damping }, dt) {
    const force = stiffness * (target - state[key]) - damping * state[speed];
    state[speed] += force * dt;
    state[key] += state[speed] * dt;
  }

  function tick(now) {
    frame = 0;
    const dt = Math.min(0.032, (now - (last || now)) / 1000) || 1 / 60;
    last = now;
    const target = pointer.near && allowed() ? 1 : 0;

    spring(centre, 'x', 'vx', pointer.x, FOLLOW, dt);
    spring(centre, 'y', 'vy', pointer.y, FOLLOW, dt);
    spring(bend, 'value', 'velocity', target, FADE, dt);

    const moving = Math.abs(centre.vx) + Math.abs(centre.vy) > 0.5
      || Math.abs(pointer.x - centre.x) + Math.abs(pointer.y - centre.y) > 0.5
      || Math.abs(bend.velocity) > 0.002
      || Math.abs(target - bend.value) > 0.002;

    if (!target && !moving) {
      bend.value = bend.velocity = 0;
      if (bent) rest();
      last = 0;
      return;
    }
    draw();
    if (moving) frame = requestAnimationFrame(tick);
    else last = 0;
  }

  function wake() {
    if (!frame) frame = requestAnimationFrame(tick);
  }

  window.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'mouse') return;
    const box = mark.getBoundingClientRect();
    const reach = 4 * REACH * box.height;
    const near = event.clientX > box.left - reach && event.clientX < box.right + reach
      && event.clientY > box.top - reach && event.clientY < box.bottom + reach;
    /* coming in from far away, the field starts where the pointer is rather
       than sliding over from where it was last */
    if (near && !pointer.near && !bent) {
      centre.x = event.clientX;
      centre.y = event.clientY;
      centre.vx = centre.vy = 0;
    }
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.near = near;
    if (near || bent) wake();
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => {
    pointer.near = false;
    wake();
  });
  /* opening a section lets the letters go as they shrink into the corner */
  new MutationObserver(wake).observe(body, { attributes: true, attributeFilter: ['data-view'] });
  still.addEventListener('change', wake);
})();


/* The switch between Vantage and Weave.

   A tab list, because that is what it is: two panels, one showing, and a
   control per panel saying which. The chosen tab is the list's one stop in
   the tab order, and the arrow keys move between the two and show as they
   go — with two panels there is nothing gained by making a keyboard press
   Enter as well. */
(function () {
  document.querySelectorAll('.switch').forEach((list) => {
    const tabs = Array.from(list.querySelectorAll('[role="tab"]'));
    const thumb = list.querySelector('.switch-thumb');

    /* Puts the thumb under the chosen name. The stylesheet slides it there;
       this only says where, in the two numbers the names' own boxes give. */
    function place() {
      const tab = tabs.find((t) => t.getAttribute('aria-selected') === 'true');
      if (!thumb || !tab) return;
      list.style.setProperty('--thumb-x', tab.offsetLeft + 'px');
      list.style.setProperty('--thumb-w', tab.offsetWidth + 'px');
    }

    function choose(next, focus) {
      tabs.forEach((tab) => {
        const on = tab === next;
        tab.setAttribute('aria-selected', String(on));
        tab.tabIndex = on ? 0 : -1;
        document.getElementById(tab.getAttribute('aria-controls')).hidden = !on;
      });
      place();
      if (focus) next.focus();
    }

    /* The first place is written and laid out before the transition is
       switched on, so the thumb starts where it belongs instead of sliding
       in from the corner. The section is only unseen while it is down, not
       unlaid, so the names already have their widths. Watched after that,
       because a name changes width when the web font lands. */
    place();
    void list.offsetWidth;
    list.classList.add('is-ready');
    if ('ResizeObserver' in window) new ResizeObserver(place).observe(list);

    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => choose(tab, false));
      tab.addEventListener('keydown', (event) => {
        const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[event.key];
        if (to === undefined) return;
        event.preventDefault();
        choose(tabs[(to + tabs.length) % tabs.length], true);
      });
    });
  });
})();


/* Latest inspo, from Are.na.

   The four newest images in my inspo channel, as the stack of prints beside
   the music at home.

   The channel is public, so Are.na's API gives up its contents to anyone who
   asks, and this asks with no token at all. That is on purpose: anything in
   this file is readable by whoever opens it, and a personal access token can
   act as the account, not just read it.

   Newest first is the channel's own order turned round. Only picture blocks
   count — links and text in the channel are skipped. Asked once on load and
   every minute after while the tab is in front, and straight away on coming
   back to it. Are.na tells browsers to keep its answers for a week, so this
   never takes a kept one: a week-old answer is not live. */
(function () {
  const card = document.getElementById('inspo');
  if (!card) return;

  const CHANNEL = 'inspo-syd5sijpqmk';
  const ENDPOINT = 'https://api.are.na/v2/channels/' + CHANNEL
    + '/contents?per=24&sort=position&direction=desc';
  const SHOW = 4;
  const EVERY = 60000;
  const PATIENCE = 8000;
  const FADE = 280;

  const thumbs = Array.from(card.querySelectorAll('.inspo-thumb img'));
  const still = window.matchMedia('(prefers-reduced-motion: reduce)');
  let asking = false;
  let timer;

  thumbs.forEach((img) => {
    img.addEventListener('load', () => img.classList.remove('is-missing'));
    img.addEventListener('error', () => img.classList.add('is-missing'));
  });

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  function preload(src) {
    return new Promise((resolve) => {
      const image = new Image();
      image.onload = image.onerror = () => resolve();
      image.src = src;
      setTimeout(resolve, 1500);
    });
  }

  async function check() {
    if (asking) return;
    asking = true;
    const controller = new AbortController();
    const limit = setTimeout(() => controller.abort(), PATIENCE);
    try {
      const response = await fetch(ENDPOINT, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) return;
      const data = await response.json();
      const picks = (Array.isArray(data.contents) ? data.contents : [])
        .filter((block) => (block.class === 'Image' || block.class === 'Attachment')
          && block.image && block.image.square && block.image.square.url)
        .slice(0, SHOW)
        .map((block) => ({ id: String(block.id), src: block.image.square.url }));
      if (!picks.length) return;

      /* nothing new since last time, which is most minutes */
      const key = picks.map((pick) => pick.id).join(',');
      if (key === card.dataset.blocks) return;

      /* The new set is fetched before anything moves, then morphs in: the
         old squares fade out, the new are set while nothing shows, and they
         fade back. The first set, or any with motion turned down, is simply
         put up. */
      await Promise.all(picks.map((pick) => preload(pick.src)));
      const morph = !card.hidden && !still.matches;
      if (morph) {
        card.classList.add('is-changing');
        await wait(FADE);
      }
      thumbs.forEach((img, i) => {
        const pick = picks[i];
        img.parentElement.hidden = !pick;
        if (pick) img.src = pick.src;
        else img.removeAttribute('src');
      });
      card.dataset.blocks = key;
      card.hidden = false;
      card.classList.remove('is-changing');
    } catch (error) {
      /* Offline, blocked or down: whatever is showing stays, and a card that
         never loaded stays hidden. */
    } finally {
      clearTimeout(limit);
      asking = false;
    }
  }

  /* booked before asking, so a question that never comes back cannot end
     the loop — the same as the listening card's */
  function schedule() {
    clearTimeout(timer);
    if (document.hidden) return;
    timer = setTimeout(() => {
      schedule();
      check();
    }, EVERY);
  }
  function again() {
    schedule();
    if (!document.hidden) check();
  }
  document.addEventListener('visibilitychange', again);
  window.addEventListener('focus', again);
  window.addEventListener('pageshow', again);
  window.addEventListener('online', again);
  check();
  schedule();
})();



/* The visitor.

   Someone from EarthBound in the bottom-right corner of home, drawn from
   cast.js on every visit. They potter about their yard the way Mr. Saturn
   does in Saturn Valley: a few slow steps somewhere, a stop, a look around.
   Clicked, they hop, turn to face you and say something, typed into the
   game's window a letter at a time, and said to a screen reader too. With
   motion turned down they stay put and the words land whole. The walk only
   runs at home with motion allowed; it stops otherwise and wakes when that
   changes. What they say, and the font to say it in, are only fetched once
   someone reaches for them. */
(function () {
  const visitor = document.getElementById('visitor');
  const said = document.getElementById('visitor-said');
  if (!visitor) return;
  const body = document.body;
  const yard = visitor.parentElement;
  const say = visitor.querySelector('.visitor-say');
  const canvas = say.querySelector('canvas');
  const still = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* Weighted: Mr. Saturn and the party turn up often, most people now and
     then, and a few hardly ever. ?visitor=<id> asks for someone in
     particular, for the tests and for showing someone off. */
  function drawLots() {
    const total = CAST.reduce((sum, c) => sum + (c.weight ?? 1), 0);
    let roll = Math.random() * total;
    return CAST.find((c) => (roll -= c.weight ?? 1) < 0) || CAST[0];
  }
  const asked = new URLSearchParams(location.search).get('visitor');
  const who = CAST.find((c) => c.id === asked) || drawLots();
  const w = who.w ?? 18;
  /* about the height of Ness at three times: the small at three, the big
     at two, so nobody towers and nobody shrinks past a neighbour */
  const scale = Math.min(3, Math.max(2, Math.round(72 / who.h)));
  const SIZE = w * scale;
  yard.style.setProperty('--w', SIZE + 'px');
  yard.style.setProperty('--h', who.h * scale + 'px');
  visitor.style.setProperty('--sheet', `url("${who.src ?? `images/eb/cast/${who.id}.png`}")`);
  visitor.setAttribute('aria-label', who.name + '. Say hello');
  visitor.dataset.who = who.id;

  /* The game's font: a sheet of 16-pixel cells in three rows 24 apart.
     These rows mirror where each letter sits on the sheet, so they hold
     every glyph whether the cast uses it or not. A letter is as wide as its
     ink plus a column, measured off the sheet once it loads. The bullet is
     the game's own, in the @ slot. */
  const ROWS = [
    '!"·$%¢\'()*+,-./0123456789:;“=”?•ABCDE',
    'FGHIJKLMNOPQRSTUVWXYZαβγΣΩabcdefghijk',
    'lmnopqrstuvwxyz[♪]~',
  ];
  const GLYPHS = {};
  const SPACE = 3;
  const UI = 2;              /* css pixels to a game pixel */
  const INSET = 3;           /* game pixels of margin inside the frame */
  const LINES_MIN = 2;       /* the game rarely says anything on one line */
  const LINES_MAX = 4;
  const board = document.createElement('canvas');
  const ink = board.getContext('2d', { willReadFrequently: true });
  const pen = canvas.getContext('2d');
  say.style.setProperty('--ui', UI + 'px');
  let bullet = 6;

  function loadSheet() {
    const sheet = new Image();
    sheet.src = 'images/eb/ui/font.png';
    return sheet.decode().then(() => {
      board.width = sheet.naturalWidth;
      board.height = sheet.naturalHeight;
      ink.drawImage(sheet, 0, 0);
      const data = ink.getImageData(0, 0, board.width, board.height).data;
      ROWS.forEach((row, r) => [...row].forEach((ch, col) => {
        let right = -1;
        for (let x = 0; x < 16; x += 1) {
          for (let y = 0; y < 16; y += 1) {
            if (data[((r * 24 + y) * board.width + col * 16 + x) * 4 + 3]) right = Math.max(right, x);
          }
        }
        GLYPHS[ch] = { x: col * 16, y: r * 24, w: right + 2 };
      }));
      bullet = GLYPHS['•'].w;
      return sheet;
    });
  }

  /* Two ways to set a line: the game's own letters off the sheet, or for
     Mr. Saturn his own handwriting, Senor Saturno, drawn on a 16-pixel grid
     so that at 16px on a whole pixel each of its squares lands on one of
     ours, with whatever edge the browser still softens made hard again. */
  const SATURN_FONT = '16px "Senor Saturno"';
  function face(sheet) {
    if (who.font === 'saturn') {
      return {
        width(text) { ink.font = SATURN_FONT; return Math.ceil(ink.measureText(text).width); },
        draw(text, x, y) {
          ink.font = SATURN_FONT;
          ink.fillStyle = '#f8f8f8';
          ink.textBaseline = 'alphabetic';
          ink.fillText(text, x, y + 11);
        },
        harden: true,
      };
    }
    return {
      width(text) {
        let n = 0;
        for (const ch of text) n += ch === ' ' ? SPACE : GLYPHS[ch].w;
        return n;
      },
      draw(text, x, y) {
        for (const ch of text) {
          if (ch !== ' ') {
            const g = GLYPHS[ch];
            ink.drawImage(sheet, g.x, g.y, g.w, 16, x, y, g.w, 16);
          }
          x += ch === ' ' ? SPACE : GLYPHS[ch].w;
        }
      },
      harden: false,
    };
  }

  /* only what the sheet has: the cast's two strays come in as their plain
     cousins, and anything else as a question mark */
  function plain(text) {
    return [...text.replace(/…/g, '...').replace(/é/g, 'e')]
      .map((ch) => (ch === ' ' || ROWS.some((row) => row.includes(ch)) ? ch : '?'))
      .join('');
  }

  /* Everything waiting on a reach for them: the lines, the sheet and, for
     Mr. Saturn, his font. Asked for on the first hover, focus or press. */
  let primed = null;
  function prime() {
    primed ??= Promise.all([
      fetch('cast-lines.json')
        .then((response) => (response.ok ? response.json() : {}))
        .then((all) => all[who.id] || [])
        .catch(() => []),
      loadSheet(),
      who.font === 'saturn' ? document.fonts.load(SATURN_FONT).catch(() => {}) : null,
    ]).then(([sayings, sheet]) => ({ sayings: sayings.length ? sayings : ['...'], sheet, face: face(sheet) }));
    return primed;
  }
  visitor.addEventListener('pointerenter', prime, { once: true });
  visitor.addEventListener('focus', prime, { once: true });

  function wrap(text, room, f) {
    const lines = [];
    let line = '';
    text.split(' ').forEach((word) => {
      const next = line ? line + ' ' + word : word;
      if (line && f.width(next) > room) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    });
    if (line) lines.push(line);
    return lines;
  }

  /* The words are set once, whole, on the board, and typing only uncovers
     them: each letter's right edge is kept, and every tick copies across
     the lines done and, of the current line only, as far as the next
     letter. Broken
     across two lines at the narrowest width that still fits them in two,
     and the window hugs whatever that makes. */
  let stops = [];            /* [row, right edge] for every letter in order */
  function set(text, f, sheet) {
    const most = Math.min(184, Math.floor((window.innerWidth - 32) / UI) - 16) - 2 * INSET;
    const pad = bullet + 1;
    let room = Math.min(most - pad, Math.ceil(f.width(text) / LINES_MIN));
    let lines = wrap(text, room, f);
    while (lines.length > LINES_MIN && room < most - pad) {
      room += 4;
      lines = wrap(text, room, f);
    }
    lines = lines.slice(0, LINES_MAX);
    const width = Math.max(...lines.map((line) => f.width(line))) + pad + 2 * INSET;
    const k = Math.max(1, Math.round(UI * (window.devicePixelRatio || 1)));
    board.width = width;
    board.height = 16 * lines.length - 4 + 2 * INSET;
    canvas.width = width * k;
    canvas.height = board.height * k;
    canvas.style.width = width * UI + 'px';
    canvas.style.height = board.height * UI + 'px';

    const left = INSET + pad;
    stops = [];
    lines.forEach((line, row) => {
      const y = INSET - 1 + 16 * row;
      if (row === 0) {
        const g = GLYPHS['•'];
        ink.drawImage(sheet, g.x, g.y, g.w, 16, INSET, y, g.w, 16);
      }
      f.draw(line, left, y);
      for (let i = 1; i <= line.length; i += 1) stops.push([row, left + f.width(line.slice(0, i))]);
    });
    if (f.harden) {
      const image = ink.getImageData(0, 0, board.width, board.height);
      const d = image.data;
      for (let i = 3; i < d.length; i += 4) d[i] = d[i] > 100 ? 255 : 0;
      ink.putImageData(image, 0, 0);
    }
    pen.imageSmoothingEnabled = false;
  }
  function uncover(n) {
    const k = canvas.width / board.width;
    pen.clearRect(0, 0, canvas.width, canvas.height);
    if (!n) return;
    const [row, right] = stops[n - 1];
    const split = INSET - 1 + 16 * row;
    const tall = row === stops[stops.length - 1][0] ? board.height - split : 16;
    if (split > 0) pen.drawImage(board, 0, 0, board.width, split, 0, 0, canvas.width, split * k);
    pen.drawImage(board, 0, split, right, tall, 0, split * k, right * k, tall * k);
  }

  /* walking: back, right, front, left, two frames each (see cast.js) */
  const FACING = { up: 0, right: 2, down: 4, left: 6 };
  const SPEED = 40;          /* px a second, about Mr. Saturn's pace */
  let x = 0;                 /* 0 is the right end of the yard; they walk into minus */
  let goal = null;
  let rest = 1.5;
  let heading = 'down';
  let clock = 0;
  let talking = false;
  let room = 0;
  let frame = 0;
  let then = 0;
  let shown = '';
  new ResizeObserver(() => { room = Math.max(yard.clientWidth - SIZE, 0); }).observe(yard);

  function draw(walking) {
    const step = walking ? Math.floor(clock / 0.25) % 2 : (still.matches ? 0 : Math.floor(clock / 0.6) % 2);
    const next = FACING[heading] + step + ' ' + x;
    if (next === shown) return;
    shown = next;
    visitor.style.setProperty('--frame', FACING[heading] + step);
    visitor.style.setProperty('--x', x + 'px');
  }

  const allowed = () => body.dataset.view === 'home' && !still.matches;
  function tick(now) {
    frame = 0;
    if (!allowed()) { then = 0; draw(false); return; }
    const dt = Math.min((now - (then || now)) / 1000, 0.1);
    then = now;
    clock += dt;
    x = Math.max(Math.min(x, 0), -room);

    let walking = false;
    if (talking) {
      heading = 'down';
    } else if (goal !== null) {
      const d = goal - x;
      if (Math.abs(d) < 1) {
        goal = null;
        rest = 1.2 + Math.random() * 3;
        heading = Math.random() < 0.25 ? 'up' : 'down';
      } else {
        x += Math.sign(d) * Math.min(SPEED * dt, Math.abs(d));
        heading = d < 0 ? 'left' : 'right';
        walking = true;
      }
    } else if ((rest -= dt) <= 0) {
      goal = -Math.random() * room;
      if (Math.abs(goal - x) < 12) { goal = null; rest = 0.8; }
    }
    draw(walking);
    frame = requestAnimationFrame(tick);
  }
  function wake() {
    if (!frame && allowed()) frame = requestAnimationFrame(tick);
    else if (!allowed()) draw(false);
  }

  let typing = 0;
  let quiet = 0;
  let clicks = 0;
  let last = -1;
  function hush() {
    say.classList.remove('is-on');
    talking = false;
    if (said) said.textContent = '';
  }

  visitor.addEventListener('click', async () => {
    const n = ++clicks;
    goal = null;
    talking = true;
    heading = 'down';
    draw(false);
    visitor.classList.remove('is-boing');
    void visitor.offsetWidth;
    visitor.classList.add('is-boing');
    clearInterval(typing);
    clearTimeout(quiet);

    const { sayings, sheet, face: f } = await prime();
    if (n !== clicks) return;   /* clicked again while it all came in */
    let pick;
    do { pick = Math.floor(Math.random() * sayings.length); } while (pick === last && sayings.length > 1);
    last = pick;
    const text = sayings[pick];
    if (said) said.textContent = who.name + ': ' + text;

    set(plain(text), f, sheet);
    const total = stops.length;
    let typed = still.matches ? total : 0;
    uncover(typed);

    /* back on screen if they have wandered left enough to push it off */
    say.style.setProperty('--nudge', '0px');
    const over = 16 - say.getBoundingClientRect().left;
    if (over > 0) say.style.setProperty('--nudge', over + 'px');
    say.classList.add('is-on');

    const linger = () => { quiet = setTimeout(hush, 1800 + total * 25); };
    if (typed >= total) return linger();
    typing = setInterval(() => {
      typed += 1;
      uncover(typed);
      if (typed >= total) {
        clearInterval(typing);
        linger();
      }
    }, 30);
  });

  draw(false);
  wake();
  new MutationObserver(wake).observe(body, { attributes: true, attributeFilter: ['data-view'] });
  still.addEventListener('change', wake);
})();


/* The marks, thrown in.

   The first time about opens, pile.js is fetched along with what it draws
   and throws with, and the two rows of marks become a heap along the bottom
   of the window. Opening about again fires them in again; leaving fades them.
   If any of it cannot load, the rows simply stay. */
(function () {
  const canvas = document.getElementById('pile');
  const icons = [...document.querySelectorAll('#about .tech-icon')];
  if (!canvas || !icons.length) return;
  const body = document.body;
  const still = window.matchMedia('(prefers-reduced-motion: reduce)');
  let pile = null;
  let loading = null;

  /* Everything that reads on screen while about is up, a box a line: the
     mark, the menu's words, and each line of the about copy, measured from
     the text itself so a short last line leaves room beside it. */
  const about = document.getElementById('about');
  function solids() {
    const lines = [...about.querySelectorAll('.lede, .prose')].flatMap((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const rows = [];
      [...range.getClientRects()].forEach((r) => {
        const row = rows.find((o) => Math.abs(o.top - r.top) < 4);
        if (row) {
          row.left = Math.min(row.left, r.left);
          row.right = Math.max(row.right, r.right);
          row.bottom = Math.max(row.bottom, r.bottom);
        } else {
          rows.push({ left: r.left, right: r.right, top: r.top, bottom: r.bottom });
        }
      });
      return rows.map((o) => new DOMRect(o.left, o.top, o.right - o.left, o.bottom - o.top));
    });
    const chrome = [...document.querySelectorAll('#home .glyph, .menu-item')].map((el) => el.getBoundingClientRect());
    return lines.concat(chrome);
  }
  /* The clear stretch they are fired across: right of the copy and under
     the header when the window is wide enough to have one; otherwise the
     whole width just under the last line, so on a phone they pass below it. */
  function opening() {
    const words = [...about.querySelectorAll('.lede, .prose')].map((el) => el.getBoundingClientRect());
    const chrome = [...document.querySelectorAll('#home, .menu')].map((el) => el.getBoundingClientRect());
    const header = Math.max(0, ...chrome.map((r) => r.bottom)) + 16;
    const right = Math.max(0, ...words.map((r) => r.right)) + 24;
    const bottom = Math.max(header, ...words.map((r) => r.bottom));
    const edge = window.innerWidth - 16;
    return edge - right >= 200 ? { left: right, right: edge, top: header } : { left: 16, right: edge, top: bottom + 16 };
  }
  about.addEventListener('scroll', () => pile?.moved(), { passive: true });

  function update() {
    const here = body.dataset.view === 'about';
    canvas.classList.toggle('is-on', here && !!pile);
    if (!here) return pile?.hide();
    if (pile) {
      pile.show();
      /* the copy lifts in and the mark shrinks to its corner over the first
         0.6s; measure the words again once they are where they stay */
      setTimeout(() => pile.moved(), 700);
      return;
    }
    loading ??= import('./pile.js')
      .then(({ start }) => start({ canvas, icons, still, solids, opening }))
      .then((started) => {
        pile = started;
        document.documentElement.classList.add('has-pile');
        update();
      })
      .catch(() => {});
  }
  new MutationObserver(update).observe(body, { attributes: true, attributeFilter: ['data-view'] });
  update();
})();


/* The email, copied. Not a mailto — see the markup for why — so the button is
   the only way the address leaves the page, and it has to actually work rather
   than fail silently the way a dead mailto does.

   Two ways to do it, because the good one is not always available: the
   clipboard API needs a secure context and a permission the browser can still
   refuse, and it rejects rather than throwing synchronously. The old selection
   dance is the fallback, and it is deprecated rather than gone. */
(function () {
  const btn = document.querySelector('.copy');
  const live = document.querySelector('.sr-only[role="status"]');
  if (!btn) return;
  const text = btn.dataset.copy;
  let timer;

  function legacy() {
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    /* fixed and transparent rather than off-screen: a field positioned past
       the edge scrolls the page to itself when it takes the selection */
    field.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none;';
    document.body.appendChild(field);
    field.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    field.remove();
    return ok;
  }

  function said(word) {
    btn.classList.toggle('is-done', word === 'copied');
    if (live) live.textContent = word === 'copied'
      ? 'Email address copied'
      : 'Could not copy. The address is ' + text;
    clearTimeout(timer);
    timer = setTimeout(() => {
      btn.classList.remove('is-done');
      /* emptied so the same word is announced again on a second copy, rather
         than skipped as an unchanged value */
      if (live) live.textContent = '';
    }, 1800);
  }

  btn.addEventListener('click', () => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => said('copied'))
        .catch(() => said(legacy() ? 'copied' : 'failed'));
      return;
    }
    said(legacy() ? 'copied' : 'failed');
  });
})();


/* Now playing, from Last.fm by way of my Worker.

   Spotify scrobbles every track to Last.fm, and Last.fm marks the one playing
   right now, so the latest scrobble is either what is on or what was on
   last. The now-playing Worker holds the Last.fm key, finds the art, and
   answers with a small fixed shape. Asked once on load and every 30 seconds
   after, and only while the tab is in front: a tab in the background has
   nobody to show it to. */
(function () {
  const card = document.getElementById('listening');
  if (!card) return;

  const ENDPOINT = 'https://now-playing.now-playing.workers.dev/';
  /* where the card goes before it knows a track */
  const PROFILE = 'https://www.last.fm/user/kid_chino08';
  /* Every 30 seconds, which is also how long the Worker keeps an answer:
     asking more often would only get the same answer back. */
  const EVERY = 30000;
  /* how long a question gets before it is given up on */
  const PATIENCE = 8000;
  let asking = false;

  const art = card.querySelector('.listening-art');
  const label = card.querySelector('.listening-label');
  const title = card.querySelector('.listening-title');
  const artist = card.querySelector('.listening-artist');
  const aloud = document.getElementById('listening-said');
  const still = window.matchMedia('(prefers-reduced-motion: reduce)');
  /* pixels a second: slow enough to read as it goes by */
  const SPEED = 28;
  let timer;

  /* Sets a line's text, and if it runs past the line, turns it into a
     marquee: a second copy after a gap, and the distance and time for the
     stylesheet's loop. Left alone when the text has not changed, so a poll
     every 30 seconds does not restart a name halfway across. */
  function fit(line, text, force) {
    if (!force && line.dataset.text === text) return;
    line.dataset.text = text;
    line.classList.remove('is-long');
    line.textContent = text;
    if (still.matches || line.scrollWidth <= line.clientWidth + 1) return;

    const track = document.createElement('span');
    track.className = 'marquee';
    const copy = document.createElement('span');
    copy.className = 'marquee-copy';
    copy.textContent = text;
    const echo = copy.cloneNode(true);
    echo.setAttribute('aria-hidden', 'true');
    track.append(copy, echo);
    line.replaceChildren(track);

    /* Measured from the boxes, not from offsetLeft: offsetLeft is a whole
       number and the text is not, and the loop jumped by the difference
       every time it came round. */
    const distance = gap(line);
    line.style.setProperty('--marquee-distance', distance + 'px');
    line.style.setProperty('--marquee-time', (distance / SPEED).toFixed(2) + 's');
    line.classList.add('is-long');
  }

  /* how far the second copy starts from the first, to the fraction */
  function gap(line) {
    const copies = line.querySelectorAll('.marquee-copy');
    if (copies.length < 2) return 0;
    return copies[1].getBoundingClientRect().left - copies[0].getBoundingClientRect().left;
  }

  /* The line's width moves with the window, and the name's own width with
   the web font landing; either can turn a name that fitted into one that
   does not, or throw the loop's distance out. A line is only rebuilt when
   one of those has actually changed, because rebuilding restarts the
   scroll, and a restart mid-pass is a jump. */
  function refit() {
    [title, artist].forEach((line) => {
      const long = line.classList.contains('is-long');
      const moved = long
        ? Math.abs(gap(line) - parseFloat(line.style.getPropertyValue('--marquee-distance'))) > 0.25
        : !still.matches && line.scrollWidth > line.clientWidth + 1;
      if (moved || String(line.clientWidth) !== line.dataset.width) fit(line, line.dataset.text || '', true);
      line.dataset.width = String(line.clientWidth);
    });
  }
  let queued = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(queued);
    queued = requestAnimationFrame(refit);
  });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(refit);
  still.addEventListener('change', () => {
    [title, artist].forEach((line) => fit(line, line.dataset.text || '', true));
  });

  /* Short, because the status line has a phone's width to fit in beside the
     art: "Last played 2 hours ago" ran out of room and ended in an ellipsis
     there, and "Last played 2h ago" does not. */
  function ago(uts, spoken) {
    const minutes = Math.max(0, Math.round((Date.now() / 1000 - uts) / 60));
    if (minutes < 1) return 'just now';
    if (minutes < 60) return (spoken ? count(minutes, 'minute') : minutes + 'm') + ' ago';
    const hours = Math.round(minutes / 60);
    if (hours < 24) return (spoken ? count(hours, 'hour') : hours + 'h') + ' ago';
    const days = Math.round(hours / 24);
    return days === 1 ? 'yesterday' : (spoken ? count(days, 'day') : days + 'd') + ' ago';
  }
  /* The same, in words, for a screen reader, which would read "2h" as it is */
  const count = (n, unit) => n + ' ' + unit + (n === 1 ? '' : 's');

  /* The Worker sends art big enough for the desktop app: 600px from iTunes,
     300px from Last.fm. The card draws it at 56px, 168 at three times the
     density, so both are asked for near that size instead. */
  function sized(src) {
    return src
      .replace(/\/600x600bb\.(\w+)$/, '/180x180bb.$1')
      .replace('/i/u/300x300/', '/i/u/174s/');
  }

  /* Puts a track on the card as it stands. Shown before the names are set,
     so their lines have a width to be measured against. */
  function show(next) {
    label.textContent = next.label;
    card.classList.toggle('is-playing', next.playing);
    /* The art only shows once it has actually loaded. An address from
       Last.fm is not a picture: some come back missing, and turned on at the
       address the card drew the browser's broken-image mark over the note.
       Until it loads, and if it never does, the note stands in. */
    if (!next.real) {
      delete art.dataset.want;
      art.removeAttribute('src');
      card.classList.remove('has-art');
      card.style.removeProperty('--tint');
    } else if (art.dataset.want !== next.src || (art.complete && art.naturalWidth === 0)) {
      /* A new picture, or the same one again because it failed. Last.fm's
         image server answers 404 for a while on art for a track it has only
         just been sent, so a miss is asked for again on the next poll rather
         than leaving the note up for the rest of the song. */
      const retry = art.dataset.want === next.src;
      art.dataset.want = next.src;
      card.classList.remove('has-art');
      art.src = retry ? next.src + (next.src.includes('?') ? '&' : '?') + 'try=' + Date.now() : next.src;
    } else {
      card.classList.toggle('has-art', art.complete && art.naturalWidth > 0);
    }
    card.hidden = false;
    fit(title, next.name);
    fit(artist, next.by);
    [title, artist].forEach((line) => { line.dataset.width = String(line.clientWidth); });
    card.href = next.href;
    card.setAttribute('aria-label', next.spoken + ', on Last.fm (opens in a new tab)');
    /* A new track is said aloud, politely. Not the first, which arrives with
       the page, and not the "last played" time ticking over each minute,
       which is why this has its own region rather than the card being live. */
    if (aloud && card.dataset.track && card.dataset.track !== next.key) aloud.textContent = next.spoken;
    card.dataset.track = next.key;
  }

  /* The waveform's colour, from the art: the average of its brighter, more
     coloured pixels, lifted until it reads against the black, so a mostly
     dark cover still gives its accent. Art served without CORS cannot be
     read, and leaves the bars white. */
  const sampler = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  function tint() {
    try {
      sampler.canvas.width = sampler.canvas.height = 16;
      sampler.drawImage(art, 0, 0, 16, 16);
      const d = sampler.getImageData(0, 0, 16, 16).data;
      const sum = [0, 0, 0];
      let weight = 0;
      for (let i = 0; i < d.length; i += 4) {
        const max = Math.max(d[i], d[i + 1], d[i + 2]);
        const w = (max - Math.min(d[i], d[i + 1], d[i + 2]) + 8) * (max / 255);
        sum[0] += d[i] * w;
        sum[1] += d[i + 1] * w;
        sum[2] += d[i + 2] * w;
        weight += w;
      }
      if (!weight) return;
      const mix = sum.map((v) => v / weight);
      const lift = Math.max(1, 170 / Math.max(...mix));
      card.style.setProperty('--tint', 'rgb(' + mix.map((v) => Math.min(255, Math.round(v * lift))).join(' ') + ')');
    } catch (error) {
      card.style.removeProperty('--tint');
    }
  }
  art.addEventListener('load', () => {
    card.classList.add('has-art');
    tint();
  });
  art.addEventListener('error', () => card.classList.remove('has-art'));

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  /* the new art fetched before anything moves, so it fades in drawn rather
     than arriving a beat after the words; given a second and a half at most */
  function preload(src) {
    return new Promise((resolve) => {
      if (!src) return resolve();
      const image = new Image();
      image.onload = image.onerror = () => resolve();
      image.src = src;
      setTimeout(resolve, 1500);
    });
  }

  /* From one track to the next. The old art and words fade out with a
     little blur, the new ones are set while nothing shows, and they fade
     back in as the card eases from its old width to its new one — a new
     title is rarely the old one's length, and a card that snapped to fit was
     the jolt this is here to take out. The stylesheet times the fades; the
     width is measured here, since a width to animate to has to be a number. */
  const FADE = 280;
  const GROW = 420;
  async function morph(next) {
    await preload(next.real ? next.src : '');
    const from = card.getBoundingClientRect().width;
    card.classList.add('is-changing');
    await wait(FADE);

    card.style.width = '';
    show(next);
    const to = card.getBoundingClientRect().width;
    card.style.width = from + 'px';
    void card.offsetWidth;
    card.style.width = to + 'px';
    card.classList.remove('is-changing');

    await wait(GROW);
    card.style.width = '';
  }

  async function check() {
    /* one question at a time: the focus and visibility events can land
       together, and on top of a scheduled check */
    if (asking) return;
    asking = true;
    /* A request can stall and never come back — after the laptop sleeps, or
       the Wi-Fi drops mid-question — and while it was out, every later check
       stood aside for it, so the card stopped following the music until the
       page was reloaded. Given up on after PATIENCE instead. */
    const controller = new AbortController();
    const limit = setTimeout(() => controller.abort(), PATIENCE);
    try {
      const response = await fetch(ENDPOINT, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) return;
      const data = await response.json();
      /* No track: an account with nothing played yet. Whatever is showing
         stays, and a card that never loaded stays hidden. An answer marked
         stale is shown as it is — a slightly old track is still a fine one. */
      if (!data || !data.track) return;

      const playing = data.playing === true;
      const when = data.playedAt ? Date.parse(data.playedAt) / 1000 : 0;
      const name = data.track;
      const by = data.artist || '';
      /* The Worker has already turned Last.fm's grey star into no art */
      const src = data.art ? sized(data.art) : '';
      const status = (spoken) => (playing ? 'Listening now' : 'Last played' + (when ? ' ' + ago(when, spoken) : ''));
      const next = {
        key: name + '\n' + by,
        name,
        by,
        label: status(false),
        spoken: status(true) + ': ' + name + (by ? ' by ' + by : ''),
        href: data.url || PROFILE,
        playing,
        src,
        real: !!src,
      };

      /* A new track morphs in. The first one, the same one again — which
         is every poll in the middle of a song — and anything with motion
         turned down are simply set. */
      if (card.hidden || card.dataset.track === next.key || still.matches) show(next);
      else await morph(next);
    } catch (error) {
      /* Offline, blocked or down: whatever is showing stays, and a card that
         never loaded stays hidden. Nothing here is worth an error. */
    } finally {
      clearTimeout(limit);
      asking = false;
    }
  }

  /* The next question is booked before this one is asked, so however this
     one goes — answered, failed or stalled — the loop carries on. It used to
     book the next only once this one had come back, and one that never came
     back ended the loop. */
  function schedule() {
    clearTimeout(timer);
    if (document.hidden) return;
    timer = setTimeout(() => {
      schedule();
      check();
    }, EVERY);
  }

  /* Asked straight away whenever the page comes back: the tab showing again,
     the window taking focus again after Spotify had it — on a Mac often the
     window that was covering this one, and not a change of visibility at
     all — the page restored from the back button, or the network back. */
  function again() {
    schedule();
    if (!document.hidden) check();
  }
  document.addEventListener('visibilitychange', again);
  window.addEventListener('focus', again);
  window.addEventListener('pageshow', again);
  window.addEventListener('online', again);
  check();
  schedule();
})();
