# The page, photographed, so the typeface can be chosen without a login

The Vercel preview for this branch is behind Deployment Protection and opens
only for somebody signed in to the Vercel project. These are the same pages,
captured so they can be looked at by anybody.

**The decision these exist for is §12(a) of
`data/bk-landing-design-research/report.md`: Fraunces or Instrument Serif.**
Shots 1 and 2 are the same page, the same scroll position, the same everything
— the *only* difference is the display face. Put them side by side and pick one.

| File | What it shows |
|---|---|
| `1-hero-fraunces-light.png` | The hero in **Fraunces** — the report's recommendation |
| `2-hero-instrument-serif-light.png` | The hero in **Instrument Serif** — the alternative |
| `3-hero-fraunces-dark.png` | The same hero in **dark mode**, which the report gave no guidance on |
| `4-full-page-fraunces-light.png` | **The whole page**, top to bottom: object → who it is for → editor → what you get → when it arrives → buy |

Look at the h1 — "My *Forever*" — against the scrapbook artwork above it.
Fraunces is wider, softer and warmer; Instrument Serif is narrower, sharper and
more editorial. The risk the report names is that Fraunces reads *too* soft
beside the artwork. The body face is Instrument Sans in both and is not in
question.

## How these were made

A production build (`npm run build && npm start`), not the dev server, so there
is no devtools badge and this is what the deployment serves. Chrome at
**390 × 844** at device-pixel-ratio 2 — the same phone viewport the eight
reference sites in the research were captured at. Stored drafts cleared first,
so the editor is in the state a first-time visitor sees.

Captured from commit `315b132`. They are a picture of the page at that commit
and nothing regenerates them — if the design moves, retake them or delete them.
Nothing in the build or the test suite reads this directory.

## What they are not

**None of these is a photograph of a printed book**, and the page says so in
its own caption. Nothing has been printed yet. The object in the hero is the
render given a surface — a shadow and a degree and a half of rotation, as if it
were a card on a table — which is the cheapest honest option in §10 of the
report. §12(b), what the hero should show once a book exists, is still open and
is the captain's other decision.
