# The page template format

**A page is a description a renderer reads.** Not markup, not a React
component, not a Figma file — a canvas, an ordered stack of layers, and typed
slots a customer fills.

This is the one artefact that outlives any particular page. `lib/template/types.ts`
is the format and carries the reasoning field by field; this document is the
shape of it, the decisions that are expensive to reverse, and an honest account
of where it follows Keepnook's prior art and where it does not.

---

## Why it is data

The captain asked whether these templates might later live inside Keepnook, so
users could fill them and print from the iPad app. The answer assumed here is
**yes**, and that single assumption decides nearly everything below: a page has
to be authored once and rendered by whoever is asked to render it, rather than
authored twice and kept in step by hand.

A page expressed as code is a page only this codebase can draw. A page expressed
as data is a few kilobytes of JSON that can be served from R2, diffed in a pull
request, read by a Swift renderer that has never heard of Next.js, and —
crucially — **validated**, which is the part that catches a heart drifting past
the trim before a guillotine does.

---

## The shape

```
PageTemplate
├── schema: 1                 the format's own version; an unknown one is refused
├── id, rev                   stable id, plus eight hex of its own content hash
├── name
├── canvas
│   ├── unit: "pt"            every length is 1/72 inch
│   ├── width, height         the WHOLE artboard, bleed included
│   ├── bleed                 how far inside the edge the trim runs
│   ├── safe                  a further inset; customer content must stay inside
│   └── background
├── print
│   ├── pixels                 { width, height } of the print file
│   ├── colourSpace: "srgb"
│   └── encoding: "png"
└── layers[]                  bottom first; the array order IS the stack
    ├── LayerBase             id, frame {x,y,w,h}, rotation?, opacity?
    └── one of:
        ├── { kind: "art",       art }           cloth, tape, kiss — drawn from numbers
        ├── { kind: "shape",     shape }         panels, with stroke and shadow
        ├── { kind: "image",     asset, mask? }  fixed artwork, by content hash
        ├── { kind: "photoSlot", slot, mask?, stroke?, placeholder?, prompt? }
        └── { kind: "textSlot",  slot, font, size, colour, align?, baseline?,
                                 lineHeight?, letterSpacing?, transform?, maxChars }

PageFill
├── schema: 1
├── templateId, templateRev   which page, and exactly which revision of it
├── photos: { [slot]: { asset, crop? } }
└── texts:  { [slot]: string }
```

---

## The five decisions that are expensive to reverse

### 1. A template and a customer's filling of it are two documents

A `PageTemplate` is published, immutable, and shared by every order. A `PageFill`
is one customer's photographs and words, naming its template by `(id, rev)`.

**Keepnook does the opposite** and is right to: a `PhotoElement` carries its own
`assetId` because a notebook page *is* the user's document, and there is no
published original to go back to.

A shop needs the other shape. A thousand orders must not be a thousand copies of
the same artwork; a typo in a template must be fixable without rewriting what a
customer typed; and "what did this customer actually approve" has to be
answerable from one small document. Splitting them also makes the editor's job
obvious before it is written — it edits a `PageFill` and cannot touch anything
else, so a customer dragging a heart off the card is not a thing that can
happen.

### 2. Nothing in a template holds pixels

Artwork is an `AssetRef`: a sha256, a mime type, and the file's own pixel
dimensions. `lib/assets/resolve.ts` turns one into bytes, from `fixtures/assets/`
or from R2, and **verifies the digest against the bytes every time**.

This is Keepnook's rule verbatim — `ArtEntry.rev` is *"stored on the element that
places it, so a pack update cannot repaint a page that already exists"*. The
dividends are the same: new artwork is a different address rather than a
redefinition, a response can be cached forever because it is immutable by
construction, and a re-print of a year-old order is byte-identical to the first.

The digest check is the part worth insisting on. An `AssetRef` is an address
*and* a claim; a renderer that trusts the claim prints whatever happens to be
under the key, which is exactly the failure that is silent until a book arrives.

### 3. An absent field is a defined state, never a broken one

Every optional field names what its absence means, and **nothing reads one
directly** — `lib/template/defaults.ts` holds the tolerant readers and the rest
of the codebase goes through them. A stored document can arrive from a newer
publisher, from a hand-edited file, or from last year's build.

The renderer's duty when it meets something it does not understand is to draw
the sane thing. An unknown `Mask` is the plain box, because a photograph in the
wrong outline is a flaw somebody can point at and a photograph that refused to
draw is a hole in a book that was paid for. An unknown `Art` kind draws
**nothing**, because the opposite is true there: inventing a brown rectangle
where a newer publisher meant something else is worse than leaving the cloth
bare.

Keepnook's `photoCrop` is the pattern — clamp, fall back, and never divide by
something a file told you.

### 4. There is no `z`; the array order is the stack

Keepnook needs a numeric depth: its user reorders elements one at a time, and
renumbering the whole spread for one tap would be a lie about what changed
(`Stacked`, in its `lib/types.ts`, is worth reading on this). A **published
template** is edited as a file, where moving a line *is* the reorder. A second
ordering stored beside the real one would only be somewhere for the two to
disagree.

### 5. A mask is a named kind, not a path

`{ kind: "heart", cleft: 0.26 }`, and the geometry lives in exactly one place —
`lib/template/geometry.ts` — as a pure function of the box it is asked to fill.
A path string baked into JSON is a picture of a shape at one size, and the first
time a designer resizes a window it is wrong in a way nobody looks for.
`test/geometry.test.ts` asserts the property that matters: the heart is the same
shape at any size.

---

## Where this deliberately differs from Keepnook

| | Keepnook | Here | Why |
|---|---|---|---|
| Document shape | one document; elements carry their own assets | template + fill, two documents | A published template is shared by every order; a fill is one customer's. See above. |
| Depth | numeric `z` across a spread | array order | A template is edited as a file, not by tapping. |
| Crop coordinates | `PhotoCrop`, 0–1 of the **cover-fitted frame** | `Crop`, 0–1 of the **source photograph** | A template whose heart is made slightly larger must not silently re-crop a thousand customers' photographs. Source coordinates are independent of the slot, and a pan/zoom gesture produces exactly this rectangle with no frame to divide by. |
| Text fitting | measured layout | explicit anchor + `maxChars` | See below. |
| Published content | a PDF document plus a manifest | a JSON template plus content-addressed assets | Keepnook's designs are documents to import; these are pages to *fill*, which needs typed slots a document cannot carry. |

**The crop difference is smaller than it sounds, and worth being exact about.**
Keepnook's cover-fitted frame *is* the whole photograph, uniformly scaled — so a
fraction of the frame and a fraction of the source are **the same four
numbers**, and a fill moved between the two formats needs no arithmetic at all.

What differs is what the definition is anchored to, and therefore what happens
at the two edges:

- **A resized slot.** Keepnook's frame is recomputed from the element's current
  size, so the meaning of a stored crop depends on a box that a designer can
  move. Ours does not: enlarging a heart in a published template shows *more
  around* the same crop rather than re-interpreting it.
- **A crop whose proportions disagree with its window** — which a hand-edited
  fill or an editor's rounding can produce. `placePhoto` scales by the *larger*
  of the two axes and centres, so the window is covered and the picture stays in
  proportion. A squashed face is a defect anybody can see in a printed book; a
  couple of cropped pixels is not. `test/crop.test.ts` pins this.

---

## The text that did not fit

A text slot carries `maxChars`, and **a fill longer than it is refused — not
shrunk and not clipped**.

Auto-fitting needs measurement, and measurement is the one thing the two
renderers cannot be made to agree on. The browser shapes text with its engine;
`resvg` shapes it with `rustybuzz`. Two shapers can disagree about the advance
width of a string by a fraction of a point. An auto-fitting box would turn that
fraction into a different type size, a different line break, or a word that fits
on screen and does not in the print file — a difference nobody sees until a book
is in a box.

So the seam is held where it is harmless: **sub-point tracking differences
inside a line that the designer has already placed**. `frame` is a real
rectangle, `align` says which edge the text hangs from, `baseline` says where
the first baseline sits, and the renderer measures nothing.

A better editor is the obvious next move and does not need the format to change:
measure in the browser, refuse at the same boundary, and offer the customer a
shorter word. `maxChars` is the floor, not the ceiling.

---

## What the format does not do yet

Named, so nobody has to guess whether it was considered.

- **Multiple pages.** A book is a list of these; nothing here forbids it and
  nothing here does it.
- **Text auto-fit.** See above.
- **Per-customer decoration** — choosing the cloth colour, moving a heart. The
  slot model would carry it (`Art` is already parameterised), but a fill cannot
  currently say anything about a decoration layer.
- **Non-photographic image slots** — a signature, a drawing.
- **A JSON Schema.** The format is enforced by TypeScript and
  `lib/template/validate.ts`, which is enough while the only publisher is this
  repository and is not enough the day a second one exists.

---

## Reading order

1. `lib/template/types.ts` — the format, with the reasoning
2. `templates/my-forever.ts` — one page expressed in it
3. `lib/render/svg.ts` — the renderer, and the one seam it names
4. `lib/template/validate.ts` — what is refused
5. [`print.md`](print.md) — the print file, and the bleed question
