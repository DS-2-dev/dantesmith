/* A little of EarthBound on a white floor.

   Ness walks with the arrow keys or WASD, or toward wherever the floor is
   clicked. Everything on the floor is a button: clicking one opens its window
   straight away, and walking up to one and pressing Enter, Space or Z opens it
   the way the game would. The sprites are EarthBound's, cut from the sheets on
   The Spriters Resource into images/eb/.

   The world is measured in the sprites' own pixels and drawn at a whole-number
   scale, so a pixel is always a square of screen pixels and never smeared. */
(function () {
  const world = document.getElementById('world');
  const talk = document.getElementById('talk');
  if (!world || !talk) return;

  const still = matchMedia('(prefers-reduced-motion: reduce)');
  const SPEED = 72;          /* sprite pixels a second */
  const REACH = 14;          /* how close counts as standing at a thing */
  const TOP = 18;            /* room kept clear for the hint along the top */

  /* What is on the floor. fx and fy place a thing's foot as a fraction of
     the floor, so the layout holds its shape from a phone to a wide screen. */
  const THINGS = [
    {
      id: 'sign', src: 'images/eb/sign.png', name: 'About', fx: 0.5, fy: 0.12,
      pages: [
        'Dante Smith. 18yo Modern AI Designer, based in Utah.',
        'Studying for a Bachelor’s in Management Info Systems. On the side: typography and web (UI/UX) design.',
        'He gathers inspo, draws wireframes and designs it all himself, then has AI solidify it. He understands the code; he just gets more time for the craft.',
      ],
    },
    {
      id: 'computer', src: 'images/eb/computer.png', name: 'Work', fx: 0.24, fy: 0.3,
      pages: [
        'Sidq — flyer campaign. Three flyers for an app that keeps your conversation going when you move between AI tools.',
        'Weave — web design. A demo site for an AI front desk for dental, optometry and vet practices.',
        'Vantage — brand and product, upcoming. Fencing software, with the UI and AI training rethought.',
        'WSU AI Lab — a recruiting poster. He’s their Website Manager now.',
      ],
      links: [{ label: 'Weave live demo', href: 'https://weave2-demo.vercel.app/' }],
    },
    {
      id: 'jukebox', src: 'images/eb/jukebox.png', name: 'Now playing', fx: 0.76, fy: 0.3,
      pages: ['The jukebox is warming up…'],
      links: [{ label: 'Last.fm', href: 'https://www.last.fm/user/kid_chino08' }],
      live: nowPlaying,
    },
    {
      id: 'mailbox', src: 'images/eb/mailbox.png', name: 'Contact', fx: 0.2, fy: 0.62,
      pages: [
        'There’s a note in the mailbox.',
        '“I don’t believe in enshittification, and I’m known for being honest. Bring me a dashboard or an idea and I’ll give you real feedback, at no cost. Well, only your time.”',
      ],
      links: [
        { label: 'dantesmith@weber.edu', href: 'mailto:dantesmith@weber.edu' },
        { label: 'LinkedIn', href: 'https://www.linkedin.com/in/dante-smith-/' },
      ],
    },
    {
      id: 'present', src: 'images/eb/present.png', name: 'Résumé', fx: 0.42, fy: 0.7,
      pages: ['You opened the present.', 'Inside was… Dante’s résumé!'],
      links: [{ label: 'Open résumé (PDF)', href: 'dante-smith-resume.pdf' }],
    },
    {
      id: 'escargo', src: 'images/eb/escargo.png', name: 'Deposit', fx: 0.6, fy: 0.7, frames: 2,
      pages: [
        'Escargo Express! We deliver at a snail’s pace and a fair price.',
        'Starting a project with Dante? Your deposit goes through me.',
      ],
      links: [{ label: 'Pay deposit', href: 'https://buy.stripe.com/00waEY1d52al8Mr9220Jq00' }],
    },
    {
      id: 'saturn', src: 'images/eb/saturn.png', name: 'Mr. Saturn', fx: 0.82, fy: 0.6, frames: 8, wanders: true,
      pages: ['Boing! Zoom. Dante keeps his inspo on Are.na, ding.'],
      links: [{ label: 'Inspo on Are.na', href: 'https://www.are.na/dante-smith/inspo-syd5sijpqmk' }],
      live: inspo,
    },
    {
      id: 'lamp', src: 'images/eb/lamppost.png', name: 'Lights', fx: 0.93, fy: 0.16,
      use: () => lights(),
    },
    {
      id: 'plant', src: 'images/eb/plant.png', name: 'Plant', fx: 0.08, fy: 0.2,
      pages: ['It’s a plant. It’s doing its best.'],
    },
  ];

  /* Ness's strip: two frames for each of the eight ways he can face, round
     from down through left, up and right. */
  const FACING = {
    down: 0, downleft: 2, left: 4, upleft: 6, up: 8, upright: 10, right: 12, downright: 14,
  };
  const OCTANTS = ['right', 'downright', 'down', 'downleft', 'left', 'upleft', 'up', 'upright'];
  function facing(dx, dy) {
    return OCTANTS[(Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8];
  }
  const ness = { x: 0, y: 0, face: 'down', step: 0, el: document.createElement('div') };
  ness.el.className = 'ness';
  ness.el.setAttribute('aria-hidden', 'true');
  world.append(ness.el);

  let scale = 3, W = 0, H = 0;
  let target = null;
  let open = null;
  const keys = new Set();

  THINGS.forEach((thing) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'thing';
    btn.setAttribute('aria-label', thing.name);
    const img = new Image();
    img.src = thing.src;
    img.alt = '';
    img.draggable = false;
    const tag = document.createElement('span');
    tag.className = 'thing-tag';
    tag.textContent = thing.name;
    /* a strip of frames shows one at a time through a window its own size */
    if (thing.frames) {
      const clip = document.createElement('span');
      clip.className = 'thing-clip';
      clip.append(img);
      btn.append(clip, tag);
    } else {
      btn.append(img, tag);
    }
    world.append(btn);
    thing.el = btn;
    thing.img = img;
    img.addEventListener('load', layout);
    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      faceToward(thing);
      act(thing);
    });
  });

  function size(thing) {
    const w = thing.img.naturalWidth / (thing.frames || 1);
    return { w: w || 16, h: thing.img.naturalHeight || 16 };
  }

  function layout() {
    const was = W ? { fx: ness.x / W, fy: ness.y / H } : { fx: 0.5, fy: 0.52 };
    scale = Math.max(2, Math.min(4, Math.floor(Math.min(innerWidth / 170, innerHeight / 150))));
    W = Math.floor(innerWidth / scale);
    H = Math.floor(innerHeight / scale);
    world.style.setProperty('--px', scale + 'px');

    THINGS.forEach((thing) => {
      const { w, h } = size(thing);
      thing.homeX = Math.round(thing.fx * W);
      thing.homeY = Math.round(TOP + h + thing.fy * (H - TOP - h - 8));
      thing.x = thing.homeX + (thing.ox || 0);
      thing.y = thing.homeY + (thing.oy || 0);
      thing.w = w;
      thing.h = h;
      thing.el.style.width = w * scale + 'px';
      thing.el.style.height = h * scale + 'px';
      place(thing);
      if (thing.frames) {
        thing.img.style.width = thing.frames * w * scale + 'px';
        thing.img.style.height = h * scale + 'px';
      }
    });

    ness.x = was.fx * W;
    ness.y = was.fy * H;
    draw();
  }

  function place(thing) {
    Object.assign(thing.el.style, {
      left: Math.round(thing.x - thing.w / 2) * scale + 'px',
      top: Math.round(thing.y - thing.h) * scale + 'px',
      zIndex: Math.round(thing.y),
    });
  }

  /* Feet only: a thing blocks a strip along its base, so Ness can pass
     behind the top of a tall one the way he does in the game. */
  function blocked(x, y, self) {
    if (x < 6 || x > W - 6 || y < TOP + 10 || y > H - 2) return true;
    return THINGS.some((t) => t !== self && Math.abs(x - t.x) < t.w / 2 + 4 && y > t.y - 6 && y < t.y + 3);
  }

  function nearest() {
    let best = null, gap = REACH;
    THINGS.forEach((t) => {
      const dx = Math.max(0, Math.abs(ness.x - t.x) - t.w / 2);
      const dy = Math.abs(ness.y - t.y);
      const d = Math.hypot(dx, dy);
      if (d <= gap) { best = t; gap = d; }
    });
    return best;
  }

  function faceToward(thing) {
    const dx = thing.x - ness.x, dy = thing.y - ness.y;
    ness.face = facing(dx, dy);
    draw();
  }

  function draw() {
    const frame = FACING[ness.face] + (ness.step % 2);
    const s = ness.el.style;
    s.left = Math.round(ness.x - 8) * scale + 'px';
    s.top = Math.round(ness.y - 24) * scale + 'px';
    s.zIndex = Math.round(ness.y);
    s.backgroundPosition = -frame * 16 * scale + 'px 0';
  }

  /* walking */
  let last = performance.now(), walked = 0;
  function tick(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    let dx = 0, dy = 0;
    if (!open) {
      if (keys.has('left')) dx -= 1;
      if (keys.has('right')) dx += 1;
      if (keys.has('up')) dy -= 1;
      if (keys.has('down')) dy += 1;
      if (dx || dy) target = null;
      else if (target) {
        const tx = target.x - ness.x, ty = target.y - ness.y;
        const d = Math.hypot(tx, ty);
        if (d < 1.5) target = null;
        else { dx = tx / d; dy = ty / d; }
      }
    }
    if (dx || dy) {
      const n = Math.hypot(dx, dy);
      const step = SPEED * dt / n;
      const nx = ness.x + dx * step, ny = ness.y + dy * step;
      let moved = false;
      if (!blocked(nx, ness.y)) { ness.x = nx; moved = true; }
      if (!blocked(ness.x, ny)) { ness.y = ny; moved = true; }
      if (!moved) target = null;
      ness.face = facing(dx, dy);
      walked += dt;
      ness.step = Math.floor(walked * 6);
    } else {
      ness.step = 0;
    }
    draw();
    THINGS.forEach((t) => {
      if (t.wanders) wander(t, dt);
      else if (t.frames) idle(t, dt);
    });
    requestAnimationFrame(tick);
  }

  /* someone who stays put, shifting from foot to foot */
  function idle(t, dt) {
    t.clock = (t.clock || 0) + dt;
    const frame = Math.floor(t.clock / 0.5) % t.frames;
    t.img.style.marginLeft = -frame * t.w * scale + 'px';
  }

  /* Mr. Saturn potters about near where he started, the way he does in
     Saturn Valley: a few slow steps somewhere, a stop, a look around. He
     keeps out of Ness's way, and stands still to talk. His strip runs back,
     right, front, left, two frames each. */
  const SATURN_FACING = { up: 0, right: 2, down: 4, left: 6 };
  const SATURN_SPEED = 18;
  const ROAM = 30;
  function wander(t, dt) {
    t.clock = (t.clock || 0) + dt;
    t.rest = t.rest === undefined ? 1.5 : t.rest;
    let walking = false;

    if (open === t) {
      t.goal = null;
      const dx = ness.x - t.x, dy = ness.y - t.y;
      t.face = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
    } else if (t.goal) {
      const gx = t.goal.x - t.x, gy = t.goal.y - t.y;
      const d = Math.hypot(gx, gy);
      if (d < 1) {
        t.goal = null;
        t.rest = 1.2 + Math.random() * 3;
      } else {
        const step = Math.min(SATURN_SPEED * dt, d);
        const nx = t.x + (gx / d) * step, ny = t.y + (gy / d) * step;
        const crowded = Math.hypot(nx - ness.x, ny - ness.y) < 12;
        if (crowded || blocked(nx, ny, t)) {
          t.goal = null;
          t.rest = 0.6 + Math.random();
        } else {
          t.x = nx;
          t.y = ny;
          walking = true;
          t.face = Math.abs(gx) > Math.abs(gy) ? (gx < 0 ? 'left' : 'right') : (gy < 0 ? 'up' : 'down');
        }
      }
    } else {
      t.rest -= dt;
      if (t.rest <= 0) {
        const angle = Math.random() * Math.PI * 2;
        const reach = 8 + Math.random() * 16;
        let gx = t.x + Math.cos(angle) * reach, gy = t.y + Math.sin(angle) * reach * 0.6;
        /* never stray far from home */
        gx = Math.max(t.homeX - ROAM, Math.min(t.homeX + ROAM, gx));
        gy = Math.max(t.homeY - ROAM * 0.6, Math.min(t.homeY + ROAM * 0.6, gy));
        t.goal = { x: gx, y: gy };
        /* now and then he just turns round instead */
        if (Math.random() < 0.3) {
          t.goal = null;
          t.face = ['up', 'down', 'left', 'right'][Math.floor(Math.random() * 4)];
          t.rest = 0.8 + Math.random() * 1.5;
        }
      }
    }

    const beat = walking ? 0.18 : 0.45;
    const frame = SATURN_FACING[t.face || 'down'] + (Math.floor(t.clock / beat) % 2);
    t.img.style.marginLeft = -frame * t.w * scale + 'px';
    t.ox = t.x - t.homeX;
    t.oy = t.y - t.homeY;
    place(t);
  }

  /* The window: the game's own, the "plain" flavour, and its own font,
     drawn letter by letter onto a canvas at the game's size and then blown
     up whole. Three lines show at a time; as more come the old ones scroll
     up out of it, and a page waits under a blinking arrow for the next.
     The window, font and arrow are from ebtext by Bill Eager
     (github.com/beager/ebtext), MIT licence, copyright (c) 2013 Bill
     Eager, and the way it sets text is followed here. */
  const canvas = talk.querySelector('.talk-window');
  const said = talk.querySelector('.talk-said');
  const links = talk.querySelector('.talk-links');
  const pen = canvas.getContext('2d');
  const board = document.createElement('canvas');
  const ink = board.getContext('2d', { willReadFrequently: true });
  const picture = (src) => { const i = new Image(); i.src = src; return i; };
  const art = {
    window: picture('images/eb/ui/window.png'),
    font: picture('images/eb/ui/font.png'),
    arrowBig: picture('images/eb/ui/arrow-big.png'),
    arrowSmall: picture('images/eb/ui/arrow-sm.png'),
  };

  /* The font sheet: three rows of 16-pixel cells, 24 apart. A letter is as
     wide as its ink plus one column of space, measured off the sheet once
     it loads. The bullet is the game's own, in the @ slot. */
  const ROWS = [
    '!"·$%¢\'()*+,-./0123456789:;“=”?•ABCDE',
    'FGHIJKLMNOPQRSTUVWXYZαβγΣΩabcdefghijk',
    'lmnopqrstuvwxyz[♪]~',
  ];
  const GLYPHS = {};
  const SPACE = 3;
  function measure() {
    const c = document.createElement('canvas');
    c.width = art.font.naturalWidth;
    c.height = art.font.naturalHeight;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(art.font, 0, 0);
    const data = g.getImageData(0, 0, c.width, c.height).data;
    ROWS.forEach((row, r) => [...row].forEach((ch, col) => {
      let right = -1;
      for (let x = 0; x < 16; x += 1) {
        for (let y = 0; y < 16; y += 1) {
          if (data[((r * 24 + y) * c.width + col * 16 + x) * 4 + 3]) right = Math.max(right, x);
        }
      }
      GLYPHS[ch] = { x: col * 16, y: r * 24, w: right + 2 };
    }));
  }
  if (art.font.complete) measure(); else art.font.addEventListener('load', measure);

  /* only what the font has: curly single quotes, dashes and the like come
     in as their plain cousins */
  function plain(s) {
    return s
      .replace(/[‘’]/g, "'")
      .replace(/[–—]/g, '-')
      .replace(/…/g, '...')
      .replace(/&/g, 'and')
      .replace(/[éè]/g, 'e');
  }

  let S = 3, GW = 200;       /* the window's scale, and its width in game pixels */
  let page = 0, typing = 0, blink = 0, waiting = false, flash = false;
  let pageStart = 0;         /* where this page's lines begin in shown */
  let shown = [];            /* every line typed so far, the last three on view */
  let queue = [];            /* what is still to type on this page */
  let saturn = false;
  const SATURN_FONT = '16px "Senor Saturno"';

  /* The window's frame is the talk box's own border, so the words and
     anything with them share one window. CW is the width inside the frame,
     in game pixels. The scale snaps to whole device pixels, so a game pixel
     is always the same size on screen as its neighbours. */
  let CW = 184, K = 3;       /* K: device pixels to a game pixel */
  let rows = 3;              /* lines of words the window is tall */
  /* As tall as the words need, up to the game's three lines: a line or two
     and a picture should not leave an empty band between them. */
  function rowsTall(n) {
    rows = n;
    board.width = CW;
    board.height = 16 * n;
    canvas.width = CW * K;
    canvas.height = 16 * n * K;
    canvas.style.width = CW * S + 'px';
    canvas.style.height = 16 * n * S + 'px';
  }
  const arrow = talk.querySelector('.talk-arrow');
  function snap(css) {
    const dpr = devicePixelRatio || 1;
    return Math.max(1, Math.round(css * dpr)) / dpr;
  }
  function fitWindow() {
    S = snap(innerWidth >= 1000 ? 2.4 : 2);
    K = Math.round(S * (devicePixelRatio || 1));
    GW = Math.min(240, Math.floor((innerWidth - 24) / S));
    CW = GW - 16;
    rowsTall(rows);
    talk.style.setProperty('--ui', S);
    talk.style.width = CW * S + 'px';
  }

  /* The font has no @: its slot holds the bullet. One is drawn here in the
     same pixels, the height of a capital. Anything else it lacks is set in
     Orange Kid, the nearest face. */
  const AT = ['.####.', '#....#', '#.##.#', '#.#..#', '#.####', '#.....', '.####.'];
  const SPARE = '15px "Orange Kid"';
  function spareWidth(ch) {
    if (ch === '@') return AT[0].length + 1;
    ink.font = SPARE;
    return Math.ceil(ink.measureText(ch).width) + 1;
  }
  function spare(g, ch, x, y) {
    g.fillStyle = '#f8f8f8';
    if (ch === '@') {
      AT.forEach((row, r) => [...row].forEach((dot, c) => { if (dot === '#') g.fillRect(x + c, y + 2 + r, 1, 1); }));
    } else {
      g.font = SPARE;
      g.textBaseline = 'top';
      g.fillText(ch, x, y);
    }
    return spareWidth(ch);
  }

  function width(word) {
    if (saturn) { ink.font = SATURN_FONT; return Math.ceil(ink.measureText(word).width); }
    let w = 0;
    for (const ch of word) w += ch === ' ' ? SPACE : (GLYPHS[ch] ? GLYPHS[ch].w : spareWidth(ch));
    return w;
  }

  /* a page into lines: the first opens on the bullet, and every line keeps
     clear of the window's right edge */
  function wrap(text) {
    const room = CW - 8;
    const lines = [];
    let line = '';
    text.split(' ').forEach((word) => {
      const next = line ? line + ' ' + word : word;
      if (line && width(next) > room) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    });
    if (line) lines.push(line);
    return lines.map((t, i) => ({ bullet: i === 0, text: i === 0 ? '•' + t : t }));
  }

  function render() {
    ink.clearRect(0, 0, CW, 16 * rows);
    shown.slice(-rows).forEach((line, row) => {
      const y = 16 * row;
      let x = line.bullet ? 0 : 6;
      if (saturn) {
        if (line.bullet) {
          const g = GLYPHS['\u2022'];
          if (g) ink.drawImage(art.font, g.x, g.y, g.w, 16, x, y, g.w, 16);
          x += g ? g.w : 6;
        }
        /* Senor Saturno is drawn on a 16-pixel grid: at 16px, on a whole
           pixel, each of its squares lands on one of ours */
        ink.font = SATURN_FONT;
        ink.fillStyle = '#f8f8f8';
        ink.textBaseline = 'alphabetic';
        ink.fillText(line.bullet ? line.text.slice(1) : line.text, x, y + 11);
        return;
      }
      for (const ch of line.text) {
        if (ch === ' ') { x += SPACE; continue; }
        const g = GLYPHS[ch];
        if (!g) { x += spare(ink, ch, x, y); continue; }
        ink.drawImage(art.font, g.x, g.y, g.w, 16, x, y, g.w, 16);
        x += g.w;
      }
    });
    if (saturn) {
      /* whatever edge the browser still softened is made hard again */
      const image = ink.getImageData(0, 0, CW, 16 * rows);
      const d = image.data;
      for (let i = 3; i < d.length; i += 4) d[i] = d[i] > 100 ? 255 : 0;
      ink.putImageData(image, 0, 0);
    }
    arrow.hidden = !waiting;
    arrow.src = flash ? art.arrowSmall.src : art.arrowBig.src;
    pen.imageSmoothingEnabled = false;
    pen.clearRect(0, 0, canvas.width, canvas.height);
    pen.drawImage(board, 0, 0, CW * K, 16 * rows * K);
  }

  /* what doing something to a thing does: most talk, the lamp switches */
  function act(thing) {
    if (thing.use) return thing.use(thing);
    say(thing);
  }

  /* The lamppost turns the lights down: the page goes dark, and stays so on
     the next visit, in this browser. */
  function lights(on) {
    const dark = on === undefined ? document.documentElement.dataset.theme !== 'dark' : on;
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    try { localStorage.setItem('eb-theme', dark ? 'dark' : 'light'); } catch { /* fine */ }
  }
  try { if (localStorage.getItem('eb-theme') === 'dark') lights(true); } catch { /* fine */ }

  /* a frame of the game's window, any size, from its corners and edges */
  function frame(g, w, h) {
    const win = art.window;
    const c = 8;
    g.drawImage(win, c, c, 240 - 2 * c, 64 - 2 * c, c, c, w - 2 * c, h - 2 * c);
    g.drawImage(win, c, 0, 240 - 2 * c, c, c, 0, w - 2 * c, c);
    g.drawImage(win, c, 64 - c, 240 - 2 * c, c, c, h - c, w - 2 * c, c);
    g.drawImage(win, 0, c, c, 64 - 2 * c, 0, c, c, h - 2 * c);
    g.drawImage(win, 240 - c, c, c, 64 - 2 * c, w - c, c, c, h - 2 * c);
    g.drawImage(win, 0, 0, c, c, 0, 0, c, c);
    g.drawImage(win, 240 - c, 0, c, c, w - c, 0, c, c);
    g.drawImage(win, 0, 64 - c, c, c, 0, h - c, c, c);
    g.drawImage(win, 240 - c, 64 - c, c, c, w - c, h - c, c, c);
  }

  /* a line of the game's font, at the game's size */
  function letters(g, text, x, y) {
    for (const ch of plain(text)) {
      if (ch === ' ') { x += SPACE; continue; }
      const gl = GLYPHS[ch];
      if (!gl) { x += spare(g, ch, x, y); continue; }
      g.drawImage(art.font, gl.x, gl.y, gl.w, 16, x, y, gl.w, 16);
      x += gl.w;
    }
  }

  /* a word or two in a little window of its own, blown up to scale */
  function badge(text, scale, framed) {
    const saved = saturn;
    saturn = false;
    const w = width(plain(text)) + (framed ? 14 : 0);
    saturn = saved;
    const h = framed ? 24 : 16;
    const small = document.createElement('canvas');
    small.width = w;
    small.height = h;
    const g = small.getContext('2d');
    if (framed) frame(g, w, h);
    letters(g, text, framed ? 7 : 0, framed ? 7 : 0);
    const big = document.createElement('canvas');
    const k = Math.max(1, Math.round(scale * (devicePixelRatio || 1)));
    big.width = w * k;
    big.height = h * k;
    big.style.width = w * scale + 'px';
    big.style.height = h * scale + 'px';
    big.setAttribute('aria-hidden', 'true');
    const b = big.getContext('2d');
    b.imageSmoothingEnabled = false;
    b.drawImage(small, 0, 0, w * k, h * k);
    return big;
  }

  /* once the window and font are in, every thing's label is drawn in them */
  const ready = (i) => (i.complete ? Promise.resolve() : new Promise((r) => i.addEventListener('load', r)));
  Promise.all([ready(art.window), ready(art.font)]).then(() => {
    if (!Object.keys(GLYPHS).length) measure();
    THINGS.forEach((thing) => {
      const tag = thing.el.querySelector('.thing-tag');
      tag.replaceChildren(badge(thing.name, 2, true));
    });
  });

  function say(thing) {
    open = thing;
    page = 0;
    target = null;
    keys.clear();
    saturn = thing.id === 'saturn';
    fitWindow();
    talk.hidden = false;
    talk.setAttribute('aria-label', thing.name);
    links.replaceChildren();
    if (thing.live) thing.live(thing);
    write();
  }

  function write() {
    if (page === 0) shown = [];
    pageStart = shown.length;
    const text = plain(open.pages[page]);
    said.textContent = text;
    queue = wrap(text);
    rowsTall(Math.min(3, pageStart + queue.length));
    links.replaceChildren();
    waiting = false;
    clearInterval(typing);
    clearInterval(blink);
    flash = false;
    if (still.matches) return done();
    let line = null, at = 0;
    typing = setInterval(() => {
      if (!line) {
        line = queue.shift();
        if (!line) return done();
        shown.push({ bullet: line.bullet, text: '' });
        at = 0;
      }
      at += 1;
      shown[shown.length - 1].text = line.text.slice(0, at);
      if (at >= line.text.length) line = null;
      render();
    }, 30);
    render();
  }

  /* the page all at once: whatever of it was typed, laid down whole */
  function done() {
    clearInterval(typing);
    typing = 0;
    queue = [];
    shown = shown.slice(0, pageStart).concat(wrap(plain(open.pages[page])));
    const lastPage = page >= open.pages.length - 1;
    waiting = !lastPage;
    if (waiting && !still.matches) {
      blink = setInterval(() => { flash = !flash; render(); }, 200);
    }
    if (lastPage && open.links) {
      open.links.forEach((link) => {
        const a = document.createElement('a');
        a.href = link.href;
        a.setAttribute('aria-label', link.label);
        a.append(badge(link.label, S, false));
        if (!link.href.startsWith('mailto:')) {
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
        }
        links.append(a);
      });
    }
    if (lastPage && open.extra) links.prepend(open.extra);
    render();
  }

  function next() {
    if (!open) return;
    if (typing) return done();
    if (page < open.pages.length - 1) {
      page += 1;
      return write();
    }
    close();
  }

  function close() {
    clearInterval(typing);
    clearInterval(blink);
    typing = 0;
    waiting = false;
    const was = open;
    open = null;
    talk.hidden = true;
    if (was && document.activeElement && talk.contains(document.activeElement)) was.el.focus();
  }

  addEventListener('resize', () => { if (open) { fitWindow(); render(); } });

  talk.addEventListener('click', (event) => {
    if (event.target.closest('a, button')) return;
    next();
  });

  /* keys */
  const DIRS = {
    ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
    a: 'left', d: 'right', w: 'up', s: 'down',
  };
  addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (open) {
      if (key === 'Escape') { event.preventDefault(); return close(); }
      if (key === 'Enter' || key === ' ' || key === 'z') {
        if (event.target.closest && event.target.closest('#talk a, #talk button')) return;
        event.preventDefault();
        next();
      }
      return;
    }
    if (DIRS[key]) {
      event.preventDefault();
      keys.add(DIRS[key]);
      return;
    }
    if (key === 'Enter' || key === ' ' || key === 'z') {
      /* a focused thing answers to its own click; this is for walking up */
      if (event.target.closest && event.target.closest('.thing')) return;
      const thing = nearest();
      if (thing) {
        event.preventDefault();
        faceToward(thing);
        act(thing);
      }
    }
  });
  addEventListener('keyup', (event) => {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (DIRS[key]) keys.delete(DIRS[key]);
  });
  addEventListener('blur', () => keys.clear());

  /* a click on the floor walks there */
  world.addEventListener('click', (event) => {
    if (open) return close();
    const box = world.getBoundingClientRect();
    target = { x: (event.clientX - box.left) / scale, y: (event.clientY - box.top) / scale };
  });

  addEventListener('resize', layout);
  layout();
  requestAnimationFrame(tick);

  /* live windows */
  /* The jukebox asks the Worker every 30 seconds while the tab is in front,
     which is as often as the Worker has anything new to say. While a song is
     actually playing it puts out notes. */
  const jukebox = THINGS.find((t) => t.id === 'jukebox');
  let song = null, noteTimer = 0, pollTimer = 0;

  async function poll() {
    try {
      const response = await fetch('https://now-playing.now-playing.workers.dev/', { cache: 'no-store' });
      if (!response.ok) throw new Error();
      const answer = await response.json();
      song = answer.track ? answer : null;
    } catch {
      song = null;
    }
    jukebox.pages = song
      ? [(song.playing ? '♪ Now playing: ' : '♪ Last played: ') + song.track + ' — ' + song.artist + '.']
      : ['The jukebox is quiet right now.'];
    jukebox.links = [{ label: 'On Last.fm', href: (song && song.url) || 'https://www.last.fm/user/kid_chino08' }];
    /* the record's cover, above the link, when Last.fm has one */
    jukebox.extra = null;
    if (song && song.art) {
      const cover = new Image();
      cover.src = song.art;
      cover.alt = song.album ? 'Cover of ' + song.album : '';
      cover.className = 'talk-cover';
      const row = document.createElement('span');
      row.className = 'talk-thumbs';
      row.append(cover);
      jukebox.extra = row;
    }
    playing(!!(song && song.playing));
  }

  function playing(on) {
    jukebox.el.classList.toggle('is-playing', on);
    if (on && !noteTimer) {
      musicNote();
      noteTimer = setInterval(musicNote, 900);
    } else if (!on && noteTimer) {
      clearInterval(noteTimer);
      noteTimer = 0;
    }
  }

  /* one note, up off the top of the jukebox, drifting and gone */
  let flip = false;
  function musicNote() {
    if (document.hidden) return;
    flip = !flip;
    const img = new Image();
    img.src = flip ? 'images/eb/note-a.png' : 'images/eb/note-b.png';
    img.alt = '';
    img.className = 'note' + (still.matches ? ' is-still' : '');
    const { h } = size(jukebox);
    const x = jukebox.x + (flip ? -6 : 4) + Math.round(Math.random() * 4 - 2);
    Object.assign(img.style, {
      left: x * scale + 'px',
      top: (jukebox.y - h - 4) * scale + 'px',
      width: (flip ? 7 : 5) * scale + 'px',
      zIndex: jukebox.y - 1,
    });
    img.style.setProperty('--drift', (flip ? -1 : 1) * Math.round(4 + Math.random() * 6) * scale + 'px');
    world.append(img);
    img.addEventListener('animationend', () => img.remove());
  }

  function keepPolling() {
    clearInterval(pollTimer);
    if (document.hidden) return;
    poll();
    pollTimer = setInterval(poll, 30000);
  }
  document.addEventListener('visibilitychange', keepPolling);
  keepPolling();

  async function nowPlaying(thing) {
    await poll();
    if (open === thing) { page = 0; write(); }
  }

  async function inspo(thing) {
    try {
      const response = await fetch(
        'https://api.are.na/v2/channels/inspo-syd5sijpqmk/contents?per=24&sort=position&direction=desc',
        { cache: 'no-store' },
      );
      if (!response.ok) return;
      const data = await response.json();
      const picks = (data.contents || [])
        .filter((b) => b.image && b.image.square && b.image.square.url)
        .slice(0, 4);
      if (!picks.length) return;
      const row = document.createElement('span');
      row.className = 'talk-thumbs';
      picks.forEach((b) => {
        const img = new Image();
        img.src = b.image.square.url;
        img.alt = '';
        row.append(img);
      });
      /* a fresh set replaces whatever set the window already shows */
      if (thing.extra) thing.extra.remove();
      thing.extra = row;
      if (open === thing && !typing && page === thing.pages.length - 1) links.prepend(row);
    } catch {
      /* the link still goes there */
    }
  }
})();
