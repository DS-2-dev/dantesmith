/* Everything the page does. Loaded as a module, so this file has its own scope
   and needs no wrapper — nothing here reaches the global object.

   The previous script is on the makeover branch: the game, the pointer-following
   panels and the name cards all live there and can be brought across one block
   at a time. This file is what the page needs today. */

/* Resize, coalesced to one call a frame.

   Anything that re-measures on a resize reads layout and then writes to it.
   Bound to the event directly that is a forced reflow per listener per event,
   and resize fires for every frame of a window drag. Folding each listener
   into a rAF means the work happens once per frame at most, and just before
   paint, when the layout is being done anyway. Trailing rather than leading:
   mid-drag the intermediate sizes are not worth measuring, the one the drag
   stops at is. */
function onResize(fn) {
  let queued = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(queued);
    queued = requestAnimationFrame(fn);
  });
}


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


/* The cluster's width, solved from the height it has to spend.

   The pieces have fixed aspect ratios, so a column's height is a multiple of
   its own width plus the parts that do not scale — the caption strips, the
   gaps between stacked cards, and the step an even column carries. That makes
   a height budget spendable as a width:

       w = (H - fixed) / (sum of the column's height-per-width ratios)

   solved for every column, and the narrowest answer wins because it is the
   column that would otherwise overflow. Width caps it too: four columns and
   three gaps cannot exceed the box.

   Nothing here reads a rendered width, so there is no circularity. The ratios
   and the gaps come from computed styles and the only measured inputs are the
   box and the caption, which is type and so does not scale with w. */
(function () {
  const cluster = document.getElementById('cluster');
  const view = document.getElementById('work');
  if (!cluster || !view) return;
  const cols = Array.from(cluster.children);
  if (!cols.length) return;

  const px = (v) => parseFloat(v) || 0;
  /* computed aspect-ratio comes back as "4 / 3" or "auto"; height per unit of
     width is the inverse of it */
  function tallness(shot) {
    const [w, h] = getComputedStyle(shot).aspectRatio.split('/').map(parseFloat);
    return w > 0 && h > 0 ? h / w : 0;
  }

  function measure() {
    /* The section is display:none-adjacent while it is down — visibility
       hidden still lays out, so this measures correctly either way, but a box
       of zero means the stylesheet has not settled yet. */
    const box = getComputedStyle(view);
    /* A pixel of slack. Every term below is fractional and the answer is
       floored, but the caption is type and lands on a subpixel, so a solve
       that spends the box exactly comes out two or three pixels over and the
       section takes a scrollbar it is not supposed to have. */
    const height = view.clientHeight - px(box.paddingTop) - px(box.paddingBottom) - 1;
    const width = view.clientWidth - px(box.paddingLeft) - px(box.paddingRight);
    if (height <= 0 || width <= 0) return;

    const colGap = px(getComputedStyle(cluster).columnGap);

    let best = Infinity;
    cols.forEach((col, i) => {
      const tiles = Array.from(col.children);
      if (!tiles.length) return;
      const style = getComputedStyle(col);
      const rowGap = px(style.rowGap);
      /* The step off the column's own resolved margin, not off --step.
         getPropertyValue hands back the custom property as it was authored —
         "2.5rem" — and parseFloat reads that as 2.5, so the stepped columns
         were being solved as if they carried two and a half pixels instead of
         forty, and the cluster came out a few pixels over its box every time. */
      let ratio = 0;
      let fixed = rowGap * (tiles.length - 1) + px(style.marginTop);
      tiles.forEach((tile) => {
        ratio += tallness(tile.querySelector('.tile-shot'));
        /* A tile is its picture and nothing else today. Anything set under one
           is type, so it does not scale with w and belongs in the fixed term —
           measured off the rect rather than offsetHeight, which rounds a
           fractional line box down and hands the solve height that is not
           there. Kept because a caption is the obvious thing to put back. */
        const cap = tile.querySelector('.tile-cap');
        if (cap) {
          fixed += cap.getBoundingClientRect().height
                 + px(getComputedStyle(tile).rowGap);
        }
      });
      if (ratio <= 0) return;
      best = Math.min(best, (height - fixed) / ratio);
    });
    if (!isFinite(best)) return;

    /* and it can never be wider than the box it sits in */
    best = Math.min(best, (width - colGap * (cols.length - 1)) / cols.length);
    if (best <= 0) return;

    cluster.style.setProperty('--cluster-w',
      Math.floor(best * cols.length + colGap * (cols.length - 1)) + 'px');
  }

  measure();
  onResize(measure);
  /* the caption is type, and its height is not final until the face is in */
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
})();
