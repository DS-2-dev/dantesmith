/* Everything the page does. Loaded as a module, so this file has its own scope
   and needs no wrapper — nothing here reaches the global object.

   The previous script is on the makeover branch: the game, the pointer-following
   panels and the name cards all live there and can be brought across one block
   at a time. This file is what the page needs today. */


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


/* The mark's glass, only while something is under it.

   A section scrolls inside itself, and at rest its content starts a little
   below the mark; a few pixels of scroll and it is running beneath the
   letters. So <body> carries is-under while the section that is up has
   scrolled at all past that little margin, and the stylesheet fades the
   glass in on that. Checked again whenever the view changes, since the
   section being opened may already be scrolled from a visit before. */
(function () {
  const body = document.body;
  const views = Array.from(document.querySelectorAll('.view'));
  /* at rest the content clears the mark by 1.25rem; glass comes up just
     before the first line reaches it */
  const REACH = 12;

  function update() {
    const view = views.find((section) => section.id === body.dataset.view);
    body.classList.toggle('is-under', !!view && view.scrollTop > REACH);
  }

  views.forEach((view) => view.addEventListener('scroll', update, { passive: true }));
  new MutationObserver(update).observe(body, { attributes: true, attributeFilter: ['data-view'] });
  update();
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


/* Now playing, from Last.fm.

   Spotify scrobbles every track to Last.fm, and Last.fm marks the one playing
   right now, so the latest scrobble is either what is on or what was on
   last. Asked once on load and every 30 seconds after, and only while the
   tab is in front: a tab in the background has nobody to show it to.

   The API key, not the shared secret. This is a public read that needs no
   signing, and anything in this file is readable by whoever opens it; the
   secret has no business in a file that is served. */
(function () {
  const card = document.getElementById('listening');
  if (!card) return;

  const USER = 'kid_chino08';
  const KEY = '64e3ff29b84b494f673f592156b60a9c';
  const ENDPOINT = 'https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks'
    + '&user=' + encodeURIComponent(USER) + '&api_key=' + KEY + '&format=json&limit=1';
  const EVERY = 30000;
  /* Last.fm's own grey star, sent for a track it has no art for */
  const NO_ART = '2a96cbd8b46e442fc41c2b86b821562f';

  const art = card.querySelector('.listening-art');
  const label = card.querySelector('.listening-label');
  const title = card.querySelector('.listening-title');
  const artist = card.querySelector('.listening-artist');
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
  function ago(uts) {
    const minutes = Math.max(0, Math.round((Date.now() / 1000 - uts) / 60));
    if (minutes < 1) return 'just now';
    if (minutes < 60) return minutes + 'm ago';
    const hours = Math.round(minutes / 60);
    if (hours < 24) return hours + 'h ago';
    const days = Math.round(hours / 24);
    return days === 1 ? 'yesterday' : days + 'd ago';
  }

  async function check() {
    try {
      const response = await fetch(ENDPOINT, { cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json();
      const track = data && data.recenttracks && data.recenttracks.track && data.recenttracks.track[0];
      if (!track) return;

      const playing = !!(track['@attr'] && track['@attr'].nowplaying === 'true');
      const when = track.date && Number(track.date.uts);
      label.textContent = playing ? 'Listening now' : 'Last played' + (when ? ' ' + ago(when) : '');
      card.classList.toggle('is-playing', playing);

      /* Last.fm's 174px size covers the card's 56px at three times the
         density; the 300px one would only be more to download */
      const images = Array.isArray(track.image) ? track.image : [];
      const pick = images.find((image) => image.size === 'large') || images[images.length - 1];
      const src = pick && pick['#text'];
      const real = !!src && !src.includes(NO_ART);
      if (real && art.getAttribute('src') !== src) art.src = src;
      card.classList.toggle('has-art', real);

      /* shown before the names are set, so their lines have a width to be
         measured against */
      card.hidden = false;
      fit(title, track.name || '');
      fit(artist, (track.artist && track.artist['#text']) || '');
      [title, artist].forEach((line) => { line.dataset.width = String(line.clientWidth); });
    } catch (error) {
      /* Offline, blocked or down: whatever is showing stays, and a card that
         never loaded stays hidden. Nothing here is worth an error. */
    }
  }

  function schedule() {
    clearTimeout(timer);
    if (document.hidden) return;
    timer = setTimeout(async () => {
      await check();
      schedule();
    }, EVERY);
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) check();
    schedule();
  });
  check();
  schedule();
})();
