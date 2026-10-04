# Night widgets — design

Date: 2026-10-03

## Goal

Step the site up into a small personal dashboard: a grid of rounded widget
tiles on a near-black ground, with the chrome D.S. as the hero. It is a
personal site to hand to people, not a job-hunting portfolio — there is not
much work yet, and the site itself is a thing to keep playing with.

References: Ruslan Kochubarov's Are.na channel "Interface" (widget cards, big
numerals, one loud accent per screen) and the CoLabs homepage (big rounded
tiles, circular arrow buttons notched into tile corners, frosted pill nav).

Replaces the retro-desktop direction, which was stashed unfinished as
`stash@{0}` ("retro-desktop WIP 2026-10-03 (scrapped)").

## Decisions (from the user)

- Layout: **mark in the middle** — the D.S. is the hero tile, widgets sit
  around it (option C of three).
- Mood: **Night** — near-black ground, dark tiles.
- Accent: **cherry `#e5132f`**, white text on it. The only accent.
- Extra tile: **say hi / email**. No clock, no "working on".
- Opening a section: **the tile grows** to fill the grid.
- Mark: **the 3D chrome D.S.** (`mark3d.js`, recovered from the stash).

## Decisions made in the design (user agreed)

- Rebuild in place: rewrite `index.html`, `styles.css`, `app.js` for the new
  grid; keep the working data code (now-playing Worker, Are.na feed, the
  Vantage/Weave switch, copy button) and all the existing copy.
- Sections get hash URLs (`#work`, `#about`, `#contact`) so Back works and a
  section can be linked to. Today the page has no routes.
- Now playing fades out with the other tiles while a section is open; no
  mini player.

## Tokens

| token | value |
|---|---|
| `--bg` | `#0b0b0c` |
| `--tile` | `#18181a` |
| `--tile-hi` | `#222225` (hover) |
| `--ink` | `#f2f2f2` |
| `--ink-dim` | `rgba(242,242,242,.6)` |
| `--acc` | `#e5132f` |
| `--on-acc` | `#ffffff` |
| `--r` | `22px` (tiles), `999px` (pills, round buttons) |
| `--gap` | `10px` |

Type stays Inter 400/500 from Google Fonts. Light theme and the current light
palette go; the page is dark only (`color-scheme: dark`).

## Home grid

Desktop (≥ 900px), grid fills the viewport height minus a 16px margin:

```
┌────────┬──────────────────┬────────┐
│ name   │                  │ now    │
│        │      D.S.        │ playing│
├────────┤   (chrome 3D)    │ (acc)  │
│ say hi │                  ├────────┤
├────────┤                  │ inspo  │
│ work   │   [work·about·   │ Are.na │
│ (Sidq)→│    contact pill] │      → │
└────────┴──────────────────┴────────┘
  1fr           2fr            1fr
```

- **Name tile** — small dim label "hi, I'm", big "Dante Smith" (Inter 500,
  tight tracking), bottom-aligned.
- **Say hi** — thin strip under the name: the email address and a small copy
  button (existing copy-button behaviour and its status message). Clicking
  the strip itself, outside the button, opens contact.
- **Work tile** — Sidq campaign image, cover-fit. A round cherry arrow button
  notched into the bottom-right corner (the button carries a 6px `--bg`
  outline so it reads as cut into the tile). Opens work.
- **D.S. stage** — spans both rows of the middle column. Radial gradient
  `#2a2a2d → #141416`. The chrome mark, centred, with a soft cherry glow
  behind it. Frosted pill nav pinned to the bottom centre: work · about ·
  contact; the current one in cherry.
- **Now playing** — cherry tile, white text: cover art, title, artist,
  progress bar. Same Worker, same polling (30s) and song-change follow as
  today.
- **Inspo** — newest Are.na image, cover-fit, "inspo" label top-left, cherry
  arrow notched bottom-right linking to the channel. Same feed and polling
  (60s) as today.

Phone (< 900px): one column, in order — name, D.S. (square), now playing,
work, inspo, say hi. 16px side gutter, no horizontal scroll. The pill nav
stays at the bottom of the D.S. tile.

## Sections (tile grows)

- Triggers: a pill item; the work tile's arrow; the say-hi strip (→ contact).
  About has no tile of its own; it opens from the pill and grows out of the
  D.S. stage.
- Opening sets `location.hash` and `body[data-view]`. `hashchange` drives
  everything, so Back, Escape, the ×, and the mark all just go to `#` (home).
- Motion: `document.startViewTransition` morphs the source tile into the
  full-grid panel (shared `view-transition-name`), the other tiles fade.
  No API → instant swap. `prefers-reduced-motion` → crossfade only.
- Panel: `--tile` background, `--r` corners, fills the grid area, scrolls
  internally. Cherry round × button notched top-right. The chrome mark
  shrinks into the panel's top-left corner and is a home button there.
- Contents (existing copy, re-laid as tiles inside the panel):
  - **work** — Sidq first and largest, then the Vantage/Weave switch, then
    T-Shirt Mockup and WSU AI Lab, as image tiles.
  - **about** — the about copy, then tools and languages.
  - **contact** — email with copy button, links, resume PDF.
- Focus: on open, the panel's heading (`tabindex="-1"`); on close, the
  element that opened it. Panel is a labelled region, not a modal dialog —
  the page behind is hidden, not inert-trapped.
- Direct load of `/#work` opens straight into the section, no morph.

## The mark

Recover `mark3d.js` from the stash and the import map for three.js 0.170.0
from jsDelivr. It builds the chrome letters from the inline SVG glyphs, so
the SVG mark stays in the markup as the fallback (no WebGL2 or CDN down →
flat letters, still bent by the pointer as in `app.js` today).

Changes to it:
- Positions follow the stage tile at home and the panel corner in a section,
  instead of the desk / window rules from the retro build.
- Pointer push applies only over the D.S. stage at home.
- Add the cherry glow as a CSS `drop-shadow`/radial behind the canvas, not in
  the WebGL scene.

## Removed

- The current top menu bar, the mark's glass, and the glass-only-over-content
  logic (`app.js` lines ~55–123) — the pill and tiles replace them.
- The light palette.

## Errors and empty states

Unchanged behaviour, restyled: Worker or Are.na offline → whatever was
showing stays; first load with nothing → the tile shows a dim placeholder
("nothing playing" / no image) rather than collapsing, so the grid never
jumps.

## Testing

`tests/responsive.test.mjs` (headless Chromium against a local server)
is rewritten around the new page. Keep, adjusted: now playing from the
Worker, Are.na newest, card follows a new track, the work reads at every
size, the switch trades Vantage for Weave, the mark bends at home, the copy
button. New:

- home grid: tiles present and in order at 1440, 1024, 390 wide; no
  horizontal scroll; D.S. stage spans both rows on desktop.
- `#work` / `#about` / `#contact` open on pill click, direct load, and Back;
  Escape and × return home; focus lands on the heading and returns to the
  opener.
- reduced motion: no view-transition morph.
- WebGL unavailable → flat SVG mark visible.
- accent contrast: white on `#e5132f` ≥ 4.5:1 for body-size text.

## Out of scope

Clock/weather tile, "working on" tile, a mini player in sections, new work
content, light mode.
