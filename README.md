# Books

Personalised printed books. A buyer names a child, picks a baby from a grid,
reads **the whole book** before paying, and the finished book is downloaded as a
print-ready file and uploaded to a printer by hand.

Sold from `books.keepnook.app`.

**There is no wall.** The strongest finding in the research is that every
narrative-book seller worth copying shows all of it — personalised, no
watermark, no account, no email — so `/preview` does exactly that.

## The two titles

| | |
|---|---|
| **The Book of You** at `/` | the product: 24 interior pages and a cover, 12 looks, a buyer's photograph and dedication. [`templates/first-book.ts`](templates/first-book.ts) |
| **My Forever** at `/my-forever` | the single keepsake page the machinery was built on. Still here, still the clearest example of the format. [`templates/my-forever.ts`](templates/my-forever.ts) |

They share one format, one renderer and one print path. A book is **a list of
pages plus a looks axis** — see [`lib/book/types.ts`](lib/book/types.ts) — and
`lib/book/derive.ts` turns one of its pages into the `PageTemplate` the
renderer has always drawn, so nothing downstream knows books exist.

---

## Running it

```sh
npm install
npm run dev          # http://localhost:3000
```

`/` is the shop: the cover, one line saying what it is, and **Step 1 of 1** — a
name, a girl-or-boy question, and a grid of babies. `/preview` is every page of
the book with the extras offered on the spreads they affect, a persistent bar
of what is done, and one `Continue` into a confirm-the-spelling screen and the
stubbed till.

`/my-forever` is the single-page editor; `/my-forever?guides=1` draws the trim
and safe-area guides over it — a screen affordance only, so a trim mark cannot
reach a book.

```sh
npm test             # the whole suite
npm run lint         # tsc --noEmit
npm run build        # production build
npm run print        # re-write My Forever's committed evidence in data/
npm run book         # re-write the book's committed evidence in data/
npm run book -- --all --out <dir>   # the whole 25-page PDF, ~25 s and ~9 MB
npm run looks -- <dir>              # check an upload of artwork
npm run looks:import -- <dir>       # take it into the repository
```

All of them run on every pull request — [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

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

**The print file.** The book is **3600 × 3600 a page** on an 8.5 in artboard —
an 8.00 in trim with a quarter inch of bleed — written as a PNG a page or one
PDF of the whole book. My Forever is 3150 × 3150 at 300 DPI. The committed
examples are [`data/bk-first-book-buyer-flow/`](data/bk-first-book-buyer-flow/)
and [`data/bk-spine-template-and-print/`](data/bk-spine-template-and-print/).

**What is still open about those numbers is [`docs/print.md`](docs/print.md) §
The square trim nobody has pinned down — read it before changing a canvas.**
The page size is declared data on the book, so the answer is an edit to two
fields and a restamp.

**The artwork contract.** What the captain generates, exactly, is
[`docs/look-upload-contract.md`](docs/look-upload-contract.md), and
`npm run looks` enforces it: wrong count, wrong size, a page that is not
square, an alpha channel, a look whose page count disagrees with its siblings.
A silent bad upload is a printed book with a white edge, and that is not
visible in a browser.

**What it costs, and what the page may say about it.**
[`docs/pricing.md`](docs/pricing.md). Two real prices, one hardcover upgrade,
and no struck-out "was" — the type has nowhere to put one.

---

## What is not built

Stripe, accounts, the orders page, R2 storage, and any printer integration.
Each is its own task, and the last one is deliberately not coming: an order
arrives, a file is produced, **a human uploads it**.

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
lib/book/         a book: types, derive (a book page -> a PageTemplate), the
                  order, the name's refusal, the photo floor, validation,
                  the upload checker, editions and prices, rev
lib/product.ts    what the shop claims, and what it admits it cannot claim
lib/checkout.ts   whether this shop can take money
templates/        pages and books, as data
fixtures/         two hard-coded orders, and the photographs they use
app/              the shop and the chooser, /preview and the whole book,
                  /my-forever, /api/book/print, /api/print, /api/checkout
test/             the suite, including the pixel assertions
docs/             the format, the print file, the upload contract, pricing
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
