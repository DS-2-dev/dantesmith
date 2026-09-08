/* Everything the page does. Loaded as a module, so this file has its own scope
   and needs no wrapper — nothing here reaches the global object.

   The previous script is on the makeover branch: the game, the pointer-following
   panels, the name cards and the copy button all live there and can be brought
   across one block at a time. This file is what the page needs today. */

/* The theme switch.

   The stylesheet already answers for a reader who has never chosen — its bare
   values are light and a prefers-color-scheme block covers dark — so all this
   does is write, read and remember an explicit choice. The inline script in
   <head> puts a stored one back before the first paint; without it every visit
   in the non-default theme would open on one frame of the wrong ground. */
(function () {
  const button = document.querySelector('.theme');
  if (!button) return;
  const root = document.documentElement;

  /* What the machine says, for the first click: without this, clicking on a
     system-dark page would write "dark" and appear to do nothing. */
  const systemDark = () => matchMedia('(prefers-color-scheme: dark)').matches;
  const current = () => root.dataset.theme || (systemDark() ? 'dark' : 'light');

  /* The mark shows the theme the button will move to, so the label has to name
     that too rather than describing the state the page is in. */
  function label() {
    button.setAttribute('aria-label',
      current() === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
  }

  label();

  button.addEventListener('click', () => {
    const next = current() === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    label();
    /* Private browsing throws on write. The theme still changes for this
       visit; it simply is not there on the next one. */
    try { localStorage.setItem('theme', next); } catch (e) { /* not fatal */ }
  });

  /* Only while the reader is riding the system setting. Once they have chosen,
     data-theme is set and the machine changing underneath them should not
     overrule that — but the label still has to keep up. */
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', label);
})();


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
  if (!home || !items.length) return;

  function go(view) {
    body.dataset.view = view;
    home.disabled = view === 'home';
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
