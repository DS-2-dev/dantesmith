/* Everything the page does. Loaded as a module, so this file has its own scope
   and needs no wrapper — nothing here reaches the global object.

   Two shared helpers, then three blocks: the card tooltips, the name cards, and
   the game. */
/* While the game is on, everything that answers to a pointer stands down,
   because the pointer is a paddle. */
const playing = () => document.body.classList.contains('is-playing');

/* Resize, coalesced to one call a frame.

   Three separate things on this page re-measure when the window changes, and
   all three read layout and then write to it. Bound to resize directly that is
   a forced reflow per listener per event, and resize fires for every frame of
   a window drag — the fit pass alone can walk fifteen reflows in one call.
   Folding each listener into a rAF means the work happens once per frame at
   most, and it happens just before paint, when the layout is being done
   anyway. Trailing rather than leading: mid-drag the intermediate sizes are
   not worth measuring, the one the drag stops at is. */
function onResize(fn) {
  let queued = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(queued);
    queued = requestAnimationFrame(fn);
  });
}

/* Where a panel of a given size wants to sit for a given pointer position:
   beside the cursor, flipped above it near the bottom edge, and held inside
   the window. Both of the things that follow the pointer on this page — the
   card tooltip and the name cards — place themselves exactly this way and
   differ only in how far off the cursor they sit, so the arithmetic is
   written once. Pure: it reads a size and returns a position. */
function beside(event, w, h, off) {
  const pad = 12;
  let x = event.clientX + off;
  let y = event.clientY + off;
  if (y + h + pad > window.innerHeight) y = event.clientY - h - off;
  x = Math.min(Math.max(x, pad), Math.max(window.innerWidth - w - pad, pad));
  y = Math.min(Math.max(y, pad), Math.max(window.innerHeight - h - pad, pad));
  return [x, y];
}

/* A panel that follows the pointer. Both of the ones on this page behave the
   same way — appear placed rather than sliding in from wherever they were last,
   glide with the cursor while up, and hold for a beat on the way out so
   crossing a gap between two targets is a glide and not a blink — so that
   behaviour is written once and each caller supplies only what goes inside.

   `fill` returns true when the content actually changed, which is when the
   panel has to be re-measured. Size is cached rather than read off the element
   per pointermove: a layout read every frame is the other thing that makes one
   of these feel heavy. */
function follower(el, off) {
  let hold;
  let w = 0;
  let h = 0;

  function place(x, y) {
    el.style.setProperty('--tip-x', x + 'px');
    el.style.setProperty('--tip-y', y + 'px');
  }
  function measure() {
    w = el.offsetWidth;
    h = el.offsetHeight;
  }
  function at(event) { return beside(event, w, h, off); }
  function follow(event) {
    const to = at(event);
    place(to[0], to[1]);
  }
  /* Placed before it is shown, with the glide suppressed for that one frame —
     otherwise the first appearance slides in from wherever the last target
     left it. */
  function show() {
    clearTimeout(hold);
    if (!el.classList.contains('is-on')) {
      el.classList.add('is-placing');
      void el.offsetWidth;
      requestAnimationFrame(() => el.classList.remove('is-placing'));
    }
    el.classList.add('is-on');
  }
  function hide(after) {
    clearTimeout(hold);
    hold = setTimeout(() => {
      el.classList.remove('is-on');
      if (after) after();
    }, 140);
  }
  /* Tracked from the document, not from each target. Targets have gaps between
     them and sit flush against each other respectively, and either way a
     per-target listener stops firing the moment the pointer crosses an edge —
     the panel froze there and then jumped when the next one picked it up. */
  document.addEventListener('pointermove', (event) => {
    if (el.classList.contains('is-on')) follow(event);
  });

  return {
    /* the pointer path: content, then position, then up */
    open(event) { show(); follow(event); },
    /* and the one with no cursor to sit beside — centred on the element it
       belongs to, by subtracting half its own size rather than by a translate,
       which is spoken for by the glide */
    openOver(box) {
      show();
      place(box.left + box.width / 2 - w / 2, box.top + box.height / 2 - h / 2);
    },
    hide,
    measure,
    follow,
  };
}


(function () {
  const cards = Array.from(document.querySelectorAll('.work-card'));
  if (!cards.length) return;

  const panel = document.createElement('div');
  panel.className = 'work-tip-panel';
  panel.setAttribute('aria-hidden', 'true');
  const words = document.createElement('span');
  panel.appendChild(words);
  document.body.appendChild(panel);

  /* Behaves like a chart tooltip: the words and the box change at once, and the
     only thing that eases is where it sits. That is the opposite of a
     cross-fade, and it is why this reads smooth where the fade did not —
     nothing is ever caught halfway between two sentences.

     One panel for every card, not one each. The per-card spans stay in the
     markup as the accessible description aria-describedby points at; this is
     what is actually drawn. */
  const tip = follower(panel, 16);
  let said = '';
  function say(text) {
    if (text === said) return;
    said = text;
    words.textContent = text;
    tip.measure();
  }
  const forget = () => tip.hide(() => { said = ''; });

  cards.forEach((card) => {
    const hit = card.querySelector('.work-open');
    const span = card.querySelector('.work-tip');
    if (!hit || !span) return;
    /* A card that turns over says it on its own back, so it gets no tooltip —
       one behaviour per hover. In practice that leaves Weave alone, the one
       card that does not turn. The span stays in the markup either way. */
    if (card.querySelector('.work-flip')) return;
    const text = span.textContent.trim();

    hit.addEventListener('pointerenter', (event) => {
      if (playing()) return;
      say(text);
      tip.open(event);
    });
    hit.addEventListener('pointerleave', forget);
    hit.addEventListener('focus', () => {
      say(text);
      tip.openOver(card.getBoundingClientRect());
    });
    hit.addEventListener('blur', forget);

    /* For the pointer that has no hover: a tap would otherwise light the tip up
       and leave it lit, so a timer takes it back down. */
    let timer;
    hit.addEventListener('click', (event) => {
      say(text);
      /* a real tap carries coordinates; a click from the keyboard does not */
      if (event.clientX || event.clientY) tip.open(event);
      else tip.openOver(card.getBoundingClientRect());
      clearTimeout(timer);
      timer = setTimeout(forget, 2600);
    });
  });
})();


/* Breakout, where the bricks are the portfolio. Nothing is duplicated into
   the game: the ball is tested against the live getBoundingClientRect of
   the real cards and the real paragraphs, and knocking one out puts a class
   on that element. The canvas draws two things, the ball and the paddle.

   Which is also why the page must not reflow when a brick goes: the rects
   are read once at the start, and a card that took its space with it would
   leave every rect below it pointing at nothing. .is-hit fades and offsets,
   it never removes. */
(function () {
  const toggle = document.getElementById('play');
  const canvas = document.getElementById('pong');
  const score = document.getElementById('score');
  const prize = document.getElementById('prize');
  if (!toggle || !canvas) return;
  const ctx = canvas.getContext('2d');

  /* The cards, and the copy beside them. Paragraph by paragraph rather than
     block by block — a whole column of text going out to one hit is no fun,
     and a single line is about a card's worth of target. */
  /* A card is one brick, not three. Targeting its caption and its icon row
     separately emptied the card out and left the white slab standing, which
     looks like a bug rather than a hit. `.prose` never appears inside a card,
     so nothing here nests. */
  const BRICKS = '.work-card, .wordmark, .lede, .prose, .card';
  const PAD_W = 180;
  const PAD_H = 9;
  /* 44 and not 30, so the strip under the paddle is tall enough to park the
     label in. Nothing else depends on it. */
  const PAD_UP = 44;      /* paddle's distance off the bottom edge */
  const R = 7;            /* ball radius */
  /* Tuned by simulation, not by feel: 40 boards x 3 tracking lags, counting
     how many ended in a miss. At 7.6 with a 118px paddle it was 63% lost,
     which is a toy nobody finishes. 6.2 over 180px is 19% lost and 79%
     cleared, median 83s. The ramp went UP to 1.15 at the same time — the
     slower start is what you feel, the endgame still needs to be brisk, and
     the two are independent. Top speed lands about where it was. */
  /* Was 6.2, which was tuned against a 118px paddle before the paddle grew to
     180. At 60Hz that read as 372px a second — a ball taking most of three
     seconds to cross the screen — and it only ever felt right on a 120Hz panel
     because the loop was running at the refresh rate. Now that dt has pinned
     the rate, this is the one number that sets it: multiply by 60 for pixels
     per second. The wider paddle absorbs the difference. */
  const SPEED = 9.0;      /* px per 60Hz frame at the start, at the tuning size */
  const RAMP = 1.15;      /* and how much faster with the last brick left */
  /* Arrow-key travel, px per frame before the width scaling below. The mouse
     is instant and the keyboard cannot be, so this is the one number that
     decides whether the keys feel like a control or like a drag: 13 crosses a
     1440px window in about a second and a half, which is quicker than the ball
     can cross it and therefore always recoverable. */
  const KEY_SPEED = 13;
  /* Both of the numbers above are pixels, and pixels are not the same thing on
     every screen. A ball crossing a 720px window at 6.2px per frame gets there
     in 116 frames; the same ball on a 1080px window takes 174, so the tuned
     game felt brisk on a laptop and sluggish on a monitor, and the paddle was a
     smaller share of a wider screen into the bargain.

     Both now scale with the window, off 1440x900 where the difficulty was
     simulated. Height drives the ball because the ball's rhythm is the trip
     down to the paddle; width drives the paddle because that is the axis it
     covers. The 0.7 exponent is deliberate — at 1.0 a big screen plays exactly
     like a small one, which is correct and boring; at 0.7 a bigger screen is a
     little faster, which is what a bigger screen should feel like. */
  const REF_H = 900;
  const REF_W = 1440;
  const pace = () => Math.min(Math.max((innerHeight / REF_H) ** 0.7, 0.9), 1.45);
  const padWidth = () => PAD_W * Math.min(Math.max((innerWidth / REF_W) ** 0.7, 0.85), 1.4);

  let on = false;
  let raf = 0;
  let bricks = [];
  let struck = [];
  let ball = { x: 0, y: 0, vx: 0, vy: 0 };
  let total = 0;
  let padX = 0;
  /* Two ways to drive the paddle, and only one of them can be in charge at a
     time or they fight: the pointer sets an absolute position every frame, so
     a held arrow key would be dragged straight back to wherever the mouse was
     last resting. Whichever device moved last wins, and pressing an arrow
     drops pointerX to null to hand over. Moving the mouse takes it back. */
  let pointerX = null;
  let last = 0;
  let acc = 0;
  let prevX = 0;
  let prevY = 0;
  let dirtyBall = null;
  let drawnX = 0;
  let drawnY = 0;
  let drawn = false;
  let dirtyPad = null;
  const held = new Set();

  function size() {
    /* setting width or height blanks the canvas, so anything remembered about
       what is currently painted on it is now wrong */
    dirtyBall = null;
    dirtyPad = null;
    drawn = false;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
    canvas.style.width = innerWidth + 'px';
    canvas.style.height = innerHeight + 'px';
    /* draw in CSS pixels and let the transform handle the density, so every
       number below is the same number the layout is using */
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function collect() {
    bricks = Array.from(document.querySelectorAll(BRICKS)).map((el) => {
      const r = el.getBoundingClientRect();
      return { el, x: r.left, y: r.top, w: r.width, h: r.height };
    /* an empty inline or a collapsed block is not a target */
    }).filter((b) => b.w > 10 && b.h > 6);
    total = bricks.length;
  }

  /* Faster as the board empties. Without it the last two or three bricks
     are a long walk — the ball spends most of a minute crossing an empty
     screen to reach one line of text in the corner. Read at the paddle, so
     it steps up each time you return the ball rather than drifting. */
  function speed() {
    return SPEED * pace() * (1 + RAMP * (1 - bricks.length / Math.max(total, 1)));
  }

  function serve() {
    const y = innerHeight - PAD_UP - PAD_H - R - 2;
    /* off to one side, never straight up: a vertical serve just bounces
       between the paddle and one brick until you move */
    const angle = (Math.random() * 0.5 + 0.25) * Math.PI;
    const sp = SPEED * pace();
    ball = { x: padX, y, vx: Math.cos(angle) * sp, vy: -Math.abs(Math.sin(angle) * sp) };
    /* or the first frame would draw it streaking in from the last ball's grave */
    prevX = ball.x;
    prevY = ball.y;
    drawn = false;
  }

  function tally() {
    if (score) score.textContent = (total - bricks.length) + ' / ' + total;
  }

  /* is-hit is an animation and so is .reveal, so this needs no bookkeeping —
     the later rule simply wins and the card leaves the same way a paragraph
     does. See the knockout keyframes for why it cannot be a transition. */
  function knock(b) {
    b.el.classList.remove('is-back');
    b.el.classList.add('is-hit');
    struck.push(b.el);
    tally();
  }

  function restore() {
    struck.forEach((el) => {
      el.classList.remove('is-hit');
      /* rises back in rather than snapping on. The class comes off again after,
         or a second game would find it still there and skip the animation. */
      el.classList.add('is-back');
      el.addEventListener('animationend', function off() {
        el.classList.remove('is-back');
        el.removeEventListener('animationend', off);
      });
    });
    struck = [];
  }

  /* Circle against box. The axis with the shallower overlap is the one the
     ball came in on, so that is the one that flips — testing the corner
     case any other way lets a ball clip along a card's edge and tunnel. */
  function hits(b) {
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const dx = ball.x - cx;
    const dy = ball.y - cy;
    const ox = b.w / 2 + R - Math.abs(dx);
    const oy = b.h / 2 + R - Math.abs(dy);
    if (ox <= 0 || oy <= 0) return false;
    if (ox < oy) {
      ball.vx = Math.abs(ball.vx) * Math.sign(dx);
      ball.x += Math.sign(dx) * ox;
    } else {
      ball.vy = Math.abs(ball.vy) * Math.sign(dy);
      ball.y += Math.sign(dy) * oy;
    }
    return true;
  }

  /* One physics tick, dt in 60Hz frames — the unit everything above is tuned
     in. Always called with the same dt, which is the whole point: see step. */
  function advance(dt) {
    const padY = innerHeight - PAD_UP - PAD_H;
    const pad = padWidth();
    if (pointerX !== null) {
      padX = pointerX;
    } else if (held.size) {
      /* Scaled by the same factor as the paddle, so the keys cover the same
         share of the screen on a laptop as on a monitor. Both keys at once
         cancel out, which is what holding both should do. */
      const dir = (held.has('ArrowRight') ? 1 : 0) - (held.has('ArrowLeft') ? 1 : 0);
      padX += dir * KEY_SPEED * (pad / PAD_W) * dt;
    }
    padX = Math.min(Math.max(padX, pad / 2), innerWidth - pad / 2);

    /* Where it was before this tick, so the frame can be drawn between two
       ticks rather than snapped to whichever one happened last. */
    prevX = ball.x;
    prevY = ball.y;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    if (ball.x < R) { ball.x = R; ball.vx = Math.abs(ball.vx); }
    if (ball.x > innerWidth - R) { ball.x = innerWidth - R; ball.vx = -Math.abs(ball.vx); }
    if (ball.y < R) { ball.y = R; ball.vy = Math.abs(ball.vy); }

    /* Paddle. Where it lands on the face steers the bounce, so the paddle
       is a control and not just a wall — dead centre goes straight back,
       the ends throw it wide. Renormalised to SPEED afterwards, or angling
       it would quietly make the ball faster. */
    if (ball.vy > 0 &&
        ball.y + R >= padY && ball.y - R <= padY + PAD_H &&
        ball.x >= padX - pad / 2 - R && ball.x <= padX + pad / 2 + R) {
      ball.y = padY - R;
      const off = Math.max(-1, Math.min(1, (ball.x - padX) / (pad / 2)));
      let a = off * 1.05;                         /* up to 60deg either way */
      /* Never straight back up. A player who tracks the ball well keeps
         hitting it dead centre, which returns it vertical, which bounces it
         between the paddle and the one brick overhead forever — the better
         you are the sooner you deadlock. 0.16rad is the floor. */
      if (Math.abs(a) < 0.16) a = 0.16 * (Math.sign(a) || 1);
      const sp = speed();
      ball.vx = Math.sin(a) * sp;
      ball.vy = -Math.cos(a) * sp;
    }

    /* one brick per frame: taking two at once off a single corner reads as
       a bug, and the ball has already been pushed clear of the first */
    for (let i = 0; i < bricks.length; i++) {
      if (hits(bricks[i])) { knock(bricks[i]); bricks.splice(i, 1); break; }
    }

    if (ball.y - R > innerHeight) { stop(); return; }
    /* Cleared. The board stays down and the prize goes up over it — the page
       is empty at this point, which is the whole picture. */
    if (!bricks.length) { stop({ keep: true }); win(); return; }

  }

  function draw() {
    const padY = innerHeight - PAD_UP - PAD_H;
    const pad = padWidth();
    /* Drawn between the last tick and the next one, not on the last one.

       A fixed step alone still judders: a frame gets whatever whole number of
       ticks fitted into it, so one frame advances two ticks and the next
       three, and the ball moves in uneven jumps even though every tick is
       identical. acc is the time already banked toward the tick that has not
       run yet, so acc / TICK is how far between the two the frame actually
       falls. Drawing there puts the ball where it really is at this instant. */
    const alpha = acc / TICK;
    const bx = prevX + (ball.x - prevX) * alpha;
    const by = prevY + (ball.y - prevY) * alpha;

    /* Clear what was painted, not the window.

       The canvas is the full viewport at up to 2x, which on a 16-inch retina
       screen is about seven million pixels. Clearing all of them every frame
       to draw a dot and a bar is most of the frame's work, and it is the kind
       of cost that does not show up on a fast machine until something else
       wants the GPU — at which point the ball starts hitching. These two rects
       are a few thousand pixels between them. 2px of margin because the ball
       is drawn antialiased and its edge bleeds a fraction past its radius. */
    const m = 2;
    if (dirtyBall) ctx.clearRect(dirtyBall[0], dirtyBall[1], dirtyBall[2], dirtyBall[3]);
    if (dirtyPad) ctx.clearRect(dirtyPad[0], dirtyPad[1], dirtyPad[2], dirtyPad[3]);

    /* Draw the path it swept this frame, not the point it landed on.

       This is the last thing that reads as stutter once the timing is right,
       and it is not a timing problem at all. At 600px a second a 60Hz frame
       moves the ball about ten pixels while the ball is only fourteen across,
       so two consecutive frames barely overlap and the eye gets a dot being
       teleported rather than something travelling. A round-capped line from
       where it was drawn last frame to where it is drawn now covers the whole
       path it actually took, which is what a camera would have caught and what
       reads as motion. It costs nothing: at low speed the line collapses to
       the same circle it would have drawn anyway.

       Skipped over a jump. Nothing should move half the screen in one frame,
       so a gap that big is a serve or a resize rather than travel, and joining
       the two ends would paint a bar across the page. */
    const sx = drawn ? drawnX : bx;
    const sy = drawn ? drawnY : by;
    const far = Math.hypot(bx - sx, by - sy);
    const streak = drawn && far > 0.5 && far < innerWidth / 3;

    ctx.fillStyle = '#ffffff';
    if (streak) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = R * 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(bx, by);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(bx, by, R, 0, Math.PI * 2);
      ctx.fill();
    }

    /* the swept box, so the clear above covers the streak and not just its
       head — a rect around the ball alone would leave the tail painted */
    const lo = R + m;
    dirtyBall = streak
      ? [Math.min(sx, bx) - lo, Math.min(sy, by) - lo,
         Math.abs(bx - sx) + lo * 2, Math.abs(by - sy) + lo * 2]
      : [bx - lo, by - lo, lo * 2, lo * 2];
    dirtyPad = [padX - pad / 2 - m, padY - m, pad + m * 2, PAD_H + m * 2];
    drawnX = bx;
    drawnY = by;
    drawn = true;
    ctx.beginPath();
    /* roundRect is recent enough that a browser without it is worth a
       square paddle rather than a thrown error and a blank canvas */
    if (ctx.roundRect) ctx.roundRect(padX - pad / 2, padY, pad, PAD_H, PAD_H / 2);
    else ctx.rect(padX - pad / 2, padY, pad, PAD_H);
    ctx.fill();
  }

  /* A fixed timestep, and this is what stops the ball looking jittery.

     Feeding the raw frame delta straight into the physics looks wrong even
     when the average speed is right: rAF deltas wander about 16% either side
     of their mean, so the ball covers a visibly different distance every
     frame. Time goes into an accumulator instead and is spent in identical
     TICK-sized steps, so every step moves the ball exactly as far as the last
     one. Whatever is left over stays in the accumulator for the next frame.

     240Hz because the leftover is the one error this cannot remove — the ball
     is drawn wherever the last whole tick left it, up to one tick behind. At
     240 that is under three pixels at this speed, which is not a thing anyone
     can see, and the physics is a dozen arithmetic ops so the extra ticks cost
     nothing. It also stops the ball tunnelling: shorter steps mean it can no
     longer skip past a thin brick between two frames. */
  const TICK = 1000 / 240;
  const TICK_DT = TICK / 16.667;

  function step(now) {
    raf = requestAnimationFrame(step);
    const t = now || performance.now();
    /* Capped at a tenth of a second. A backgrounded tab stops painting and
       comes back with a huge delta; without the cap the catch-up would run
       hundreds of ticks in one frame and freeze the page to do it. */
    acc += Math.min(t - (last || t), 100);
    last = t;
    while (acc >= TICK) {
      acc -= TICK;
      advance(TICK_DT);
      /* advance can end the game — stop() has already cancelled the frame and
         cleared the canvas by then, so there is nothing left to draw. */
      if (!on) return;
    }
    draw();
  }

  function start() {
    on = true;
    document.body.classList.add('is-playing');
    /* The keys are worth naming here. Nothing else on the board says they
       exist, and a control nobody can find is not a control. */
    toggle.textContent = 'Arrows or mouse — Esc to Stop';
    size();
    collect();
    tally();
    padX = pointerX === null ? innerWidth / 2 : pointerX;
    serve();
    cancelAnimationFrame(raf);
    last = 0;
    acc = 0;
    raf = requestAnimationFrame(step);
  }

  /* `keep` leaves the knocked-out bricks down. Only the win passes it, and only
     until the prize is dismissed. */
  function stop(opts) {
    on = false;
    held.clear();
    cancelAnimationFrame(raf);
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    document.body.classList.remove('is-playing');
    toggle.textContent = 'Click to Play';
    if (!(opts && opts.keep)) restore();
  }

  function win() {
    if (!prize) { restore(); return; }
    prize.classList.add('is-on');
    /* stop() has already put the invitation back, but the board is still down
       and the prize is still up — from here the control is the way out of that,
       not the way into another game. */
    toggle.textContent = 'Back to site...';
  }

  /* Returns whether it had anything to clear, so the two controls below can
     hand off to it without either of them meaning two things at once. */
  function clearPrize() {
    if (!prize || !prize.classList.contains('is-on')) return false;
    prize.classList.remove('is-on');
    toggle.textContent = 'Click to Play';
    restore();
    return true;
  }

  /* From the document, so the paddle keeps tracking over a card rather than
     stalling wherever the pointer crossed one. */
  document.addEventListener('pointermove', (event) => { pointerX = event.clientX; });
  toggle.addEventListener('click', () => {
    if (clearPrize()) return;
    if (on) stop(); else start();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (clearPrize()) return;
      if (on) stop();
      return;
    }
    if (!on) return;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    /* Only while playing. Off the board these are the reader's keys — they
       scroll a window too narrow to fit the page and step through focus — and
       taking them would be worse than not offering them at all. */
    event.preventDefault();
    held.add(event.key);
    pointerX = null;
  });
  document.addEventListener('keyup', (event) => { held.delete(event.key); });
  /* A key held while the window goes away never sends its keyup, and the
     paddle would still be travelling when you came back. */
  window.addEventListener('blur', () => held.clear());
  /* every rect moves when the window does, and a stale set of them is a
     ball bouncing off things that are not there */
  onResize(() => {
    if (!on) return;
    size();
    collect();
  });
})();

/* Name cards. Hovering a group of letters in the wordmark puts a picture beside
   the pointer. Same follower as the tooltips, and a bigger offset because this
   panel is a card rather than a line of text — the four faces are already in the
   document, so swapping one for another is instant and never flashes an empty
   frame. */
(function () {
  const el = document.getElementById('name-card');
  const parts = Array.from(document.querySelectorAll('.wordmark-part'));
  if (!el || !parts.length) return;

  const faces = new Map();
  el.querySelectorAll('.name-card-face').forEach((face) => {
    faces.set(face.dataset.nameCard, face);
  });

  const card = follower(el, 18);
  let shown = null;
  /* The width changes with the picture, so the measurement has to happen after
     the swap and before the first placement — otherwise the first frame is
     clamped against the last face's width. */
  function show(key) {
    if (key === shown) return;
    const face = faces.get(key);
    if (!face) return;
    if (shown) faces.get(shown).classList.remove('is-shown');
    face.classList.add('is-shown');
    shown = key;
    card.measure();
  }

  parts.forEach((part) => {
    part.addEventListener('pointerenter', (event) => {
      if (playing()) return;
      show(part.dataset.nameCard);
      card.open(event);
    });
    part.addEventListener('pointerleave', () => card.hide());
  });
})();

/* The cluster's width, measured rather than solved by hand.

   The cards have fixed aspect ratios, so the cluster's height is a multiple of
   its column width — which means a height budget can be spent as a width. That
   multiple is the tallest column: the sum of 1/aspect over its cards, plus the
   gap between them, plus the step an even column is offset by. The stylesheet
   carries the answer as a fallback so the first paint and a no-JS visit are
   both right, but the answer is a constant, and a constant goes stale the
   moment a card moves column or a new one lands. This re-derives it from the
   cards actually on the page and writes it back as --cluster-cap.

   Nothing here reads a rendered width, so there is no circularity: aspect
   ratios and gaps come from the computed styles, and the only measured input
   is how much height the column has to spend. */
(function () {
  const grid = document.querySelector('.work-grid--cluster');
  const work = document.querySelector('.work');
  if (!grid || !work) return;
  const cols = Array.from(grid.children);
  if (!cols.length) return;

  const px = (v) => parseFloat(v) || 0;
  /* computed aspect-ratio comes back as "4 / 3" or "auto"; height per unit of
     width is the inverse of it */
  function tallness(card) {
    const raw = getComputedStyle(card).aspectRatio;
    const [w, h] = raw.split('/').map((n) => parseFloat(n));
    return w > 0 && h > 0 ? h / w : 0;
  }

  function measure() {
    const gridStyle = getComputedStyle(grid);
    const colGap = px(gridStyle.columnGap);
    const step = px(gridStyle.getPropertyValue('--step'));
    /* A cluster pressed against the top and bottom of its own column reads as
       something that did not fit. The stylesheet lowers this allowance in its
       compact one-screen mode; clientHeight already excludes the footer band,
       so nothing here has to know about it. */
    const slack = px(gridStyle.getPropertyValue('--cluster-slack'));
    const budget = work.clientHeight - slack;
    if (budget <= 0) return;

    let worst = 0;
    cols.forEach((col, i) => {
      const cards = Array.from(col.querySelectorAll('.work-card'));
      if (!cards.length) return;
      const rowGap = px(getComputedStyle(col).rowGap);
      const tall = cards.reduce((sum, c) => sum + tallness(c), 0);
      const fixed = rowGap * (cards.length - 1) + (i % 2 ? step : 0);
      if (tall <= 0) return;
      /* the column width this column could afford on its own */
      worst = worst === 0 ? (budget - fixed) / tall
                          : Math.min(worst, (budget - fixed) / tall);
    });
    if (worst <= 0) return;
    const width = worst * cols.length + colGap * (cols.length - 1);
    grid.style.setProperty('--cluster-cap', Math.round(width) + 'px');
  }

  measure();
  onResize(measure);
  /* the display faces arrive after first paint and can change a card's height
     through its title; re-measure once they are in */
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
})();

/* The bio column, made to fit. Its content is fixed copy on a screen of unknown
   height, and past a certain point the two do not agree — the column used to
   take a scroll for that, which meant the contact details were below the fold
   on a laptop and nobody would ever see them.

   Everything in the column is written as a multiple of --bio-scale, so one
   number shrinks all of it together: type, gaps, the marks, the name. This
   walks that number down until the content stops overflowing. Down to 0.72 —
   below that the copy stops being copy, and the column keeps its scrollbar as
   the honest last resort. */
(function () {
  const bio = document.querySelector('.bio');
  if (!bio) return;
  /* Was 0.72, then 0.58. Each step down has been paid for by something added
     to the column, and this one is the deposit control: at 1024x600 the layout
     had no slack left and the button put it ten pixels over. The floor is not
     a budget to keep spending — the next thing added here should come out of
     the copy instead. */
  const FLOOR = 0.56;
  const STEP = 0.02;

  const over = () => bio.scrollHeight > bio.clientHeight + 1;

  function fit() {
    /* Measure in the locked layout, every pass. Releasing it makes the column
       exactly as tall as its content, which reads as "fits" and would lock it
       again on the next pass — a flip-flop rather than a measurement. */
    document.body.classList.remove('is-overflowing');
    let s = 1;
    bio.style.setProperty('--bio-scale', s);
    /* scrollHeight against clientHeight is the overflow, and reading it forces
       the layout each pass — which is the point, and why the caller is behind
       onResize rather than on the event itself */
    while (s > FLOOR && over()) {
      s = Math.round((s - STEP) * 100) / 100;
      bio.style.setProperty('--bio-scale', s);
    }
    /* Floor reached and still too tall. The column's scrollbar is hidden, so
       leaving the overflow in there is content silently cut off — the one
       outcome worse than scrolling. Hand the scroll to the page instead, which
       is the same answer the phone layout gives one breakpoint down. */
    document.body.classList.toggle('is-overflowing', over());
  }

  fit();
  onResize(fit);
  /* the display faces arrive after first paint and change how the copy wraps */
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
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
      : 'Press could not copy. The address is ' + text;
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
