# Faces

Two groups, and the line between them is the point of this file.

## The artwork's faces — `./`

These are drawn **into the page**, so the screen and the print file must set a
word in the same bytes. Vendored rather than fetched from a CDN: the browser
loads them over `@font-face` from this directory and the rasteriser reads the
same files off disk. A webfont CDN would make a customer's print file depend on
somebody else's uptime.

`lib/render/fonts.ts` is the registry a template names a face through; a
`textSlot` names a key there, never a CSS family. The `@font-face` block the
browser gets is **generated from that table** by `fontFaceCss()` — a second
hand-written list would be a face the screen has and the rasteriser has not,
and nobody would find out until the book arrived.

| Key | Face | File | Licence |
|---|---|---|---|
| `typewriter` | Special Elite | `SpecialElite-Regular.ttf` | Apache-2.0 — `SpecialElite-LICENSE.txt` |
| `hand` | Indie Flower | `IndieFlower-Regular.ttf` | SIL Open Font License 1.1 — `IndieFlower-OFL.txt` |

Neither covers Cyrillic or emoji. That is measured rather than assumed —
`lib/render/coverage.ts` declares each face's codepoints and
`test/coverage.test.ts` regenerates them from the files.

## The chrome's faces — `chrome/`

These set the **page around** the artwork: the headings, the copy, the buttons.
They are declared by hand in `app/globals.css` and that is safe for one
specific reason — `lib/render/svg.ts` only ever resolves a `FACES` key, so no
template can name them and the rasteriser is never asked to find them. **No
codepoint of these can reach a print file.** `test/chrome-type.test.ts` asserts
that line holds in both directions, and that every file named below is actually
on disk: `font-display: swap` means a missing one renders the page in Georgia
and looks deliberate.

The pairing is `data/bk-landing-design-research/report.md` §9's, which measured
eight reference sites at phone width. Instrument Sans is literally the body face
on `studiogwyn.com`, the captain's own named benchmark.

| Role | Face | File | Licence |
|---|---|---|---|
| display | Fraunces (variable: `opsz`, `wght`) | `fraunces-latin-opsz-normal.woff2`, `…-italic.woff2` | SIL OFL 1.1 — `Fraunces-OFL.txt` |
| body | Instrument Sans (variable: `wght` 400–700) | `instrument-sans-latin-wght-normal.woff2` | SIL OFL 1.1 — `InstrumentSans-OFL.txt` |
| display, alternative | Instrument Serif | `instrument-serif-latin-400-normal.woff2`, `…-italic.woff2` | SIL OFL 1.1 — `InstrumentSerif-OFL.txt` |

The `opsz` cut of Fraunces rather than the `full` cut: `full` adds the `SOFT`
and `WONK` axes and 120 kB, and nothing uses them. The optical-size axis is the
one the report asks for by name, and the browser drives it from `font-size` for
free.

**Instrument Serif is the open question, not a third face in use.** §12(a) of
the report records the display typeface as a decision only the captain can
make, and it is a picture question — so `/?type=serif` sets the real page in it
and the footer links both ways. When they choose, delete the two
`@font-face` rules, the `[data-display]` block, those two files and the footer
link.

Latin subsets only, for all three. Every chrome string on the site comes from
this repository and is English; a `unicode-range` on each rule keeps the browser
from reaching for one of these for a codepoint it does not have.

All five faces are from the Google Fonts repository and every licence permits
embedding, redistribution and commercial use. The licence text ships beside the
files because the OFL requires it and because a public repository is where
somebody will look.
