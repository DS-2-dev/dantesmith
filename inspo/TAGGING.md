# Tagging guide for inspo contact sheets

Each sheet in `inspo/.work/` is a 4×4 grid of thumbnails with a yellow number
(1–16) in each tile's corner. For every numbered tile, write one line of tags:
lowercase, comma-separated, 15–30 terms, in roughly this order:

1. what it is: poster, ui screenshot, website, app screen, photo, product shot,
   magazine spread, book cover, album cover, logo, packaging, 3d render,
   illustration, meme, ad, sticker, icon set, type specimen…
2. main subject(s) and notable objects
3. any legible text, in double quotes ("nike", "ok?", brand names, headlines)
4. style or movement: y2k, brutalist, swiss, minimal, grunge, vaporwave,
   frutiger aero, skeuomorphic, corporate memphis, editorial, retro-futurist…
5. medium or technique: halftone, film grain, chrome, gradient, collage, pixel
   art, isometric, glassmorphism, risograph, photocopy, long exposure…
6. era if it reads clearly (70s, 90s, 2000s)
7. dominant colors, plain names (red, cobalt blue, off-white, black)
8. mood, always at least two words, and always one temperature word: warm,
   cool or neutral (nostalgic, playful, eerie, calm, loud, sterile, cozy,
   melancholy, dreamy, energetic, luxurious, gritty)
9. typography or layout notes (bold sans, serif, monospace, grid, centered,
   lots of whitespace, dense)
10. two to four synonyms a person might search instead (typography, type,
    lettering; phone, mobile, iphone)

Rules: describe what is visible; don't name a person unless their name is
legible in the image. A blank, broken or unreadable tile gets `unreadable`.

Example tile line:
`3: poster, typographic poster, "nike", "nyc", "run", running figure, pegasus, arrows, hearts, smiley, vector illustration, playful sports branding, bold condensed lettering, white on red-orange, red, orange, white, energetic, loud, flat graphic, sportswear, athletic, type, typography, lettering`

Output: a JSON file mapping sheet name → tile number → tag line, e.g.
`{"sheet-0001": {"1": "…", "2": "…"}, "sheet-0002": {…}}`
