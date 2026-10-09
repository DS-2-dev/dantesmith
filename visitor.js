/* The visitor, split out of app.js now that home no longer loads it: who
   stands in the bottom-right corner, and what they say, is in cast.js. */
import { CAST } from './cast.js';

/* The visitor.

   Someone from EarthBound in the bottom-right corner of home, drawn from
   cast.js on every visit. They potter about their yard the way Mr. Saturn
   does in Saturn Valley: a few slow steps somewhere, a stop, a look around.
   Clicked, they hop, turn to face you and say something, typed into the
   game's window a letter at a time, and said to a screen reader too. With
   motion turned down they stay put and the words land whole. The walk only
   runs with motion allowed; it stops otherwise and wakes when that
   changes. What they say, and the font to say it in, are only fetched once
   someone reaches for them. */
(function () {
  const visitor = document.getElementById('visitor');
  const said = document.getElementById('visitor-said');
  if (!visitor) return;
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

  const allowed = () => !still.matches;
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
  still.addEventListener('change', wake);
})();
