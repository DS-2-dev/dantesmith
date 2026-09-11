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


/* The mark's glass, only while something is actually under it.

   Not whenever a section has scrolled: on a wide window the work sits in from
   the corner, and scrolling it runs nothing but white past the letters. So
   what is checked is whether any piece of content that paints — a card, a
   line of copy, a tool's mark — overlaps the patch of glass behind the mark,
   and <body> carries is-under only while one does. The stylesheet fades the
   glass in on that.

   Checked at most once a frame while the section scrolls, and when the
   window changes size. Not while the mark is moving: opening a section
   shrinks it from the middle of the page into its corner, and on the way it
   is large and over the work, which read as something under it and flashed
   the glass up for the length of the move. So a change of view puts the
   glass down at once and checks again only once the move is over. */
(function () {
  const body = document.body;
  const mark = document.getElementById('home');
  const monogram = document.querySelector('.monogram');
  const views = Array.from(document.querySelectorAll('.view'));
  if (!mark || !monogram) return;
  /* what counts as something under the letters: things that paint, not the
     empty boxes that hold them */
  const CONTENT = '.project, .lede, .prose, .tech-label, .tech-icon';
  /* the glass reaches this far past the letters; the stylesheet's
     inset on .monogram-go::before */
  const PAD_Y = 8;
  const PAD_X = 12;
  /* the mark's move between the middle and the corner is 0.55s */
  const MOVE = 600;
  let queued = 0;
  let settling = 0;

  function under() {
    const view = views.find((section) => section.id === body.dataset.view);
    if (!view) return false;
    const box = mark.getBoundingClientRect();
    const top = box.top - PAD_Y;
    const bottom = box.bottom + PAD_Y;
    const left = box.left - PAD_X;
    const right = box.right + PAD_X;
    return Array.from(view.querySelectorAll(CONTENT)).some((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.bottom > top && r.top < bottom && r.right > left && r.left < right;
    });
  }

  function update() {
    if (settling) return;
    cancelAnimationFrame(queued);
    queued = requestAnimationFrame(() => body.classList.toggle('is-under', under()));
  }

  function settle() {
    clearTimeout(settling);
    cancelAnimationFrame(queued);
    body.classList.remove('is-under');
    settling = setTimeout(() => {
      settling = 0;
      update();
    }, MOVE);
  }

  views.forEach((view) => view.addEventListener('scroll', update, { passive: true }));
  window.addEventListener('resize', update);
  new MutationObserver(settle).observe(body, { attributes: true, attributeFilter: ['data-view'] });
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


/* Latest inspo, from Are.na.

   The four newest images in my inspo channel, on the black card at home.
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
  /* Every 15 seconds, playing or not. It used to wait a minute between
     questions once the card said "last played", and that is exactly when a
     song starting matters most: pressing play meant a minute's wait, and a
     reload looked like the only way to see it. */
  const EVERY = 15000;
  /* how long a question gets before it is given up on */
  const PATIENCE = 8000;
  let asking = false;
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
    card.dataset.track = next.key;
  }

  art.addEventListener('load', () => card.classList.add('has-art'));
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
      const track = data && data.recenttracks && data.recenttracks.track && data.recenttracks.track[0];
      if (!track) return;

      const playing = !!(track['@attr'] && track['@attr'].nowplaying === 'true');
      const when = track.date && Number(track.date.uts);

      /* Last.fm's 174px size covers the card's 56px at three times the
         density; the 300px one would only be more to download */
      const images = Array.isArray(track.image) ? track.image : [];
      const pick = images.find((image) => image.size === 'large') || images[images.length - 1];
      const src = (pick && pick['#text']) || '';
      const name = track.name || '';
      const by = (track.artist && track.artist['#text']) || '';
      const next = {
        key: name + '\n' + by,
        name,
        by,
        label: playing ? 'Listening now' : 'Last played' + (when ? ' ' + ago(when) : ''),
        playing,
        src,
        real: !!src && !src.includes(NO_ART),
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
