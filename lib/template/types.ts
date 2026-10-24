/**
 * The page template format. **This file is the product's spine.**
 *
 * A template is *data*: a canvas, an ordered stack of layers, and typed slots a
 * customer fills. It is not markup and it is not code, because the captain has
 * already said the templates should one day be readable by the Keepnook iPad
 * app — so a page has to be authored once and rendered by whoever is asked to
 * render it, rather than authored twice and kept in step by hand.
 *
 * Three rules hold the format together. Breaking any of them is the kind of
 * mistake that is invisible on page one and expensive on page twenty.
 *
 * **1. A template and a customer's filling of it are two documents.** A
 * `PageTemplate` is published, immutable and shared by every order; a
 * `PageFill` is one customer's photos and words, and names its template by id
 * and revision. Keepnook does the opposite — a `PhotoElement` carries its own
 * `assetId`, because a notebook page *is* the user's document and there is no
 * published original to go back to. A shop needs the other shape: a thousand
 * orders must not be a thousand copies of the same artwork, and a typo in a
 * template must be fixable without rewriting what a customer typed. See
 * `docs/template-format.md` § Template and fill are two documents.
 *
 * **2. Nothing in a template holds pixels.** Artwork is named by an `AssetRef`
 * — a content hash — and resolved to bytes by `lib/assets/resolve.ts`. This is
 * Keepnook's rule verbatim (`ArtEntry.rev`, "stored on the element that places
 * it, so a pack update cannot repaint a page that already exists"), and it is
 * what makes a template a few kilobytes of JSON that can be served from R2,
 * diffed in a pull request, and read by a renderer that has never heard of the
 * bucket.
 *
 * **3. An absent field is a defined state, never a broken one.** Every optional
 * field below names what its absence means, and every reader of one goes
 * through a tolerant resolver in `./defaults.ts` rather than reading the field
 * directly. A stored value can arrive from a newer publisher or a hand-edited
 * JSON, and the renderer's duty when it does not understand something is to
 * draw the sane thing, never to draw nothing. Keepnook's `photoCrop` is the
 * precedent and `test/defaults.test.ts` pins ours.
 */

// ---------------------------------------------------------------------------
// Units, boxes and colour
// ---------------------------------------------------------------------------

/**
 * Every length in a template is in **points** (1/72 inch), the unit a type size
 * is already quoted in.
 *
 * The format does not carry a DPI and must not: `print.pixels` plus
 * `canvas.width` *is* the DPI, derived rather than declared, so the two can
 * never disagree. Keepnook's content pipeline draws the same line between
 * declared intent and derived fact, and refuses a manifest that declares a
 * fact it could measure.
 */
export type Pt = number;

/** A rectangle in page units, top-left origin, y down — SVG's own convention. */
export interface Box {
  x: Pt;
  y: Pt;
  width: Pt;
  height: Pt;
}

/**
 * `#rgb`, `#rrggbb` or `#rrggbbaa`. Named CSS colours are deliberately not
 * allowed: they are a second spelling of the same thing, and the renderer
 * would have to carry a table to validate one.
 */
export type Colour = string;

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

/**
 * An immutable address for some bytes, never the bytes themselves.
 *
 * `sha256` is the full lowercase hex digest of the file. Content addressing is
 * taken from Keepnook (`docs/content-hash.md`): it makes a change to artwork a
 * *different* address rather than a redefinition of the existing one, so a
 * template published last month cannot be silently repainted by re-uploading a
 * file, and a print re-run of an old order is byte-identical to the first.
 *
 * `mime` and `px` are carried because the renderer needs the photo's natural
 * size to cover-fit it and must not be asked to decode an image to find out —
 * exactly why `ArtEntry` carries a derived `px`. They are **derived facts about
 * the bytes**: whoever writes an `AssetRef` measures them, and
 * `lib/assets/resolve.ts` verifies the digest it was given against the bytes it
 * got, so a lie here fails loudly rather than printing wrong.
 */
export interface AssetRef {
  sha256: string;
  mime: "image/png" | "image/jpeg" | "image/webp";
  /** [width, height] of the file, in its own pixels. */
  px: [number, number];
  /** Human-facing name, for a pull request and an alt attribute. Never an address. */
  label?: string;
}

// ---------------------------------------------------------------------------
// Masks — the shape a photograph is cut to
// ---------------------------------------------------------------------------

/**
 * The outline a photograph (or a piece of fixed artwork) is cut to.
 *
 * The geometry of each lives in exactly one place, `./geometry.ts`, and is a
 * pure function of the box it is asked to fill. That is the whole reason a mask
 * is a *named kind* rather than a path string in the template: a path baked
 * into JSON is a picture of a shape at one size, and the first time a designer
 * resizes a slot it is wrong in a way nobody looks for. Keepnook's
 * `photoSilhouette` is the same decision.
 *
 * `rect` with no radius is the plain box — the default, and what an
 * **unrecognised** mask falls back to, because a photograph in the wrong
 * outline is a flaw and a photograph that did not draw is a blank page.
 */
export type Mask =
  | { kind: "rect"; radius?: Pt }
  | { kind: "ellipse" }
  | {
      kind: "heart";
      /**
       * How deep the cleft between the lobes sits, 0–1 of the box height.
       * Absent is `0.26`, the value this page's hearts are cut at.
       */
      cleft?: number;
    };

// ---------------------------------------------------------------------------
// Procedural decoration
// ---------------------------------------------------------------------------

/**
 * Decoration the renderer **draws from numbers**, rather than fetches.
 *
 * Every piece of furniture on this page — the cloth, the tape, the kiss — is
 * one of these. That is partly a licence fact (artwork generated from declared
 * parameters is ours by construction, and this page's idiom is a scrapbook
 * convention nobody owns) and partly a print fact: a procedural mark has no
 * resolution, so the 3150 px file is not a blown-up 900 px sprite.
 *
 * **Anything random in here is seeded.** `seed` drives a deterministic
 * `mulberry32` in `lib/render/random.ts`, so a template renders byte-identically
 * every time, on every machine. Without that the committed print file could not
 * be evidence of anything and a snapshot test could not exist.
 */
export type Art =
  /** A cloth ground: a flat colour, a weave, and dots on a staggered grid. */
  | {
      kind: "polkaCloth";
      background: Colour;
      dot: Colour;
      /** Dot radius. */
      radius: Pt;
      /** Centre-to-centre spacing of the grid before staggering. */
      pitch: Pt;
      /** Threads of the weave. Absent draws no weave — a flat dotted ground. */
      weave?: { colour: Colour; width: Pt; pitch: Pt; opacity: number };
    }
  /**
   * A strip of translucent tape: a tinted band with torn short edges, a
   * highlight along the top and a soft shadow under it.
   */
  | {
      kind: "tape";
      colour: Colour;
      opacity: number;
      /** How far the torn ends wander from a straight cut. */
      tear: Pt;
      seed: number;
    }
  /**
   * A lipstick kiss: a cupid's-bow upper lip, a fuller lower lip, and creases
   * that break the colour up the way a real print does.
   */
  | {
      kind: "kiss";
      colour: Colour;
      /** How many lip creases are drawn. More reads as a drier lipstick. */
      creases: number;
      seed: number;
    };

/** A flat or rounded panel — the white card this page's hearts sit on. */
export interface ShapeSpec {
  kind: "rect";
  radius?: Pt;
  fill?: Colour;
  stroke?: { colour: Colour; width: Pt };
  /** A soft drop shadow. Absent draws none. */
  shadow?: { colour: Colour; blur: Pt; dx: Pt; dy: Pt };
}

// ---------------------------------------------------------------------------
// Layers
// ---------------------------------------------------------------------------

/**
 * What every layer has, whatever it draws.
 *
 * **There is no `z`.** The stack is the array order, bottom first. Keepnook
 * needs a numeric depth because its user reorders elements one at a time and
 * renumbering the whole spread for one tap would be a lie about what changed; a
 * published template is edited as a file, where moving a line *is* the
 * reorder, and a second ordering stored beside the real one is just somewhere
 * for the two to disagree.
 *
 * `rotation` is degrees clockwise about the layer's own centre, which is
 * Keepnook's `PageElementBase.rotation` exactly.
 */
export interface LayerBase {
  /** Stable within the template, forever. Never renamed, never reused. */
  id: string;
  /** The layer's box before rotation. */
  frame: Box;
  /** Degrees clockwise about the centre of `frame`. Absent is `0`. */
  rotation?: number;
  /** 0–1. Absent is `1`. */
  opacity?: number;
}

/** Fixed decoration the customer never touches. */
export type DecorationLayer = LayerBase &
  (
    | { kind: "art"; art: Art }
    | { kind: "shape"; shape: ShapeSpec }
    | {
        kind: "image";
        asset: AssetRef;
        mask?: Mask;
      }
  );

/**
 * A hole in the page shaped like something, which one of the customer's
 * photographs fills.
 *
 * `slot` is the key a `PageFill` answers with a photo, and it is a **name**
 * rather than an index on purpose: reordering the layers of a template must not
 * silently move a customer's photographs between windows.
 */
export interface PhotoSlotLayer extends LayerBase {
  kind: "photoSlot";
  slot: string;
  /** The outline the photograph is cut to. Absent is the plain box. */
  mask?: Mask;
  /** Drawn on top of the photograph, inside the same mask. A mount, a shadow line. */
  stroke?: { colour: Colour; width: Pt };
  /** What is shown while no photograph has been chosen. Absent draws a dashed hint. */
  placeholder?: { fill?: Colour };
  /** What the designer suggests the window is for. Shown by the editor, never printed. */
  prompt?: string;
}

/** Where one of the customer's words goes. */
export interface TextSlotLayer extends LayerBase {
  kind: "textSlot";
  slot: string;
  /**
   * A key in `lib/render/fonts.ts`, never a CSS family name.
   *
   * The indirection is the point: the browser needs an `@font-face` family, the
   * rasteriser needs a file on disk, and the iPad app will need a third thing
   * again. One key resolving to all of them is the only arrangement where a
   * template cannot name a face that one renderer has and another has not.
   * Keepnook learnt this the hard way — see the note on `TextElement.fontSource`
   * about two namespaces sharing one string.
   */
  font: string;
  /** Type size in points. */
  size: Pt;
  colour: Colour;
  /**
   * Which edge of `frame` the text hangs from. Absent is `"start"`.
   *
   * `frame` is a real rectangle — the box an editor draws a selection round and
   * the box `./validate.ts` checks against the safe area — and the anchor is
   * *derived* from it and this: the left edge, the centre, or the right edge.
   * Carrying the anchor as its own pair of numbers beside the box would be two
   * statements of one fact, and the day they disagreed the screen and the print
   * file would disagree with them differently.
   */
  align?: "start" | "middle" | "end";
  /**
   * Where the first baseline sits, measured down from `frame.y`.
   *
   * Declared rather than measured, and that is the point: a baseline derived
   * from a face's ascent is a number only a shaping engine knows, and the
   * browser's and the rasteriser's would not be the same number. A designer
   * placing the baseline by eye is placing it in both pictures at once.
   *
   * Absent is `size`, which puts a single line of most faces comfortably inside
   * the top of its box.
   */
  baseline?: Pt;
  /**
   * Distance from one baseline to the next, for a fill with more than one line.
   * Absent is `size × 1.2`.
   */
  lineHeight?: Pt;
  /** Extra tracking between letters. Absent is `0`. */
  letterSpacing?: Pt;
  /** Absent is `"none"`. */
  transform?: "none" | "uppercase";
  /**
   * The longest fill this slot accepts, in characters.
   *
   * **A fill longer than this is refused, not shrunk and not clipped.** The
   * renderer cannot measure text identically in a browser and in a rasteriser
   * without shipping a shaping engine to both, so auto-fitting would be the one
   * place the two pictures were allowed to differ — and it would differ in the
   * print file, where nobody sees it until it is in a box. A refusal at order
   * time is a worse editor and an honest one. See `docs/template-format.md`
   * § The text that did not fit.
   */
  maxChars: number;
}

export type Layer = DecorationLayer | PhotoSlotLayer | TextSlotLayer;

// ---------------------------------------------------------------------------
// The canvas
// ---------------------------------------------------------------------------

/**
 * The artboard, and the two insets that say which parts of it survive the
 * guillotine.
 *
 * `width`/`height` are the **whole** artboard: what the print file covers, edge
 * to edge, bleed included. Printify's own file-prep guidance is to design onto
 * the template its Product Creator hands you, whose outer edge *is* the bleed
 * edge — "stretch your background graphics all the way to the outer bleed edge,
 * every time" — so the size Printify states is the size you supply, and nothing
 * here ever enlarges it. See `docs/print.md` for the evidence and for the one
 * number still open.
 *
 * `bleed` is how far inside that edge the trim line runs. `safe` is a further
 * inset inside the trim that nothing a customer can see is allowed to cross.
 * `./validate.ts` enforces the second against every slot, so moving a heart too
 * near the edge fails a test rather than a book.
 */
export interface Canvas {
  unit: "pt";
  width: Pt;
  height: Pt;
  /** Trim is `bleed` inside every edge. `0` means the artboard *is* the trim. */
  bleed: Pt;
  /** A further inset inside the trim. Customer content must stay within it. */
  safe: Pt;
  /** Painted first, under every layer. The ground beneath the ground. */
  background: Colour;
}

/**
 * How the print file is written.
 *
 * `pixels` is asserted against the bytes of a real render by
 * `test/print-size.test.ts` — never trusted as a declaration, because a config
 * value that claims a size is exactly the thing that goes on claiming it after
 * the renderer stops producing it.
 */
export interface PrintSpec {
  pixels: { width: number; height: number };
  /**
   * `srgb` is the only value, and it is written into the file rather than
   * assumed: `lib/render/raster.ts` stamps a PNG `sRGB` chunk with rendering
   * intent 0 (perceptual). Printify's guidance is to supply sRGB, and an
   * untagged PNG is *treated* as sRGB by every RIP — but "treated as" is a
   * convention and a chunk is a fact, and the chunk costs thirteen bytes.
   */
  colourSpace: "srgb";
  encoding: "png";
}

// ---------------------------------------------------------------------------
// The two documents
// ---------------------------------------------------------------------------

export interface PageTemplate {
  /** The format's own version. A reader that does not know it must refuse. */
  schema: 1;
  /** Stable forever. Never renamed, never reused — an order refers to it. */
  id: string;
  /**
   * Eight hex of this template's own content hash, stamped at publish.
   *
   * A `PageFill` names `(templateId, rev)`, so re-printing a year-old order
   * cannot pick up a template that has been edited since. Keepnook's `ArtEntry.rev`,
   * applied one level up.
   */
  rev: string;
  name: string;
  canvas: Canvas;
  print: PrintSpec;
  /** Bottom first. The array order *is* the stack. */
  layers: Layer[];
}

/**
 * How the customer's photograph sits inside its window.
 *
 * **The rectangle of the original photograph that fills the slot**, in 0–1 of
 * the photograph's own width and height. Absent means the whole picture,
 * cover-fitted and centred, which is what a photograph lands as.
 *
 * Keepnook expresses the same idea against the *cover-fitted frame* instead
 * (`PhotoCrop`). Source coordinates are the better half of that trade here
 * because they are independent of the slot: a template whose heart is made
 * slightly larger must not silently re-crop a thousand customers' photographs,
 * and a pan/zoom gesture produces exactly this rectangle with no frame to
 * divide by. The cost is that this is not Keepnook's field and would have to be
 * converted at the border if these documents are ever read there; the
 * conversion is six lines, and `docs/template-format.md` carries it.
 */
export interface Crop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PhotoFill {
  asset: AssetRef;
  crop?: Crop;
}

export interface PageFill {
  schema: 1;
  templateId: string;
  /** The exact template revision this fill was composed against. */
  templateRev: string;
  /** Keyed by `PhotoSlotLayer.slot`. A missing key is an empty window. */
  photos: Record<string, PhotoFill>;
  /** Keyed by `TextSlotLayer.slot`. A missing key draws nothing. */
  texts: Record<string, string>;
}
