# The print file

**What goes to Printify, and what is still unknown about it.**

The captain's sentence was *"once saved, I want to download it in 3150x3150 px
size"*, confirmed against Printify. That number is load-bearing all the way to a
physical object, so this document says what rests on evidence, what rests on a
reading of Printify's own guidance, and what is still an assumption.

**There are now two products and they do not agree about this number**, which is
the most important thing on this page. Read
[§ The square trim nobody has pinned down](#the-square-trim-nobody-has-pinned-down).

---

## What the files are

### The baby book — `templates/first-book.ts`

| | |
|---|---|
| Size | **3600 × 3600 px** a page, 25 pages, measured out of the PNG header by `test/book-print.test.ts` |
| Artboard | 612 × 612 pt = **8.5 in square**, bleed included |
| **Trim** | 576 × 576 pt = **8.00 in square exactly** — the size both target products come in |
| Resolution | **450 DPI across the trim**, 423.5 across the artboard. Derived, never declared |
| Colour | **sRGB**, as below |
| Encoding | PNG a page, or one PDF of the whole book (`/DeviceRGB`) |

The committed example is `data/bk-first-book-buyer-flow/`.

### My Forever — `templates/my-forever.ts`

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

<a id="the-square-trim-nobody-has-pinned-down"></a>

## The square trim nobody has pinned down

**This is the open question, and this section exists so that nobody resolves it
by accident.**

### What is settled

**The baby book is 8 × 8 inches.** The captain's specification names Printify's
[Softcover Photo
Book](https://printify.com/app/products/2733/generic-brand/softcover-photo-book)
— 8 × 8 in, its only size — and its [Hardcover Photo
Book](https://printify.com/app/products/2737/generic-brand/hardcover-photo-book),
8 × 8 in being one of four. One artwork set serves both, which is what makes the
hardcover an *upgrade* rather than a second product.

`templates/first-book.ts` therefore declares an 8.5 in artboard with a quarter
inch of bleed on every edge, so its **trim is 8.00 in exactly**. That is a
decision about the object, not about the file.

### What is not settled

**Printify's stated print-area pixel size for that product.** It is published
only inside their signed-in Product Creator, so reading it needs somebody signed
in to the account with the product open. Nobody has.

### What the arithmetic actually says, which is evidence either way

| Pixels | Over an 8.00 in trim | Over the 8.5 in artboard |
|---|---|---|
| 2400 | **300.0 DPI** | 282.4 |
| 3150 | 393.75 | 370.6 |
| 3600 | **450.0 DPI** | 423.5 |

Three things are worth stating plainly, and none of them resolves it:

**2400 is the only round number here.** 8 in at 300 DPI is 2400 px exactly. If
Printify's figure is a straightforward "trim at 300 DPI", that is what it will
say.

**3150 is a round number over no square trim anybody sells.** It is 10.5 in at
300 DPI, and 10.5 in is not a size either photo book comes in. Over an 8 in trim
it is 393.75 DPI, which is not a figure a printer quotes. The likeliest
explanation remains the one the captain's own note offers — that 3150 is
Printify's *recommended file size* for the 8 × 8 rather than its trim at 300 DPI
— but that is a hypothesis and it has not been checked. **This doubt was raised
on 31 October and is still unanswered.**

**3600 clears every candidate**, which is why it is what is generated. It
downscales to 2400, to 3150, and to anything between; upscaling to any of them
later would be the expensive mistake, because the artwork is AI-generated
watercolour linework and it goes mushy under an upscale. Downscaling is free.

### How it is handled rather than guessed

**The page size is declared data on the book** — `page.canvas` and `page.print`
in `templates/first-book.ts`, two numbers on one object. Changing the trim is an
edit to those, a restamped `rev`, and `npm run book`. No component, validator or
test anywhere reads a page size from anywhere else; `test/book-format.test.ts`
asserts the trim is 8 in *by deriving it from the declared bleed*, and
`test/book-print.test.ts` measures every box it checks off the template's own
slots, so neither has to be rewritten when the answer lands.

### What has to happen

Somebody signed in to the Printify account opens the Product Creator for
blueprint **2733** (softcover) and **2737** (hardcover), 8 × 8 in, and reads the
**stated print-area pixel dimensions** off the file-requirements panel. That one
number closes this.

### Where the trim falls inside it

A second, smaller question, and it is My Forever's too: Printify does not
publish where the trim line sits inside a stated print area. Both 0.125 in and
0.25 in are standard and photo books tend to the larger. Both templates declare
the **larger** — 18 pt — because over-declaring moves the trim guide *inwards*
and keeps content further from any real cut line, where under-declaring moves it
towards one.

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
| My Forever's file is 3150 × 3150 | **Verified** — read out of the PNG header by a passing test |
| The book's pages are 3600 × 3600 | **Verified** — read out of the PNG header by a passing test |
| The whole book opens as a PDF with a page per page | **Verified** — the container is parsed back out of its own bytes |
| Either file carries an sRGB chunk before IDAT | **Verified** — asserted on a fresh render |
| The committed files are what the renderer produces today | **Verified** — byte-for-byte equality in a passing test |
| Every slot sits ≥ 0.5 in inside the file edge | **Verified** — `slot.outsideSafeArea` would fire, and does when a slot is moved |
| The book's trim is 8.00 in | **Decided** — the captain's specification of 6 November, naming both Printify products; derived here from the declared bleed |
| Printify's stated print area already includes bleed | **Documented** — Printify's own knowledge-hub wording, quoted above; not confirmed in the Product Creator |
| Printify wants sRGB | **Documented** — Printify help centre |
| The trim line sits 0.25 in inside the artboard | **Assumed, conservatively** — not measured; see above |
| 3150 px is the right number for My Forever | **Captain-confirmed** — stated in the brief as checked against Printify |
| 3600 px is the right number for the book | **Deliberately over-specified** — it clears every candidate trim; Printify's own stated figure is **unread**, and 3150 matching no square trim at 300 DPI is **still unanswered since 31 October** |
