# Books

Personalised printed photo books. A customer fills a designed page with their
own photos and words, pays, and the finished page is downloaded as a
print-ready file and uploaded to Printify.

Sold from `books.keepnook.app`.

**The selling page is the editor.** For a gift like this the buyer's real
question is not "is this nice" but *"will mine look as good as yours?"* — so
`/` puts two of their own photographs into the hearts before anything is paid
for, before any account, and before any upload.

---

## Running it

```sh
npm install
npm run dev          # http://localhost:3000
```

`/` is the shop: the object, one line saying who it is for, **the editor**,
what you get, when it arrives, and the order button. Pick a photograph and it
fills a heart; drag inside the heart to move it and pinch or use the slider to
zoom. **See the real print file** posts the page you have made and hands back
the actual 3150 × 3150 PNG. `/?guides=1` draws the trim and safe-area guides
over it — a screen affordance only; the print path has no such option, so a
trim mark cannot reach a book.

```sh
npm test             # 378 tests
npm run lint         # tsc --noEmit
npm run build        # production build
npm run print        # re-write the committed evidence in data/
```

All four run on every pull request — [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

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

**The editor edits the fill, and nothing else.** It never places a photograph:
a gesture becomes the `Crop` the format already defines
([`lib/editor/view.ts`](lib/editor/view.ts)) and `placePhoto` — the one
function the screen and the print file both go through — does the placing. So
there is no editor-side layout to drift from the renderer's, because there is
no editor-side layout. [`test/editor-to-print.test.ts`](test/editor-to-print.test.ts)
pans a photograph, renders the real 3150 px file, and reads the pixels back to
prove the marker landed where the arithmetic said it would.

**Nothing is uploaded and nothing is invented.** A photograph is resized in the
browser, hashed there, and posted with the render request;
[`lib/assets/supplied.ts`](lib/assets/supplied.ts) re-measures its digest, its
type and its pixel size before the renderer sees a byte. And the facts the shop
does not have — price, pages, paper, the delivery window — are a type with
nowhere to put a value, so the page shows a marked placeholder rather than a
plausible number.

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

Stripe, accounts, the orders page, R2 storage, and page two. Each is its own
task.

The order button posts to `/api/checkout`, which reads `STRIPE_SECRET_KEY` and,
finding none, answers 503 and sends the customer to a page that says plainly
that nothing has been charged. Never a crash, and never a fake success — see
[`lib/checkout.ts`](lib/checkout.ts). The captain adds the real key in Vercel;
nobody shares a key with anybody.

---

## Where things are

```
lib/template/     the format: types, geometry, tolerant readers, validation, rev
lib/render/       the renderer: svg, decoration, raster, png, jpeg, fonts,
                  coverage (what each face can write), random
lib/editor/       the editor's arithmetic, all pure: view (pan/zoom -> Crop),
                  gesture (screen px -> a rotated slot), text (what may be
                  typed), photo (resize and hash), draft (the document)
lib/assets/       content-addressed assets: fixtures, R2, and bytes posted
                  with a render request
lib/product.ts    what the shop claims, and what it admits it cannot claim
lib/checkout.ts   whether this shop can take money
templates/        pages, as data
fixtures/         one hard-coded order, and the photographs it uses
app/              the shop, the editor, /api/print, /api/checkout, /checkout
test/             378 tests, including the pixel assertions
docs/             the format, and the print file
data/             committed evidence
```

---

## This repository is public

No Stripe key, no Printify token, no Cloudflare credential and no account id
belongs in it. Environment variables only, named without values in
[`.env.example`](.env.example) and excluded by `.gitignore`.

Two environment variables have a reader. `R2_PUBLIC_BASE_URL` is a public URL
by definition. `STRIPE_SECRET_KEY` is a real secret and is read in exactly one
place — [`lib/checkout.ts`](lib/checkout.ts) — which does nothing with its
value but decide whether the shop is open; it is never logged, never returned
in a response, and `test/funnel.test.tsx` asserts no key material reaches the
rendered markup.

---

## Deploying

A stock Next.js app on Vercel; `npm run build` is the build command and there is
nothing to configure. `@resvg/resvg-js` is a native addon and is listed in
`serverExternalPackages`, so `/api/print` runs on the Node runtime rather than
the edge. Set `R2_PUBLIC_BASE_URL` when there is a bucket; until then the
fixture store answers, and a customer's own photographs never go near it —
they are resized in the browser and posted with the render request.

Set `STRIPE_SECRET_KEY` when there is a Stripe account. Until then the order
button leads to a page that says payments are not switched on, which is the
honest state and not a broken one.
