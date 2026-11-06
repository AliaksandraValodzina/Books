# The look upload contract

**What the captain generates, exactly. This document is the agreement; a
validator enforces it; nothing in it should change once artwork exists.**

A *look* is one baby. The artwork for a look is a folder of **finished square
page images with the baby already drawn in** — the whole page, not a cut-out.
Nothing is composited when a book is rendered except the three kinds of words
and the one photograph the renderer draws on top. Choosing a look is choosing
which folder of images the book is drawn on.

Run the checker before handing anything over:

```sh
npm run looks -- path/to/looks
```

It prints one line per problem and exits non-zero if there is one. A silent bad
upload is a printed book with a white edge down one side, and that is not
visible in a browser.

---

## 0. The shape of the book, in one table

Settled with the captain on 6 November. These are the numbers everything else
in this document follows from.

| | |
|---|---|
| **Interior pages** | **24** — twelve spreads at 2.000:1 |
| **Cover** | **1**, separate from the interior |
| **Page size** | **3600 × 3600 px**, every page, exactly |
| **Trim** | **8 × 8 in.** The file is the trim plus 0.25 in of bleed on every edge |
| **Target products** | Printify **softcover** and **hardcover** photo books, both 8 × 8 in, **24 pages fixed**, one raster per page |
| **Looks** | **12 — six per gender.** One folder each |

Twenty-four is not a round number somebody liked. It is what twelve spreads
is, and it is what both Printify photo books take without a page of slack. One
artwork set therefore serves the softcover and the hardcover, which is what
makes the hardcover an upgrade on an order rather than a second set of files to
draw.

**Twelve looks is six per gender**, which is exactly Wonderbly's count. Nothing
in the code counts them — the grid renders whatever `looks.json` declares — so
delivering five or eight is an upload and not a release. The number is here so
that the *artwork* has a target, not because anything would break.

---

## 1. The folder

```
looks/
  looks.json            <- declares each look: id, label, gender
  mabel/                <- one folder per look, named for the look
    cover.png
    page-001.png
    page-002.png
    …
    page-024.png
  wren/
    cover.png
    page-001.png
    …
```

### `looks.json`

```json
{
  "looks": [
    { "id": "mabel", "label": "Mabel", "gender": "girl" },
    { "id": "ada",   "label": "Ada",   "gender": "girl" },
    { "id": "wren",  "label": "Wren",  "gender": "boy"  }
  ]
}
```

It exists because **gender is not a fact about pixels.** The buyer is asked
which before the grid of tiles is shown, and nothing can read that off a PNG —
so it is declared, once, beside the folders, and `npm run looks` checks that
every folder is declared and every declaration has a folder.

`label` is what the tile says. `id` **must equal the folder name**, and both are
permanent: an order names a look, and renaming one after a sale orphans that
order. `gender` is one of the ids the book declares (`girl`, `boy` today); how
many looks each has is not fixed anywhere in the code, so adding a seventh is an
upload and not a release.

### The files

| Rule | Why |
|---|---|
| **One folder per look**, named for the look | The folder name *is* the look id. It must match `^[a-z0-9]+(-[a-z0-9]+)*$` — lowercase, digits, single hyphens. No spaces, no capitals, no accents: it ends up in a filename, a URL and a JSON key. |
| **Interior pages are `page-NNN.png`**, zero-padded to three digits, numbered **in reading order from 001 with no gaps**, up to **024** | Zero-padding is so `ls`, Finder, a zip and the validator all sort them the same way. `page-9.png` sorts after `page-10.png` in half the tools that will touch it. |
| **The cover is `cover.png`** and is **not** one of the numbered pages | The cover is a different object: different stock, trimmed differently, and the only page the buyer picks a colour for. Numbering it `page-001.png` makes every interior page number off by one forever. |
| **Nothing else in the folder** | No `.DS_Store`, no `thumbs/`, no `page-012 copy.png`, no PSDs, no `final-FINAL.png`. An unexpected file is reported rather than ignored, because the commonest version of this mistake is two files that both look like page twelve. |

**Back covers and spines are not in scope.** `cover-back.png` and `spine.png`
are reserved names and are refused today rather than silently ignored, so that
when a printer asks for them nobody has to work out whether an existing upload
already had them.

---

## 2. Every page, exactly

| | |
|---|---|
| **Size** | **3600 × 3600 pixels.** Exactly. Every page, every look, the cover too. |
| **Shape** | Square. A page that is 3600 × 3599 is refused. |
| **Format** | **PNG**, 8 bits per channel. |
| **Colour** | **sRGB.** No embedded CMYK, no Adobe RGB, no ProPhoto. |
| **Transparency** | **None.** No alpha channel at all — colour type 2 (RGB) or 0 (greyscale), never 6 (RGBA). Every scene is full-bleed, so there is nothing to see through, and an alpha channel is how a white page edge gets into a print file without anybody seeing it on screen. |
| **Bleed** | **Full bleed to all four edges.** No white border, no frame, no rounded corner, nothing that stops before the edge. |

### Why 3600, and what it is 3600 *of*

3600 px is the **whole file including bleed**, and it is deliberately larger
than any floor it has to clear:

| It has to satisfy | Pixels | 3600 |
|---|---|---|
| **8 × 8 in trim + 0.25 in bleed at 300 dpi — the actual product** | **2550** | clears, half again over |
| Printify's recommendation if 3150 turns out to be it | 3150 | clears |
| Keepnook's own on-screen sharpness floor | 2961 | clears |
| 6 × 6 in board book + 0.25 in bleed, 300 dpi | 1950 | clears |

**Generate once at 3600 and downscaling is free. Upscaling later is not** —
watercolour linework goes mushy under AI upscaling and it would be printed that
way. This is the one number worth over-shooting, and it is the reason this
contract can be settled today while the trim question is still open.

**The exact file size Printify asks for is still open, and this contract does
not depend on it.** The page size is a declared value in the book template
(`templates/first-book.ts`, `page.canvas` and `page.print`), so changing it is a
data edit and a re-render, not a code change — and **you would not regenerate
anything**, because 3600 downscales to every candidate. See
[`print.md`](print.md) § The square trim nobody has pinned down for what is
actually unknown and who can close it.

### Where the trim falls, and the safe area

Measured inward from the edge of the 3600 px file:

```
┌──────────────────────────────────────┐  the file: 3600 × 3600
│  bleed — 75 px (0.25 in)             │
│   ┌──────────────────────────────┐   │
│   │  trim: this is the page      │   │  3450 × 3450
│   │   ┌──────────────────────┐   │   │
│   │   │  safe area           │   │   │  3300 × 3300
│   │   │  nothing that matters│   │   │
│   │   │  may cross this line │   │   │
│   │   └──────────────────────┘   │   │
│   └──────────────────────────────┘   │
└──────────────────────────────────────┘
```

- **75 px of bleed** on each edge. Artwork fills it; nothing a reader is meant
  to see lives in it.
- **A further 75 px of safe area.** So **everything that matters sits at least
  150 px (0.5 in) in from the file edge**: the baby's face, anything a buyer
  would point at, and — most importantly — the areas the words and the
  photograph are drawn into.
- 0.25 in is declared deliberately rather than measured. Over-declaring the
  bleed moves the trim guide *inwards*, which keeps content further from any
  real cut line; under-declaring moves it towards one.

**The gutter is the one that bites.** On a spread the inner edges disappear into
the spine. Nothing a buyer cares about — a face, a name, the photograph, a line
of the story — may sit within about 150 px of the inner edge of a page that
faces another. Even-numbered pages gutter on the left, odd on the right.

---

## 3. What must *not* be in the artwork

### No text, burned in, anywhere

Not the story, not the name, not the dedication, not a page number, not a
title.

**The book has three kinds of words and the renderer draws all three.**

| Kind | Who writes it | When |
|---|---|---|
| **The story** — a line or two per spread | the captain, once | fixed for every order |
| **The baby's name** | the buyer | per order |
| **The dedication**, and the optional **from-line** under it | the buyer | per order |

Keeping the story out of the pictures is what makes a typo one edit rather than
twenty-four re-generations, and it is the only thing that keeps a second
language possible. A word painted into a picture cannot be fixed once and
cannot be translated at all.

### The areas the words go in are left empty

Four kinds of area carry **background only** — no frame, no panel, no drop
shadow, no "text here" placeholder, and nothing busy:

- **The story area**, on the first page of each spread. A line or two of small
  typewriter text sits across the upper third; it needs a quiet ground.
- **The name areas.** A name is set large in a handwritten face; a busy
  background behind it is unreadable at any size.
- **The dedication area**, big enough for ten lines, with a signature line under
  it.
- **The photo area** — background, as if the photograph were not there. The
  renderer draws the white frame.

Which pages carry which, and where on the page, is **template data and not your
problem**: it lives in `templates/first-book.ts` and is authored against your
artwork once you say which pages are which. Do not try to match coordinates;
leave the areas clear.

| Page | Carries | Keep clear |
|---|---|---|
| `cover.png` | the baby's name, large, on a cream panel; the buyer's cover colour tints the whole ground | the middle third |
| `page-001.png` | the baby's name, on the title page | the upper middle |
| `page-002.png` | **the buyer's photograph, the dedication and the from-line** | see below — most of the page |
| `page-003.png`, 005, 007 … 023 | one or two lines of story, across the top | the upper third |
| `page-024.png` | the baby's name, closing page | the upper middle |

### `page-001` and `page-002` are the babyless spread

**This is the one instruction in this document that changes what you draw.**

The opening spread — cream ground, clouds, bunting, confetti, **no baby** — is
the spread that is *identical in all twelve looks*, and that is exactly why it
is the one that carries everything the buyer supplies. A page with a baby in it
differs between looks; a page the buyer's photograph and dedication sit on must
not, or switching look would reflow somebody's words.

So:

- **Draw it once.** It is byte-identical in every folder. The validator reports
  identical files across looks as a *note* rather than an error for this reason.
- **`page-002` carries three things down the middle**: a 3-inch square
  photograph in the upper third, ten lines of dedication under it, and one
  handwritten line at the foot. Leave the centre column — roughly the middle
  two-thirds of the width, from the top of the page to the bottom — as quiet
  background. No bunting across the middle, no confetti where words go.
- **`page-001` carries the name** in the upper middle.

### Nothing that identifies a particular baby in the background

A look is "which baby", and the buyer is told that is the only difference
between the tiles. See the next section.

---

## 4. Every look must be the same book

This is the rule that is easiest to break and hardest to see.

| Rule | Why |
|---|---|
| **Every look has 24 interior pages and a cover** | A look with 23 pages against a book of 24 is a silent hole. The book template's page list is the source of truth; a look missing a page is a refusal, never a book with one page fewer. |
| **Every look has the same backgrounds** | **Only the baby differs.** Buyers flick between looks before they buy. If the kitchen changes with the baby they will notice, and what they will conclude is that the book is not really a book. |
| **The same page number is the same scene in every look** | `page-002.png` is the photograph's page in every folder. The validator checks counts and sizes; it cannot check that a scene is the same scene, so this one is on the eye. |
| **The baby is the same person on every page of a look** | Generated art drifts. Same hair, same face, same outfit, page one to page twenty-four. |
| **The pose in the grid tile is the same for every look** | The buyer is choosing *which baby*, not *which picture*. This is handled for you: the picture tiles in the chooser are **one declared page of each look** — `page-003` today, because `page-001` has no baby in it — rendered by the same renderer, so the pose is identical by construction and there is no tile to supply. The book declares which page in `tilePage`, and the build refuses a babyless one. |

Two pages being byte-identical across looks is reported as a note rather than
an error: a page with no baby in it legitimately is the same file, and a page
with a baby in it legitimately is not.

---

## 5. What the validator checks, and what it cannot

`npm run looks -- <dir>` reads every folder under `<dir>` and reports, by
stable code:

| Code | What it means |
|---|---|
| `manifest.missing` | no `looks.json` at the root |
| `manifest.malformed` | `looks.json` is not JSON, or has no `looks` array |
| `manifest.lookUndeclared` | a folder with no entry in `looks.json` |
| `manifest.folderMissing` | an entry in `looks.json` with no folder |
| `manifest.genderMissing` | an entry with no `gender` |
| `manifest.genderUnknown` | a `gender` the book does not offer |
| `look.nameMalformed` | the folder name is not a usable look id |
| `look.noPages` | the folder has no `page-NNN.png` at all |
| `look.coverMissing` | no `cover.png` |
| `look.pageCountMismatch` | this look's page count disagrees with the book template |
| `look.pageCountDisagrees` | this look's page count disagrees with a sibling look |
| `look.pageMissing` | a gap in the numbering, or page 1 missing |
| `look.pageUnexpected` | a numbered page beyond the book's page count |
| `look.fileUnexpected` | a file in the folder that is not a page or the cover |
| `look.reservedName` | `cover-back.png` or `spine.png`, which are not in scope |
| `page.notPng` | the bytes are not a PNG, whatever the extension says |
| `page.notSquare` | width and height differ |
| `page.wrongSize` | square, but not the declared page size |
| `page.hasAlpha` | an alpha channel — PNG colour type 4 or 6 |
| `page.notEightBit` | a bit depth other than 8 |
| `page.interlaced` | Adam7 interlacing, which some RIPs mishandle |
| `page.notSrgb` | an embedded `iCCP` profile that is not sRGB |
| `page.duplicateWithinLook` | two pages of the same look are byte-identical |
| `page.identicalAcrossLooks` | a note, not an error — see above |

**It cannot check** that the baby is the same person page to page, that a scene
matches its sibling in another look, that the gutter is clear, that nothing
important sits outside the safe area, or that no text is burned in. Those are
the items in the human checklist below, and they are the ones that cost a
reprint.

---

## 6. The checklist to run through once, by eye

- [ ] Every page is **3600 × 3600**, and there are **24 of them plus a cover** in every folder. (`npm run looks` does this one.)
- [ ] **`page-001` and `page-002` have no baby on them**, and are the same file in every look.
- [ ] The **middle column of `page-002` is clear** — a photograph, ten lines and a signature go there.
- [ ] **No white at any edge** on any page, before trimming.
- [ ] **No text anywhere** in any image — including the story.
- [ ] The **story area, both name areas, the dedication area and the photo area are clear background.**
- [ ] The **baby is the same person** on every page of a look.
- [ ] The **backgrounds are identical** between looks — flick between two folders at the same page number.
- [ ] Nothing important within **150 px of any edge**, or within **150 px of the gutter** on a facing page.
- [ ] sRGB, **no transparency**. (`npm run looks` does this one too.)
- [ ] Looked at a **flat wash** at 100 % for JPEG-style banding, if anything in the pipeline ever touched JPEG.

---

## 7. Handing it over

Drop the folders anywhere and run the checker. When it is clean:

```sh
npm run looks:import -- path/to/looks
```

`looks:import` hashes every file, copies it into the content-addressed asset
store, and rewrites `templates/first-book.art.ts` — the map from
`(look, page)` to a content hash, and the looks list with its genders — then
prints the new `rev` to stamp on the book. Nothing about the artwork is retyped
by hand and no coordinate is ever transcribed.

Artwork is named by **content hash, never by filename**, so re-uploading a
corrected page is a *different* address rather than a redefinition: a book
already sold cannot be repainted by a later upload, and a reprint of a
year-old order is byte-identical to the first. That is
[`template-format.md`](template-format.md) § Nothing in a template holds
pixels, one level up.
