# Books

Personalised printed photo books. A customer fills a designed page with their
own photos and words, pays, and the finished page is downloaded as a
print-ready file and uploaded to Printify.

Sold from `books.keepnook.app`.

---

## Running it

```sh
npm install
npm run dev          # http://localhost:3000
```

The page at `/` is "My Forever" rendered from its template and a hard-coded
fixture order. **Download the print file** gives you the real 3150 × 3150 PNG.
`/?guides=1` draws the trim and safe-area guides over it — a screen affordance
only; the print path has no such option, so a trim mark cannot reach a book.

```sh
npm test             # 107 tests
npm run lint         # tsc --noEmit
npm run build        # production build
npm run print        # re-write the committed evidence in data/
```

Nothing needs configuring. With no environment variables set the app serves the
fixture photographs out of `fixtures/assets/`, which is the correct state until
there is a bucket — see [`.env.example`](.env.example).

---

## What is built

**A page template is data, not code.** A page is a canvas, an ordered stack of
layers, and typed slots a customer fills — a description a renderer reads. The
format is [`lib/template/types.ts`](lib/template/types.ts) and the reasoning
behind it is [`docs/template-format.md`](docs/template-format.md). This page is
expressed in it at [`templates/my-forever.ts`](templates/my-forever.ts).

**One renderer, not two.** [`lib/render/svg.ts`](lib/render/svg.ts) produces the
page as SVG. The screen inlines that string;
[`lib/render/raster.ts`](lib/render/raster.ts) hands the same string to a
rasteriser at 3150 px. The only thing that differs between the two calls is how
an asset is addressed, and `test/one-renderer.test.ts` demands the rest be
character for character identical — an `if (forPrint)` anywhere fails it.

**The artwork is ours.** Every mark that is not a customer's photograph or word
is drawn from declared numbers in
[`lib/render/decoration.ts`](lib/render/decoration.ts): the cloth is a two-dot
tile with a crossed weave, the tape is a seeded tear walk under a sheen
gradient, the kiss is a cupid's bow with radiating creases, and the heart is
five cubics in [`lib/template/geometry.ts`](lib/template/geometry.ts). Nothing
is traced, sampled or copied. The two fixture photographs are generated too, by
`scripts/make-fixture-photos.ts`, so the repository carries no real face and no
stock licence.

**The print file.** 3150 × 3150, sRGB, 300 DPI. The committed example and the
test that measures it are described in
[`data/bk-spine-template-and-print/`](data/bk-spine-template-and-print/). What
was and was not established about Printify's bleed is
[`docs/print.md`](docs/print.md) — read that one before changing the canvas.

---

## What is not built

The editor, Stripe, accounts, the orders page, and page two. Each is its own
task. The template format is shaped so that the editor edits a `PageFill` and
cannot touch anything else.

---

## Where things are

```
lib/template/     the format: types, geometry, tolerant readers, validation, rev
lib/render/       the renderer: svg, decoration, raster, png, fonts, random
lib/assets/       content-addressed assets: fixtures now, R2 next
templates/        pages, as data
fixtures/         one hard-coded order, and the photographs it uses
app/              the screen, /api/print, /api/assets/<sha256>.<ext>
test/             107 tests, including the pixel assertions
docs/             the format, and the print file
data/             committed evidence
```

---

## This repository is public

No Stripe key, no Printify token, no Cloudflare credential and no account id
belongs in it. Environment variables only, named without values in
[`.env.example`](.env.example) and excluded by `.gitignore`.

Nothing in the repository reads a secret today: the one environment variable
with a reader is `R2_PUBLIC_BASE_URL`, which is a public URL by definition.

---

## Deploying

A stock Next.js app on Vercel; `npm run build` is the build command and there is
nothing to configure. `@resvg/resvg-js` is a native addon and is listed in
`serverExternalPackages`, so `/api/print` runs on the Node runtime rather than
the edge. Set `R2_PUBLIC_BASE_URL` when there is a bucket; until then the
fixture store answers.
