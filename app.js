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


/* The row unit, solved from the box the work has to spend.

   Every row is a multiple of one unit u: the flanking rows carry --w 1 and the
   campaign carries 2.2, so the campaign is the middle and the biggest thing on
   the screen. Each picture keeps the ratio of its own file, so once a row has
   a height its width follows — which makes both directions solvable at once:

       height:  u * SUM(w) + gaps            <= H
       width:   SUM(ratio) * (u * w - padY)  <= W - gaps - padX   per row

   The narrowest answer wins, because it is the row that would otherwise run
   off the side. Nothing here reads a rendered size, so there is no
   circularity: the ratios, the gaps and the padding all come from computed
   styles, and the only measured input is the box itself. */
(function () {
  const group = document.getElementById('group');
  const view = document.getElementById('work');
  if (!group || !view) return;
  const rows = Array.from(group.children);
  if (!rows.length) return;

  const px = (v) => parseFloat(v) || 0;
  /* computed aspect-ratio comes back as "900 / 531" or "auto"; an <img> with
     width and height attributes reports its own, which is how the campaign's
     three are measured without a class each */
  function wideness(el) {
    const [w, h] = getComputedStyle(el).aspectRatio.split('/').map(parseFloat);
    return w > 0 && h > 0 ? w / h : 0;
  }

  function measure() {
    /* The section lays out even while it is down — visibility: hidden keeps a
       box — so this measures correctly either way. Zero means the stylesheet
       has not settled yet. */
    const box = getComputedStyle(view);
    /* A pixel of slack: every term below is fractional and a solve that spends
       the box exactly comes out a subpixel over, which is a scrollbar. */
    const height = view.clientHeight - px(box.paddingTop) - px(box.paddingBottom) - 1;
    const width = view.clientWidth - px(box.paddingLeft) - px(box.paddingRight);
    if (height <= 0 || width <= 0) return;

    const rowGap = px(getComputedStyle(group).rowGap) * (rows.length - 1);

    let weights = 0;
    let best = Infinity;
    rows.forEach((row) => {
      const style = getComputedStyle(row);
      const w = parseFloat(style.getPropertyValue('--w')) || 1;
      weights += w;

      const items = Array.from(row.children);
      let ratio = 0;
      items.forEach((item) => {
        /* the piece's shape is on the shot inside the figure, the ad's is on
           the ad itself */
        ratio += wideness(item.matches('.tile') ? item.firstElementChild : item);
      });
      if (ratio <= 0) return;

      const padY = px(style.paddingTop) + px(style.paddingBottom);
      const padX = px(style.paddingLeft) + px(style.paddingRight);
      const gaps = px(style.columnGap) * (items.length - 1);
      best = Math.min(best, (width - gaps - padX + ratio * padY) / (ratio * w));
    });
    if (!isFinite(best) || weights <= 0) return;

    /* and every row together can never be taller than the box */
    best = Math.min(best, (height - rowGap) / weights);
    if (best <= 0) return;

    view.style.setProperty('--u', Math.floor(best) + 'px');
  }

  measure();
  onResize(measure);
  /* the pictures carry width and height attributes, so their ratios are known
     before they load; this is for the case where one does not */
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
})();
