/**
 * **How a book becomes pages the one renderer already knows how to draw.**
 *
 * This module is the whole reason a book is not a second format. It takes a
 * `BookTemplate`, a page index, and the buyer's two choices, and returns a
 * plain `PageTemplate` — the thing `lib/render/svg.ts`, `lib/render/raster.ts`,
 * `lib/template/validate.ts` and `lib/template/defaults.ts` have always
 * handled. Nothing downstream of here knows that books exist.
 *
 * That is not tidiness, it is the architectural rule of the repository held one
 * level up. `test/one-renderer.test.ts` fails on an `if (forPrint)` because the
 * screen and the print file must be the same drawing; a book that drew itself
 * would have been the same mistake at twenty-five times the size, and the first
 * place it would have shown is a customer's finished book.
 *
 * Three things happen here and nowhere else:
 *
 * **The artwork becomes the bottom layer.** An uploaded page image becomes an
 * `image` layer covering the whole artboard; a placeholder page becomes an
 * `art` layer with the chosen look's baby in it. Both are layer kinds the
 * format already had. The look contributes three colours or one asset and
 * *nothing else*, which is what makes `docs/look-upload-contract.md`'s *"only
 * the baby differs"* a structural fact rather than a promise.
 *
 * **The cover choice becomes a fill.** One declared layer of the cover page
 * takes the chosen colour. A cover choice is therefore one number per cover
 * rather than one artwork per cover per look, which is the difference between
 * a second cover costing nothing and costing twenty-five images a look.
 *
 * **The buyer's own fields become a `PageFill` per page.** Keyed by the roles in
 * `./slots.ts`, so a page carrying a `babyName` slot gets the name and a page
 * carrying none gets an empty fill. A crop is **passed through** when the buyer
 * made one and absent when they did not — it is never computed here, because
 * computing it twice is the second placement path the one-renderer rule
 * forbids. See `BookFill`.
 *
 * **Nothing here clamps.** A fill that is too long for its slot reaches the
 * renderer, which throws (`TextOverflows`). Truncating it quietly would be the
 * one failure mode the whole text design exists to prevent: a dedication that
 * ends mid-sentence in a printed book. Sanitising happens at the door, in
 * `./order.ts`, where a stored draft is read.
 */

import type {
  Layer,
  PageFill,
  PageTemplate,
  PhotoSlotLayer,
  TextSlotLayer,
} from "../template/types";
import type { BookFill, BookPage, BookTemplate, CoverChoice, Look } from "./types";
import { NAME_TOKEN, SLOT } from "./slots";

/** The buyer's two choices, which is everything that changes what is *drawn*. */
export interface Chosen {
  lookId: string;
  coverId: string;
}

/** A book that cannot be drawn as asked, named so a caller can tell why. */
export class BookArtMissing extends Error {
  constructor(
    readonly pageId: string,
    readonly lookId: string,
    detail: string,
  ) {
    super(`page "${pageId}" has no artwork for look "${lookId}": ${detail}`);
    this.name = "BookArtMissing";
  }
}

/**
 * The look with this id, or the first one.
 *
 * Falling back rather than throwing, and the asymmetry with `BookArtMissing`
 * below is deliberate. An unknown *look id* is a stale URL, an old stored
 * draft, or a look that was retired — and showing the buyer the first baby with
 * their name and photograph intact is recoverable in one tap. A look that
 * exists but has no artwork is a book that is not finished, and drawing a blank
 * page would hide that from the only person who can fix it.
 */
export function lookOf(book: BookTemplate, lookId: string): Look {
  return book.looks.find((l) => l.id === lookId) ?? book.looks[0];
}

export function coverOf(book: BookTemplate, coverId: string): CoverChoice {
  return book.covers.find((c) => c.id === coverId) ?? book.covers[0];
}

/**
 * The looks to show in the grid, given the gender the buyer answered.
 *
 * **Nothing counts them.** The captain has settled on six per gender, but that
 * number lives in the artwork's manifest and in nothing else: the chooser
 * renders this list at whatever length it is, so delivering five or eight is an
 * upload and not a release.
 *
 * A look with no `gender` appears under every answer — see the field's own note
 * on why silence reads that way — and a book with no `genders` at all returns
 * every look, which is the state the question was never asked in.
 */
export function looksFor(book: BookTemplate, genderId: string | null): Look[] {
  if (!genderId || !(book.genders ?? []).some((g) => g.id === genderId)) return book.looks;
  return book.looks.filter((l) => !l.gender || l.gender === genderId);
}

/** The gender a look belongs to, or null when it belongs to all of them. */
export function genderOfLook(book: BookTemplate, lookId: string): string | null {
  return lookOf(book, lookId)?.gender ?? null;
}

/**
 * A page's authored story line, with the buyer's name in it.
 *
 * One substitution and no expression language — `NAME_TOKEN` says why. An
 * **empty name leaves the token in place** rather than producing "and then
 *  went to the park": the preview is live while the buyer is still typing, and
 * a sentence with a visible `{name}` in it reads as "your name goes here",
 * which is true, where a sentence with a hole in it reads as a bug. The form
 * will not let an order through without a name, so the token never prints.
 */
export function storyTextFor(page: BookPage, name: string): string {
  if (!page.story) return "";
  return name ? page.story.split(NAME_TOKEN).join(name) : page.story;
}

/**
 * Every page of the book in reading order, **cover first**.
 *
 * The cover is a separate field on the template — it is printed on different
 * stock and it is the only page a cover choice touches — but it is the first
 * thing a buyer turns, so the one sequence a preview walks has it at index 0.
 * Keeping the two facts in one function is what stops "is the cover page one or
 * page zero" being answered differently by the preview, the spread pairing and
 * the print file.
 */
export function pageSequence(book: BookTemplate): BookPage[] {
  return [book.cover, ...book.pages];
}

/** How many pages a finished book has, cover included. */
export function pageCount(book: BookTemplate): number {
  return book.pages.length + 1;
}

/**
 * The book as the buyer turns it: the cover on its own, then facing pairs.
 *
 * A bound book opens on the cover and then shows two pages at a time, so
 * pairing from index 1 is not a layout preference — it is what the object does,
 * and it is why page one is a right-hand page and page two is a left-hand one.
 * `docs/look-upload-contract.md` § 2's gutter rule is stated in those terms and
 * this is the function that makes the two agree.
 *
 * A trailing odd page comes back as a spread of one rather than being padded,
 * because the book declares its own page count and inventing a blank page here
 * would hide a book that is an odd number of pages long.
 */
export function spreads(book: BookTemplate): number[][] {
  const out: number[][] = [[0]];
  for (let i = 1; i < pageCount(book); i += 2) {
    out.push(i + 1 < pageCount(book) ? [i, i + 1] : [i]);
  }
  return out;
}

/** Is this index the cover? Asked in enough places to be worth one answer. */
export function isCover(index: number): boolean {
  return index === 0;
}

/**
 * The index into `pageSequence` that the chooser's tiles draw.
 *
 * `BookTemplate.tilePage` says why this is declared and not the first page.
 * An unknown id falls back to the first interior page rather than throwing:
 * `validateBook` reports it, and a grid of the wrong page is a visible fault a
 * reviewer can act on where a thrown error on the landing page is a dead shop.
 */
export function tileIndexOf(book: BookTemplate): number {
  const sequence = pageSequence(book);
  const named = book.tilePage ? sequence.findIndex((p) => p.id === book.tilePage) : -1;
  return named >= 0 ? named : 1;
}

/**
 * The page's artwork, as the bottom layer of a page template.
 *
 * `id` is `"art"` and is reserved: `./validate.ts` refuses a book whose page
 * declares a layer by that id, because the two would collide in the derived
 * template and the renderer keys its clip paths off layer index — so the
 * collision would not be an error, it would be a wrong picture.
 */
function artLayer(book: BookTemplate, page: BookPage, chosen: Chosen): Layer {
  const { canvas } = book.page;
  const frame = { x: 0, y: 0, width: canvas.width, height: canvas.height };
  const look = lookOf(book, chosen.lookId);

  if (page.art.kind === "asset") {
    const asset = page.art.byLook[look.id];
    if (!asset) {
      throw new BookArtMissing(
        page.id,
        look.id,
        "the page declares uploaded artwork and this look is not in the map. " +
          "Run `npm run looks` against the upload.",
      );
    }
    return { id: "art", kind: "image", frame, asset };
  }

  if (!look.baby) {
    throw new BookArtMissing(
      page.id,
      look.id,
      "the page is a drawn placeholder and this look declares no placeholder baby",
    );
  }

  const scene = page.art.scene;
  return {
    id: "art",
    kind: "art",
    frame,
    art: {
      kind: "scene",
      // The cover's ground is the colour the buyer picked; every other page
      // uses its own. `SceneSpec.groundFromCover` carries the decision as data
      // so this is a field lookup rather than a question about which page it is.
      ground: scene.groundFromCover ? coverOf(book, chosen.coverId).colour : scene.ground,
      floor: scene.floor,
      prop: scene.prop,
      babyAt: scene.babyAt,
      babySize: scene.babySize,
      babyless: scene.babyless,
      skin: look.baby.skin,
      hair: look.baby.hair,
      cloth: look.baby.cloth,
      seed: scene.seed,
    },
  };
}

/**
 * The declared cover-tint layer, recoloured.
 *
 * Only on the cover, and only the layer `coverTint` names. A book with no
 * `coverTint` passes its layers through untouched — and `./validate.ts` reports
 * that, because a cover choice the buyer ticks and that changes nothing is
 * worse than not offering one.
 */
function tinted(book: BookTemplate, page: BookPage, layers: Layer[], chosen: Chosen): Layer[] {
  const id = book.coverTint?.layerId;
  if (!id || page.id !== book.cover.id) return layers;
  const colour = coverOf(book, chosen.coverId).colour;
  return layers.map((layer) =>
    layer.id === id && layer.kind === "shape"
      ? { ...layer, shape: { ...layer.shape, fill: colour } }
      : layer,
  );
}

/**
 * One page of the book, as a `PageTemplate`.
 *
 * The derived id is `"<bookId>/<pageId>"` and the derived `rev` is the book's
 * own, which keeps the two properties a page template is relied on for:
 * `validateTemplate` has a stamped revision to check, and an order's print file
 * can be traced back to the exact book revision it came from.
 */
export function pageTemplateFor(
  book: BookTemplate,
  index: number,
  chosen: Chosen,
): PageTemplate {
  const sequence = pageSequence(book);
  const page = sequence[index];
  if (!page) throw new RangeError(`book ${book.id} has no page at index ${index}`);

  return {
    schema: 1,
    id: `${book.id}/${page.id}`,
    rev: book.rev,
    name: `${book.name} — ${page.id}`,
    canvas: book.page.canvas,
    print: book.page.print,
    layers: [artLayer(book, page, chosen), ...tinted(book, page, page.layers ?? [], chosen)],
  };
}

/** The text slots a page carries, by role. Used by the flow to find its pages. */
export function textSlotsOn(page: BookPage): TextSlotLayer[] {
  return (page.layers ?? []).flatMap((l) => (l.kind === "textSlot" ? [l] : []));
}

export function hasSlot(page: BookPage, slot: string): boolean {
  return (page.layers ?? []).some(
    (l) => (l.kind === "textSlot" || l.kind === "photoSlot") && l.slot === slot,
  );
}

/**
 * The first page carrying a given slot, or -1.
 *
 * **This is how "the extras live on the page they affect" is built rather than
 * maintained.** The flow asks which page has the photo slot and puts
 * `Personalise with a photo` on that spread; nobody writes down that it is page
 * twenty-one, so moving the slot in the template moves the control.
 */
export function pageWithSlot(book: BookTemplate, slot: string): number {
  return pageSequence(book).findIndex((page) => hasSlot(page, slot));
}

/**
 * The book's one photo window, as the layer the renderer will draw into.
 *
 * Asked for by name in two places that must not disagree: `lib/book/photo.ts`
 * derives the pixel floor from this frame, and `toBookFill` produces the crop
 * at this frame's aspect ratio. A second lookup written out by hand in either
 * would be the drift `CLAUDE.md` names — *"a crop of the wrong shape puts part
 * of what the customer framed outside the window"* — reached by moving the
 * slot and nothing else.
 *
 * Null when the book has none, which `validateBook` already reports as
 * `book.photoSlotCount`.
 */
export function photoSlotOf(book: BookTemplate): PhotoSlotLayer | null {
  for (const page of pageSequence(book)) {
    for (const layer of page.layers ?? []) {
      if (layer.kind === "photoSlot" && layer.slot === SLOT.photo) return layer;
    }
  }
  return null;
}

/**
 * The buyer's own fields, as the fill for one page.
 *
 * A page with no slots gets an empty fill, which renders as the artwork alone —
 * twenty-one of the twenty-five pages of this book. The declared roles are the
 * only keys that can appear, so there is no page-specific content anywhere and
 * nothing a buyer typed can be attached to one page rather than the book.
 */
export function pageFillFor(book: BookTemplate, index: number, fill: BookFill): PageFill {
  const page = pageSequence(book)[index];
  const texts: Record<string, string> = {};
  const photos: PageFill["photos"] = {};

  for (const layer of page?.layers ?? []) {
    if (layer.kind === "textSlot") {
      if (layer.slot === SLOT.name && fill.name) texts[SLOT.name] = fill.name;
      if (layer.slot === SLOT.dedication && fill.dedication) {
        texts[SLOT.dedication] = fill.dedication;
      }
      if (layer.slot === SLOT.from && fill.from) texts[SLOT.from] = fill.from;
      // The one slot the buyer does not fill: its words are the page's own.
      if (layer.slot === SLOT.story) {
        const story = storyTextFor(page, fill.name);
        if (story) texts[SLOT.story] = story;
      }
    }
    if (layer.kind === "photoSlot" && layer.slot === SLOT.photo && fill.photo?.asset) {
      // **The crop is passed through and never recomputed.** `placePhoto`
      // cover-fits and centres an absent one, which is what a buyer who never
      // touched the photograph gets; a buyer who adjusted it has a `Crop` that
      // `lib/book/order.ts` produced once, at this window's own aspect ratio,
      // and re-deriving it here would be the second placement path the
      // one-renderer rule forbids.
      photos[SLOT.photo] = fill.photo.crop
        ? { asset: fill.photo.asset, crop: fill.photo.crop }
        : { asset: fill.photo.asset };
    }
  }

  return {
    schema: 1,
    templateId: `${book.id}/${page?.id ?? "missing"}`,
    templateRev: book.rev,
    photos,
    texts,
  };
}

/** The buyer's choices, out of their fill. One place, so nothing re-derives it. */
export function chosenIn(fill: BookFill): Chosen {
  return { lookId: fill.lookId, coverId: fill.coverId };
}
