/**
 * **"The Book of You" — the first personalised baby book, as data.**
 *
 * **Twenty-four interior pages and a cover**, which is twelve spreads. That
 * number is the captain's, settled on 6 November and overriding the brief's
 * "40–50": twelve spreads at 2.000:1 is exactly what the artwork is, and it
 * lands exactly on **Printify's hardcover photo book, 24 pages fixed**, which
 * takes one raster per page — the only file this renderer makes. 40–50 pages
 * exists only at Lulu and Prodigi, and both want a PDF with a structure this
 * codebase does not write.
 *
 * The count is **`pages.length` and nothing else**. There is no constant to
 * keep in step and no component that counts to twenty-four.
 *
 * ## The three kinds of text, which is the thing to understand first
 *
 * | Kind | Who writes it | Where it lives |
 * |---|---|---|
 * | **Story** | the captain, once per spread | `BookPage.story`, below |
 * | **The name** | the buyer, per order | `BookFill.name` |
 * | **The dedication** | the buyer, per order | `BookFill.dedication` |
 * | **The from-line** | the buyer, per order, optional | `BookFill.from` |
 *
 * All three are **drawn by the renderer and never painted into artwork**, which
 * is what makes a typo one edit instead of twenty-four re-generations and keeps
 * a second language possible. The story may contain `{name}`, and
 * `lib/book/validate.ts` therefore checks every story line fits **with the
 * longest name the form will accept** — not merely with an empty one.
 *
 * ## Why this file is TypeScript and why it has a `.map` in it
 *
 * `my-forever.ts` is literal because a page is nine layers. A book is
 * twenty-five pages of which most carry one slot and differ only in which wash
 * is behind them. So the scenes are declared once in `SCENES`, the story copy
 * in `STORY`, the slot-bearing pages in `FEATURED`, and the rest is expanded
 * from the three.
 *
 * It is still data in every sense that matters: no behaviour, the compiler
 * checks the result against `BookTemplate`, `npm run book` writes the **fully
 * expanded JSON** beside the print files so a reviewer reads the real object,
 * and `rev` is eight hex of that object's own content hash. Edit anything below
 * and `npm run book` refuses until `rev` is restamped; it prints the value.
 *
 * ## The page size, which is the open question
 *
 * **3600 × 3600 px on a 612 pt artboard** — an 8.00 in trim with a quarter inch
 * of bleed on every edge, so the file runs at 450 DPI across the trim and
 * 423.5 across the artboard. Declared here, once, in two numbers.
 *
 * The **trim** is settled: the captain's specification names Printify's
 * Softcover Photo Book (8 × 8 in, its only size) and Hardcover Photo Book
 * (8 × 8 in, one of four), and one artwork set serves both. What is **not**
 * settled is Printify's stated print-area pixel size for that product, which
 * is published only inside their signed-in Product Creator. 3600 is generated
 * deliberately above every candidate: 8 in at 300 DPI is 2400 px, so 3600
 * downscales to it with room, and downscaling is free where upscaling is the
 * expensive mistake.
 *
 * `docs/print.md` § The square trim nobody has pinned down carries the
 * evidence, including what is odd about the 3150 this repository's other
 * template uses. **Nothing here resolves it** — both numbers are fields on one
 * object, so the answer is a data edit and a restamp.
 *
 * ## What is a placeholder, and what is not
 *
 * Every page's artwork is `{ kind: "drawn" }` — a scene drawn from the numbers
 * below, with the chosen look's baby in it — and the story copy is stub copy.
 * **Both are stand-ins and both say so.** The production state of the artwork
 * is `{ kind: "asset" }`: the captain's finished page images by content hash,
 * written here by `npm run looks:import` from a folder that satisfies
 * `docs/look-upload-contract.md`. The production state of the copy is the
 * captain's own sentences in the same `story` fields.
 *
 * Everything else — the page order, the slots, their boxes, the type sizes, the
 * limits, the gender question, the looks axis — is final and does not change
 * when the artwork and the copy land.
 */

import type { Layer } from "../lib/template/types";
import type { BookPage, BookTemplate, Look, SceneSpec } from "../lib/book/types";
import { SLOT } from "../lib/book/slots";
import { UPLOADED } from "./first-book.art";

// ---------------------------------------------------------------------------
// The artboard
// ---------------------------------------------------------------------------

/**
 * 612 pt = 8.5 in: **the 8 × 8 in trim plus a quarter inch of bleed on every
 * edge.**
 *
 * `BLEED` below takes that quarter inch off each side, so the trim is
 * 576 pt — **8.00 inches exactly**, which is the size of both Printify photo
 * books this book is for. The artboard is the page *including* bleed because
 * that is what `docs/print.md` establishes Printify's stated print area to be.
 *
 * With `print.pixels` at 3600 this file is **423.5 DPI across the artboard and
 * 450 DPI across the trim** — far above the 300 a printer asks for, which is
 * deliberate: the captain generates masters once, and downscaling is free where
 * upscaling is the expensive mistake. See `docs/print.md` § The square trim for
 * what is still open about the number, and note that nothing about it is
 * resolved here — both values are data on this one object.
 */
const SIDE = 612;

/** 0.25 in, declared conservatively. `canvas.bleed` below carries the argument. */
const BLEED = 18;

/**
 * The eight washes, cycled through the interior.
 *
 * Declared on the *page* and not on the look, which is the structural half of
 * `docs/look-upload-contract.md` § 4: two looks of this book cannot have
 * different kitchens, because there is one kitchen and it is written here once.
 */
const SCENES: readonly SceneSpec[] = [
  { ground: "#F3E7DA", floor: "#E3CDB8", prop: "#D9BFA6", seed: 1101 },
  { ground: "#E6F0F2", floor: "#BFD9E0", prop: "#A9C9D4", seed: 1102 },
  { ground: "#EAF1E2", floor: "#CBDCB8", prop: "#B3CE9E", seed: 1103 },
  { ground: "#F6EDDC", floor: "#E0CBA8", prop: "#CBAE87", seed: 1104 },
  { ground: "#E6E4F0", floor: "#C6C2DF", prop: "#B0AACF", seed: 1105 },
  { ground: "#EFF3E6", floor: "#CFE0C0", prop: "#F0C8A0", seed: 1106 },
  { ground: "#FBEFE6", floor: "#EED2BE", prop: "#DDB79C", seed: 1107 },
  { ground: "#FDF3E3", floor: "#F0D9B5", prop: "#E8B9A0", seed: 1108 },
];

/** The ink every word in the book is set in. Dark enough for any of the washes. */
const INK = "#3B2A20";

/**
 * The name's limit, in characters, and the number the whole name design turns
 * on.
 *
 * Every `babyName` slot declares it, so the tightest is this and
 * `lib/book/name.ts` has one answer to give a buyer. The boxes are sized so
 * fourteen characters of the handwritten face fit inside the narrowest of them
 * with room to spare — the renderer measures nothing
 * (`docs/template-format.md` § The text that did not fit), so a box has to be
 * generous rather than exact.
 *
 * It is also the length `validateBook` substitutes into every `{name}` in the
 * story copy, so raising it is a change that can make a story line overflow —
 * and the build says so rather than the book.
 */
const NAME_CHARS = 14;

// ---------------------------------------------------------------------------
// The slots
// ---------------------------------------------------------------------------

/** A name slot: the same declaration everywhere but the box and the size. */
function nameSlot(
  id: string,
  frame: { x: number; y: number; width: number; height: number },
  size: number,
  align: "start" | "middle",
): Layer {
  return {
    id,
    kind: "textSlot",
    slot: SLOT.name,
    frame,
    font: "hand",
    size,
    // Declared rather than derived from the face's ascent, which is a number
    // only a shaping engine knows and the browser's would not be `resvg`'s.
    baseline: size * 1.2,
    colour: INK,
    align,
    maxChars: NAME_CHARS,
  };
}

/**
 * The story slot: the captain's line or two, at the top of a spread's page.
 *
 * Set in the typewriter face at 17 pt in a 476 pt box, which is about
 * forty-six characters across; `maxCharsPerLine` declares forty-two, leaving
 * room for the sub-point disagreement between two shapers that
 * `lib/render/svg.ts` names as the one seam. Three lines at 33 pt is 99 pt
 * inside a 135 pt box.
 *
 * It sits high because the baby sits low.
 */
function storySlot(id: string): Layer {
  return {
    id,
    kind: "textSlot",
    slot: SLOT.story,
    frame: { x: 68, y: 71, width: 476, height: 135 },
    font: "typewriter",
    size: 17,
    baseline: 23,
    lineHeight: 33,
    colour: INK,
    align: "middle",
    maxChars: 130,
    maxLines: 3,
    maxCharsPerLine: 42,
  };
}

/**
 * The stub story copy, one entry per spread that carries words.
 *
 * **Placeholder sentences, and the captain replaces them.** They are here
 * rather than absent because the slot has to be exercised — by the preview, by
 * the print file, and by the check that a line still fits with a fourteen
 * character name in it — and a slot with no words proves none of that.
 *
 * `{name}` is deliberately given its own short line wherever it appears. That
 * is the shape the captain's copy will need too: a name of up to fourteen
 * characters shares a line with whatever else is on it, so the line it is on
 * has to be the short one. The build refuses copy that forgets.
 */
const STORY: readonly string[] = [
  "{name}\nwoke up when the light came in.",
  "There was a whole day waiting,\nand none of it had happened yet.",
  "Breakfast went mostly in,\nand a little on the floor.",
  "{name}\nfound a cupboard that opens.",
  "Outside, everything was bigger\nand much more interesting.",
  "A duck looked back.\nNeither of them said anything.",
  "{name}\nwas carried home half asleep.",
  "The bath was warm\nand the flannel was a boat.",
  "Everything got slower\nand quieter and softer.",
  "{name}\nwas tucked in with the rabbit.",
  "Goodnight to the day,\nand to everyone in it.",
];

/**
 * What each page carries beyond its story, and the only part of this file
 * written out by hand.
 *
 * The keys are page ids, which are **the same words the upload contract uses
 * for filenames**: `page-012.png` is this `page-012`. Nothing has to be
 * translated between the captain's folder and this template.
 *
 * **Which page carries what is data, and the flow reads it.** `pageWithSlot`
 * finds the photograph's page and the `Personalise with a photo` control
 * appears on that spread; move the slot to page six and the control moves with
 * it. Nobody writes down that it is page twelve.
 */
const FEATURED: Record<string, { scene?: Partial<SceneSpec>; layers: Layer[] }> = {
  /**
   * **The opening spread, left-hand page — and it has no baby in it.**
   *
   * The captain's settled specification: the one spread drawn with no baby
   * (cream ground, clouds, bunting) is **look-independent**, which is exactly
   * what makes it the right place for the buyer's own photograph and words —
   * everything the buyer supplies sits on the two pages that are identical
   * across all twelve looks, so flicking between babies cannot move or reflow
   * a single thing they typed.
   *
   * `babyless` is therefore not a drawing preference. It is the structural
   * reason this spread can carry an order.
   */
  "page-001": {
    scene: { babyless: true },
    layers: [nameSlot("title-name", { x: 110, y: 142, width: 392, height: 99 }, 60, "middle")],
  },

  /**
   * **The opening spread, right-hand page: the photograph, the dedication and
   * the from-line, in that order down the page.**
   *
   * The order is the captain's — *"in the printed book the photograph sits
   * above the dedication text, framed"* — and all three are on **one page**
   * because one page is what the one control personalises. `Controls.tsx` finds
   * this page by asking which page carries the dedication slot, so the panel
   * holding the photograph and both texts appears on this spread and nowhere
   * else, and moving these three layers to another page moves the panel.
   *
   * The arithmetic, because this is the one page in the book where three things
   * have to share a column:
   *
   * | | pt | inside the safe area (36–576) |
   * |---|---|---|
   * | photograph | 48 → 264 | 216 pt square = 3.00 in |
   * | dedication | 288 → 518 | 10 lines × 23 pt = 230 pt exactly |
   * | from-line | 530 → 562 | one line |
   *
   * Ten lines is Wonderbly's own dedication limit, which the research says to
   * copy exactly rather than to improve on, and it is what decides the type
   * size here rather than the other way round.
   */
  "page-002": {
    scene: { babyless: true },
    layers: [
      {
        id: "photo",
        kind: "photoSlot",
        slot: SLOT.photo,
        /**
         * **Square, and that is the decision.**
         *
         * A buyer who touches nothing gets `placePhoto`'s cover-fit about the
         * centre, and a square window is the only shape that takes the same
         * bite out of a portrait and a landscape — a landscape window would cut
         * the top and bottom off every phone portrait, which is most of what a
         * parent has. Crop is offered *after* upload, as an adjustment rather
         * than a step; see `PhotoOrder.view`.
         *
         * 216 pt is three inches printed, so at the book's declared
         * `minPhotoDpi` a photograph needs 600 px on its shorter side. That
         * floor is **derived from this box** — see `lib/book/photo.ts` — so
         * enlarging this window raises the bar a photograph has to clear, and
         * the two can never disagree.
         */
        frame: { x: 198, y: 48, width: 216, height: 216 },
        mask: { kind: "rect", radius: 10 },
        stroke: { colour: "#FFFFFF", width: 6 },
        placeholder: { fill: "#FFFFFF" },
        prompt: "A photograph of them",
      },
      {
        id: "dedication",
        kind: "textSlot",
        slot: SLOT.dedication,
        frame: { x: 119, y: 288, width: 374, height: 230 },
        font: "typewriter",
        size: 15,
        baseline: 19,
        lineHeight: 23,
        colour: INK,
        align: "middle",
        /**
         * Ten lines, thirty-four characters each, three hundred in total.
         *
         * The three are not redundant. `maxLines` stops a buyer pushing line
         * eleven off the bottom of the page; `maxCharsPerLine` stops one long
         * unbroken line running off both sides, which a line count cannot see;
         * `maxChars` is the overall budget. Ten lines at 23 pt is 230 pt, which
         * is this box exactly, and thirty-four characters of 15 pt typewriter
         * is about 306 pt inside a 374 pt one.
         */
        maxChars: 300,
        maxLines: 10,
        maxCharsPerLine: 34,
      },
      {
        id: "from",
        kind: "textSlot",
        slot: SLOT.from,
        frame: { x: 119, y: 530, width: 374, height: 32 },
        /**
         * The handwritten face, where the dedication is typewritten.
         *
         * Not decoration: it is what makes the line read as a **signature**
         * under a dedication rather than as its eleventh line. `SLOT.from`
         * carries the rest of the argument for why it is its own role.
         */
        font: "hand",
        size: 20,
        baseline: 24,
        colour: INK,
        align: "middle",
        /**
         * One line, and the validator insists on it.
         *
         * Twenty-eight characters of 20 pt hand is about 235 pt inside 374, so
         * "Grandma and Grandpa" fits with room to spare and a paragraph does
         * not — which is the point. `text.fromLineMultiLine` is the refusal if
         * anybody ever raises `maxLines` here.
         */
        maxChars: 28,
        maxLines: 1,
        maxCharsPerLine: 28,
      },
    ],
  },

  "page-024": {
    scene: { babyAt: { x: 0.5, y: 0.78 }, babySize: 0.28 },
    layers: [nameSlot("closing-name", { x: 110, y: 106, width: 392, height: 99 }, 60, "middle")],
  },
};

/**
 * One interior page.
 *
 * **The wash cycles per *spread*, not per page**, which is the one thing about
 * the placeholder that has to match the artwork rather than merely stand in for
 * it: the captain's twelve spreads are each a single 2.000:1 scene cut down the
 * middle, so two facing pages are two halves of one kitchen. Cycling per page
 * gave every spread a cream left and a blue right — which looks like a bug in a
 * preview the buyer is being asked to approve, and would have trained the eye
 * to expect something the real artwork never does.
 *
 * The **seed** is still the page's own, so the two halves wobble differently
 * and no two pages of the book are the same picture.
 *
 * **A story slot lands on the first page of every spread from the third page
 * on.** Spreads here are (003,004), (005,006) … (023,024), so the odd pages
 * carry the words and the even ones carry the picture — which is the shape the
 * artwork is drawn to, with the baby on one side and the quiet half taking the
 * text.
 */
function interior(index: number): BookPage {
  const number = index + 1;
  const id = `page-${String(number).padStart(3, "0")}`;
  const featured = FEATURED[id];

  const spread = number >= 3 && number <= 23 && number % 2 === 1 ? (number - 3) / 2 : -1;
  const story = spread >= 0 ? STORY[spread] : undefined;

  const layers = [...(featured?.layers ?? []), ...(story ? [storySlot("story")] : [])];

  return {
    id,
    art: artFor(id, {
      // `index >> 1` is the spread this page is a half of: pages 1 and 2 are
      // spread 0, pages 3 and 4 are spread 1, and so on.
      ...SCENES[(index >> 1) % SCENES.length],
      seed: 2000 + index,
      ...featured?.scene,
    }),
    ...(story ? { story } : {}),
    ...(layers.length ? { layers } : {}),
  };
}

/**
 * This page's artwork: the captain's upload if there is one, the drawn
 * placeholder if there is not.
 *
 * **One `if`, in one place, and it is about which state the project is in**
 * rather than about which page this is. `./first-book.art.ts` is `null` until
 * `npm run looks:import` has run; after it has, every page is an uploaded image
 * and the scenes below stop being consulted. A page the upload is missing falls
 * back to the placeholder rather than to nothing, so a half-finished import is
 * a visibly mixed book instead of a blank one — and `validateBook` says so
 * either way.
 */
function artFor(id: string, scene: SceneSpec): BookPage["art"] {
  const byLook = UPLOADED?.pages[id];
  return byLook ? { kind: "asset", byLook } : { kind: "drawn", scene };
}

/**
 * The placeholder looks, used until an upload declares the real ones.
 *
 * **Twelve: six per gender**, which is the captain's settled count and exactly
 * Wonderbly's — two genders by six. The count is nonetheless **data and nothing
 * counts it**: no component, validator or test asserts twelve, so the day the
 * captain delivers five or eight the grid renders five or eight. `looks.json`
 * in the upload declares each look's id, label and gender and
 * `npm run looks:import` writes the real list into `./first-book.art.ts`,
 * replacing this one wholesale.
 *
 * **Only the baby differs, and here the baby is four numbers.** The gender tag
 * is a tag on an otherwise opaque look: the captain's decision is that gender
 * lives in the head only — hair shape, plus a bow where the signal needs to be
 * unmistakable — and the sleepsuit stays the same garment throughout. None of
 * that is expressible in a placeholder drawn from three colours and a seed, and
 * none of it needs to be: a look is a folder of finished pages, so whatever the
 * artwork does changes pixels and changes nothing in this format.
 */
const PLACEHOLDER_LOOKS: Look[] = [
  {
    id: "mabel",
    label: "Mabel",
    gender: "girl",
    baby: { skin: "#F2CBA8", hair: "#6B4A33", cloth: "#E8A0A8", seed: 31 },
  },
  {
    id: "ada",
    label: "Ada",
    gender: "girl",
    baby: { skin: "#8C5A3C", hair: "#2B1C14", cloth: "#E7C7E0", seed: 34 },
  },
  {
    id: "iris",
    label: "Iris",
    gender: "girl",
    baby: { skin: "#E8B48C", hair: "#8C6239", cloth: "#F0C8D2", seed: 35 },
  },
  {
    id: "nell",
    label: "Nell",
    gender: "girl",
    baby: { skin: "#6E4228", hair: "#1C110A", cloth: "#D8C2E8", seed: 36 },
  },
  {
    id: "clover",
    label: "Clover",
    gender: "girl",
    baby: { skin: "#FBE3C8", hair: "#C98A3C", cloth: "#E8C0A8", seed: 37 },
  },
  {
    id: "juno",
    label: "Juno",
    gender: "girl",
    baby: { skin: "#B5764C", hair: "#4A2C18", cloth: "#EFB4C0", seed: 38 },
  },
  {
    id: "wren",
    label: "Wren",
    gender: "boy",
    baby: { skin: "#C98A5E", hair: "#3A2418", cloth: "#9AC6C0", seed: 32 },
  },
  {
    id: "otis",
    label: "Otis",
    gender: "boy",
    baby: { skin: "#F6DCC0", hair: "#D9A24B", cloth: "#A8C4E8", seed: 33 },
  },
  {
    id: "albie",
    label: "Albie",
    gender: "boy",
    baby: { skin: "#E0A77C", hair: "#5C3A22", cloth: "#A8C8A0", seed: 39 },
  },
  {
    id: "rufus",
    label: "Rufus",
    gender: "boy",
    baby: { skin: "#7A4A2C", hair: "#20140C", cloth: "#9CB8D8", seed: 40 },
  },
  {
    id: "milo",
    label: "Milo",
    gender: "boy",
    baby: { skin: "#FBE8D4", hair: "#2E1E14", cloth: "#C8C0E0", seed: 41 },
  },
  {
    id: "bear",
    label: "Bear",
    gender: "boy",
    baby: { skin: "#D39A6E", hair: "#6B4420", cloth: "#B8CCB0", seed: 42 },
  },
];

// ---------------------------------------------------------------------------

export const FIRST_BOOK: BookTemplate = {
  schema: 1,
  id: "the-book-of-you",
  rev: "169f8740",
  name: "The Book of You",
  blurb:
    "Twelve spreads of a day in their life, with their name through it, one of your own " +
    "photographs, and a dedication in the front.",

  page: {
    canvas: {
      unit: "pt",
      width: SIDE,
      height: SIDE,
      /**
       * 0.25 in of bleed, declared conservatively exactly as `my-forever.ts`
       * declares it: over-declaring moves the trim guide *inwards*, which keeps
       * content further from any real cut line, where under-declaring moves it
       * towards one. `docs/print.md` carries the evidence and the open question.
       *
       * Here it also does the arithmetic that makes the trim the product's own
       * size: 612 − 2 × 18 = 576 pt = **8.00 in**, which is both Printify photo
       * books exactly.
       */
      bleed: BLEED,
      /** A further 0.25 in. Nothing a buyer can see crosses it. */
      safe: 18,
      /**
       * The ground under every page, and cream rather than white on purpose: a
       * page whose artwork failed to load must look like a missing picture, not
       * like a blank sheet somebody meant to print.
       */
      background: "#F3E7DA",
    },
    print: {
      pixels: { width: 3600, height: 3600 },
      colourSpace: "srgb",
      encoding: "png",
    },
    /** 200 DPI. `lib/book/photo.ts` argues the number and derives the pixels. */
    minPhotoDpi: 200,
  },

  /**
   * The question asked **before** the grid.
   *
   * The captain's decision of 6 November, reversing the brief, after reviewing
   * two sellers that both ask it first. It is a declared list and the flow
   * renders whatever is in it: adding, removing or renaming an answer is a data
   * edit and a restamp.
   */
  genders: [
    { id: "girl", label: "A girl" },
    { id: "boy", label: "A boy" },
  ],

  /**
   * The looks. Same book, same words, same backgrounds — a different baby.
   *
   * The upload is the source of truth when there is one: `looks.json` declares
   * every look's id, label and gender, and `npm run looks:import` writes the
   * list into `./first-book.art.ts`. Until then this is `PLACEHOLDER_LOOKS`.
   * **Nothing anywhere counts them** — the grid renders the list it is given.
   */
  looks: UPLOADED?.looks ?? PLACEHOLDER_LOOKS,

  /**
   * **The tiles show page four: a baby, and not one word.**
   *
   * Two reasons, and both were found by looking at the rendered grid rather
   * than by reasoning about it.
   *
   * **Page one is babyless** — see its entry in `FEATURED` — so a grid drawn
   * from it would be twelve identical tiles under the question "which baby?".
   * `validateBook` refuses a babyless page here, so that cannot regress by
   * somebody making another page babyless and forgetting this line.
   *
   * **Page three carries story text, and a tile is drawn with no name in it.**
   * `storyTextFor` deliberately leaves `{name}` in place when there is no name
   * yet — on a full-size page that reads as "your name goes here", which is
   * true and useful. Shrunk to a tile it is six copies of a literal brace
   * token, which reads as a bug. Page four is the picture half of its spread
   * and carries no slot at all, so the tile is the baby and nothing else —
   * which is exactly what "the choice reads as *which baby* rather than *which
   * picture*" asks for.
   */
  tilePage: "page-004",

  /**
   * **One cover scene in three colourways**, the captain's settled shape —
   * not three cover scenes, which would be three more artwork sets.
   *
   * The colourway is chosen in the persistent bar during the preview rather
   * than as a step of its own, which is the other half of the same decision:
   * see `app/_book/Bar.tsx`.
   */
  covers: [
    { id: "blush", label: "Blush", colour: "#E8A0A8" },
    { id: "sage", label: "Sage", colour: "#A9C2A0" },
    { id: "oat", label: "Oat", colour: "#E3CDB8" },
  ],

  /**
   * **No `coverTint` here, on purpose.**
   *
   * The cover choice recolours the cover's whole ground, which is
   * `SceneSpec.groundFromCover` on the page below — a buyer picking "Sage"
   * wants a sage book, not a sage rectangle on a cream one. `coverTint` is the
   * mechanism for the *other* state: when the cover is an uploaded image there
   * is no ground to recolour, and the only way to apply a choice is to fill a
   * declared shape. `validateBook` accepts either and refuses neither.
   */

  cover: {
    id: "cover",
    art: artFor("cover", {
      // Replaced by the chosen cover's colour. The only page that does this,
      // and `validateBook` refuses any interior page that tries.
      ground: "#E8A0A8",
      groundFromCover: true,
      floor: "#D9BFA6",
      prop: "#CBAE87",
      babyAt: { x: 0.5, y: 0.84 },
      babySize: 0.24,
      seed: 1001,
    }),
    layers: [
      {
        id: "cover-panel",
        kind: "shape",
        frame: { x: 85, y: 212, width: 442, height: 188 },
        shape: {
          kind: "rect",
          radius: 20,
          // Cream, and not the cover colour: the name is set on this panel and
          // has to stay legible against all three choices.
          fill: "#FBF6EC",
          stroke: { colour: "#FFFFFF", width: 4 },
          shadow: { colour: "#2A1C12", blur: 10, dx: 0, dy: 6 },
        },
      },
      nameSlot("cover-name", { x: 106, y: 255, width: 400, height: 106 }, 62, "middle"),
    ],
  },

  /**
   * Twenty-four pages — twelve spreads, which is Printify's hardcover photo
   * book exactly. The count is this list's length and nothing else.
   */
  pages: Array.from({ length: 24 }, (_, i) => interior(i)),
};

export default FIRST_BOOK;
