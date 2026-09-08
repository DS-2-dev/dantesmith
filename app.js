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
