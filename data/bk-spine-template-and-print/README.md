# The evidence

Four files, all written by `npm run print`, all committed.

| File | What it is |
|---|---|
| `my-forever-print-3150.png` | **The print file.** 3150 × 3150, sRGB, 300 DPI. |
| `my-forever.template.json` | The page, serialised out of the same object the renderer was handed. |
| `my-forever.fill.json` | One customer's photographs and words — the fixture order. |
| `my-forever.print.svg` | The SVG the PNG was rasterised from, photographs inlined. |

## Why these four

**The PNG** is the deliverable, and it is here so the size is a fact rather than
a claim. `test/print-size.test.ts` opens it and reads 3150 × 3150 out of the
IHDR; it also checks the `sRGB` chunk sits before the first `IDAT`, and pins the
file byte for byte against what the renderer produces today. That last check is
only possible because every wobble in the artwork comes from a seeded
`mulberry32` rather than `Math.random` — a render that drifted would mean this
file had quietly stopped being evidence of anything.

**The two JSON files** are the claim "a page is data" made checkable by somebody
who does not want to read TypeScript. The template is a few kilobytes; the fill
is two photograph digests, two crops and two words.

**The SVG** is what the one renderer actually produced. It is the artefact that
shows the screen and the print path are the same drawing: strip the `href`
attributes out of it and out of the page the browser is given, and the two are
identical.

## Regenerating

```sh
npm run print
```

It refuses to write anything if the template's `rev` does not match its own
content hash, or if the template or the fill has a validation problem. Expect
no diff unless you changed the template, the fill, the renderer or a fixture
photograph — and if you changed the template, restamp `rev` first; the script
tells you what to.

## Looking at it

The PNG is 10.5 inches square at 300 DPI, so a viewer will show it very large.
`npm run dev` and open `/` for the same page at screen size, or `/?guides=1` to
see where the trim and safe-area lines fall — remembering that the trim is
[a conservative assumption, not a measurement](../../docs/print.md).
