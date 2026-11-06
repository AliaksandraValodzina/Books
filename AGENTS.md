<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Books

Personalised printed books. `README.md` is the orientation; the documents that
decide everything else are `docs/template-format.md`, `docs/print.md`,
`docs/look-upload-contract.md` and `docs/pricing.md`.

**Two titles, one machinery.** "The Book of You" (`templates/first-book.ts`) is
the product at `/`; "My Forever" (`templates/my-forever.ts`) is the single
keepsake page it was built on, at `/my-forever`. A book is a list of pages plus
a looks axis (`lib/book/types.ts`), and `lib/book/derive.ts` turns one of its
pages into the `PageTemplate` the renderer has always drawn — **nothing
downstream of `derive.ts` knows books exist.** Add a book capability there or
in the format, never in a component.

## The three rules this codebase is built on

**A page template is data, not code.** `lib/template/types.ts` is the format and
carries its own reasoning. Add a capability by adding a *field* with a stated
meaning for its absence, never by adding a branch in a component.

**One renderer.** `lib/render/svg.ts` draws the page; the screen inlines its
output and `lib/render/raster.ts` rasterises the same string.
`test/one-renderer.test.ts` fails on any `if (forPrint)`. If the screen needs
something the print file must not have, it is an *option on the render call*
that the print path does not pass — `guides` is the only example.

**Nothing reads an optional field directly.** `lib/template/defaults.ts` holds
the tolerant readers. A stored template or fill can come from a newer publisher
or a hand-edited file, and the renderer's duty is to draw the sane thing.

## The editor edits the fill, never the template

`lib/editor/` is pure arithmetic and the React in `app/_components/` is glue
over it, which is why the editor is tested without a browser. A gesture becomes
a `Crop` (`lib/editor/view.ts`) and `placePhoto` does the placing — there is no
editor-side layout, so there is nothing to drift from the renderer.

Two rules that are not obvious:

**A written view is clamped to the range that does something**
(`clampCentre`), not merely to 0–1. Storing travel that only `cropFor` clamps
away makes the next drag stick for exactly that distance — invisible in a unit
test, obvious to a thumb.

**Crops are produced at the window's own aspect ratio.** `placePhoto` covers a
mismatched crop by scaling on the larger axis, so a crop of the wrong shape
puts part of what the customer framed outside the window.

## Text can only be what the font can write

`resvg` runs with `loadSystemFonts: false`, so a codepoint the two vendored
TTFs lack prints as nothing while the browser substitutes a face and shows it
correctly. Neither covers Cyrillic or emoji — measured, not assumed.
`lib/render/coverage.ts` declares each face's codepoints and
`test/coverage.test.ts` regenerates them from the files, printing the
replacement string when they disagree. Everything a customer types goes through
`lib/editor/text.ts`, whose one contract is that no input produces a fill
`validateFill` would refuse.

## Facts the repository does not have

`lib/product.ts` is a union whose only `value` field is on the
`confirmed: true` arm, so a price nobody has supplied cannot be written — add
the number *and* flip the arm, never one or the other. `lib/book/editions.ts`
plays the same trick with money: it has fields for a price and no field for a
"was", a percentage or an expiry, so a misleading price comparison is
unrepresentable rather than discouraged. `docs/pricing.md` says why that is a
legal position and not a taste one.

**The open question nobody may close by accident is the trim.** The book
declares an 8.00 in trim at 3600 px a page; what Printify actually asks for is
unread, and 3150 (My Forever's number) matches no square trim at 300 DPI. The
page size is declared data on the book, so the answer is an edit to
`page.canvas`/`page.print` and a restamp — and no test or component reads a page
size from anywhere else. `docs/print.md` § The square trim nobody has pinned
down.

## The buyer flow is a form, not an editor

The shape is settled by research: one step that says so, straight into the
whole book with **no watermark, no account and no wall**, the extras offered on
the spread they affect, and one `Continue`. `test/book-flow.test.tsx` asserts
the absence of the wall rather than trusting anybody to remember it.

**The opening spread is babyless on purpose.** It is the one spread identical
across every look, which is exactly why it carries the buyer's photograph,
dedication and from-line — switching look cannot reflow anything they typed.
The consequence to remember: the chooser's tiles must come from a page with a
baby on it, which is why `BookTemplate.tilePage` is declared and `validateBook`
refuses a babyless one.

**Crop is the one thing the buyer may move**, and it moves nothing on the page:
a gesture becomes a `PhotoView`, `cropFor` turns it into the `Crop` the format
already defines, and an untouched photograph writes **no crop field at all** —
which is what keeps `orderFingerprint` stable and a reprint of an old order the
same document.

## Two things that will bite

**Restamp the template.** `templates/*.ts` carry `rev`, eight hex of their own
content hash. Edit a template and `npm run print` (or `npm run book`) refuses
until `rev` is updated — it prints the value to use. `test/template.test.ts`
and `test/book-format.test.ts` assert it too.

**Keep the render deterministic.** Every wobble comes from a seeded
`mulberry32` in `lib/render/random.ts`. `Math.random` anywhere in a render path
breaks the byte-identity test and makes the committed print file meaningless.
Re-run `npm run print` and commit `data/` whenever a render legitimately
changes.

## Writing a test here

`.github/workflows/ci.yml` runs lint, the whole suite, the build, and a check
that `npm run print` leaves `data/` unchanged. **Never narrow what the gate
looks at** — not a file list, not a `-t` filter, not a tighter `include` in
`vitest.config.mts`. `test/config.test.ts` fails if anybody does, including by
adding a test file with an extension the runner does not collect.

Pixel assertions live in `test/pixels.ts`. The standard is that a test which
would pass if the renderer drew nothing is not a test: every content assertion
is paired with the same assertion against a render with that layer removed. A
quick way to check a new test earns its place is to mutate the code it covers
and confirm it goes red.

**Derive the numbers a test asserts, never type them.** Boxes come from the
template's own slots, floors from the slot that implies them, counts from the
list. The trim is an open question, so a suite full of hand-typed coordinates
is a suite that has to be rewritten the day it is answered — and in the
meantime every one of those assertions points at empty cream without saying so.

**React here is glue and is tested without a browser.** There is no DOM in the
suite: component tests render with `renderToStaticMarkup`, so effects do not
run and only the state a visitor arrives in is visible. Everything stateful
lives in `lib/` as a pure function and is tested there. A component that needs
a value tested should take it as a prop — that is why `app/_book/Confirm.tsx`
does.

## Secrets

The repository is public. `.env.example` names every variable and carries no
value for any of them. Two have a reader: `R2_PUBLIC_BASE_URL`, a public URL,
and `STRIPE_SECRET_KEY`, read only by `lib/checkout.ts` to decide whether the
shop is open. Its value is never logged, returned or rendered.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
