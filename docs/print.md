# The print file

**What goes to Printify, and what is still unknown about it.**

The captain's sentence was *"once saved, I want to download it in 3150x3150 px
size"*, confirmed against Printify. That number is load-bearing all the way to a
physical object, so this document says what rests on evidence, what rests on a
reading of Printify's own guidance, and what is still an assumption.

---

## What the file is

| | |
|---|---|
| Size | **3150 × 3150 px**, measured out of the PNG header by `test/print-size.test.ts` |
| Artboard | 756 × 756 pt = **10.5 in square** |
| Resolution | **300 DPI**, derived — `print.pixels ÷ canvas.width × 72`, never declared |
| Colour | **sRGB**, written into the file as a PNG `sRGB` chunk (intent 0, perceptual) with a matching `gAMA` |
| Encoding | PNG, RGBA, ~1.5 MB |

The committed example is `data/bk-spine-template-and-print/`.

---

## Does Printify want bleed?

**Short answer: no — not as extra pixels.** The 3150 is the whole canvas, not a
trim size, and the artboard is not enlarged.

### The evidence

Printify's own file-prep guidance ([POD File Prep Checklist: Bleed, DPI & Safe
Zones](https://printify.com/knowledge-hub/file-prep-blueprint-for-bleeds/)) tells
a seller to work from the template the Product Creator hands them:

> Download the design template directly from the Product Creator. Each product
> has its own template

…with guide layers for *"the bleed area (red line), the trim line (dashed), and
the Safe Zone (green box)"*, and:

> Stretch your background graphics all the way to the outer bleed edge (the red
> line), every time.
>
> Keep every key visual safely inside the inner Safe Zone (the green box).

So the template's **outer** edge is the bleed edge, the trim line sits *inside*
it, and the size Printify states is the size you supply. Printify's help centre
says the same thing from the other direction: *"the file requirements for each
print area"* are shown per product in the Product Creator, and the recommended
resolution is 300 DPI ([What type of print files does Printify
require?](https://help.printify.com/hc/en-us/articles/4483617936657-What-type-of-print-files-does-Printify-require)).
sRGB is the stated colour space.

That is the whole of the "do I make the canvas bigger" question, and the answer
is no. **3150 × 3150 is right as the artboard**, and a renderer that enlarged it
to "add bleed" would be supplying a file the Creator then scaled down.

### What is still open

**Where the trim line falls inside those 3150 pixels.** Printify does not
publish that number outside the Product Creator, and reading it needs somebody
signed in to the account with the product open. Both 0.125 in and 0.25 in are
standard; photo books tend to the larger.

**This is handled rather than guessed.** `canvas.bleed` is a declared field, and
the template declares the *larger* of the two — 18 pt (0.25 in) — because
over-declaring moves the trim guide **inwards** and keeps content further from
any real cut line, where under-declaring would move it towards one. A further
18 pt of `safe` sits inside that, and
`lib/template/validate.ts` refuses any template whose photo windows or words
cross it (`slot.outsideSafeArea`). Every customer-visible thing on this page is
therefore **at least 0.5 in from the edge of the file**, which survives any real
bleed between 0 and 0.25 in.

When somebody opens the Product Creator's template for this product, this
becomes one number in `templates/my-forever.ts`, a restamped `rev`, and a
re-run of `npm run print`. Nothing else moves.

### The one thing that is still a decision

**Which Printify product this is.** Printify lists a [Hardcover Photo
Book](https://printify.com/app/products/2737/generic-brand/hardcover-photo-book)
and a [Softcover Photo
Book](https://printify.com/app/products/2733/generic-brand/softcover-photo-book),
and the square size one provider offers is 8 × 8 in — which at 300 DPI is 2400
px, not 3150. 3150 px is 10.5 in at 300 DPI. Either the product is a different
one, or its print area is quoted at a size that includes a wrap, or it is quoted
at a different DPI. **The captain confirmed 3150 against Printify and that is
what is built**; the open question is only what it is 3150 *of*.

---

## Why sRGB is in the file and not only in this document

An untagged PNG is treated as sRGB by every RIP, which is why most pipelines get
away with saying nothing. "Is treated as" is a convention somebody else
maintains. `lib/render/png.ts` writes an `sRGB` chunk (13 bytes) and a matching
`gAMA` immediately after the header, where the specification requires both to
sit — before `PLTE` and before the first `IDAT`. `test/print-size.test.ts`
asserts the position as well as the presence, on a fresh render and not only on
the committed file.

CMYK is deliberately not offered. Printify asks for sRGB, the provider's RIP
does the separation with a profile matched to its own press, and a separation
done here would be a guess at somebody else's ink.

---

## Why the renderer, and not a screenshot

`lib/render/svg.ts` produces the page as SVG with a `viewBox` in page units and
**no width or height on the root element**. The page is therefore a shape rather
than a size, and the raster resolution is a pure multiplier applied at the very
end — which is what lets "show me this at 900 px" and "print this at 3150 px" be
the same call with one number changed.

The alternative — capturing the view that is already on screen — cannot produce
this file at all. No screen lays out 3150 pixels to be photographed. Keepnook's
`lib/spreadRender.ts` opens with the same argument and is worth reading.

---

## Evidence tiers

| Claim | Tier |
|---|---|
| The file is 3150 × 3150 | **Verified** — read out of the PNG header by a passing test |
| The file carries an sRGB chunk before IDAT | **Verified** — asserted on a fresh render |
| The committed file is what the renderer produces today | **Verified** — byte-for-byte equality in a passing test |
| Every slot sits ≥ 0.5 in inside the file edge | **Verified** — `slot.outsideSafeArea` would fire, and does when a slot is moved |
| Printify's stated print area already includes bleed | **Documented** — Printify's own knowledge-hub wording, quoted above; not confirmed in the Product Creator |
| Printify wants sRGB | **Documented** — Printify help centre |
| The trim line sits 0.25 in inside the artboard | **Assumed, conservatively** — not measured; see above |
| 3150 px is the right number for this product | **Captain-confirmed** — stated in the brief as checked against Printify |
