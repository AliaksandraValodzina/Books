/**
 * **The book format, and what it refuses.**
 *
 * A format is only a decision if something refuses the documents that break it.
 * `lib/template/validate.ts` makes that argument for a page and this file makes
 * it for a book — with one extra rule, which is the standard `test/pixels.ts`
 * already sets for a render: **every check is paired with a mutation that
 * breaks it.** A validator test that only ever feeds it the real template
 * passes just as happily when the validator returns an empty array, and an
 * empty array is exactly what a refactor leaves behind.
 *
 * So each `it` below takes the real book, breaks one thing, and asserts the
 * code that fires. Mutate the rule in `lib/book/validate.ts` and these go red.
 */

import { describe, expect, it } from "vitest";
import { FIRST_BOOK } from "../templates/first-book";
import { FIXTURE_BOOK_FILL } from "../fixtures/book-order";
import { bookRev, isStamped } from "../lib/book/rev";
import { validateBook, validateBookFill } from "../lib/book/validate";
import { validateTemplate } from "../lib/template/validate";
import {
  BookArtMissing,
  genderOfLook,
  looksFor,
  pageCount,
  pageFillFor,
  pageSequence,
  pageTemplateFor,
  spreads,
  storyTextFor,
  pageWithSlot,
  photoSlotOf,
  tileIndexOf,
} from "../lib/book/derive";
import { SLOT } from "../lib/book/slots";
import { photoFloor, checkPhoto } from "../lib/book/photo";
import { trimBox } from "../lib/template/defaults";
import type { BookPage, BookTemplate } from "../lib/book/types";
import type { TextSlotLayer } from "../lib/template/types";

const chosen = { lookId: FIRST_BOOK.looks[0].id, coverId: FIRST_BOOK.covers[0].id };
const PHOTO_PAGE = pageWithSlot(FIRST_BOOK, SLOT.photo);
const codes = (book: BookTemplate) => validateBook(book).map((p) => p.code);

/** The book with one page replaced, for a mutation. */
function withPage(book: BookTemplate, id: string, change: (p: BookPage) => BookPage): BookTemplate {
  if (book.cover.id === id) return { ...book, cover: change(book.cover) };
  return { ...book, pages: book.pages.map((p) => (p.id === id ? change(p) : p)) };
}

describe("the book as published", () => {
  it("is stamped with its own content hash", () => {
    expect(isStamped(FIRST_BOOK), `rev should be "${bookRev(FIRST_BOOK)}"`).toBe(true);
  });

  it("validates clean", () => {
    expect(validateBook(FIRST_BOOK)).toEqual([]);
  });

  it("notices when it has been edited without restamping", () => {
    // The guard on the guard: `isStamped` must be able to return false.
    expect(isStamped({ ...FIRST_BOOK, name: "Something Else" })).toBe(false);
    expect(codes({ ...FIRST_BOOK, rev: "nothex" })).toContain("rev.malformed");
  });

  it("is twenty-four interior pages and a cover, and the count is the list", () => {
    // The captain's number of 6 November. It is asserted as `pages.length`
    // rather than against a constant, because a constant somewhere else is the
    // thing that would go on saying 44 after the list changed.
    expect(FIRST_BOOK.pages.length).toBe(24);
    expect(pageCount(FIRST_BOOK)).toBe(25);
    expect(pageSequence(FIRST_BOOK)[0].id).toBe("cover");
    expect(pageSequence(FIRST_BOOK).at(-1)?.id).toBe("page-024");
  });

  it("declares its page size once, and the trim is the product's own 8 inches", () => {
    const { canvas, print } = FIRST_BOOK.page;
    expect(print.pixels).toEqual({ width: 3600, height: 3600 });
    expect(canvas.width).toBe(canvas.height);

    // The trim is the artboard less the declared bleed, and it is exactly the
    // 8 x 8 in both Printify photo books come in. Derived, so it cannot drift
    // from the two numbers above.
    const trim = trimBox(canvas);
    expect(trim.width / 72).toBeCloseTo(8, 6);
    expect(trim.width).toBe(trim.height);

    /**
     * **DPI is derived, never declared** — the whole reason the format carries
     * no DPI field. The assertion is a *floor* rather than a value, which is
     * the honest shape while the trim question in `docs/print.md` is open: 300
     * is what a printer asks for and generating above it is deliberate,
     * because downscaling is free and upscaling is the expensive mistake.
     */
    const dpi = (print.pixels.width / trim.width) * 72;
    expect(dpi).toBeGreaterThanOrEqual(300);
    expect(dpi).toBeCloseTo(450, 6);
  });

  it("pairs the cover alone and then faces the rest", () => {
    const groups = spreads(FIRST_BOOK);
    expect(groups[0]).toEqual([0]);
    expect(groups[1]).toEqual([1, 2]);
    expect(groups.flat().length).toBe(pageCount(FIRST_BOOK));
    // Page one is a right-hand page, which is what the gutter rule in
    // docs/look-upload-contract.md is written in terms of.
    expect(groups.at(-1)).toEqual([23, 24]);
  });
});

describe("a page derives into a page template the one renderer already knows", () => {
  it("produces a valid `PageTemplate` for every page", () => {
    for (let i = 0; i < pageCount(FIRST_BOOK); i++) {
      const template = pageTemplateFor(FIRST_BOOK, i, chosen);
      expect(validateTemplate(template), `page ${i}`).toEqual([]);
      expect(template.canvas).toBe(FIRST_BOOK.page.canvas);
      expect(template.rev).toBe(FIRST_BOOK.rev);
      // The artwork is always the bottom layer and always covers the artboard,
      // which is what full bleed means.
      expect(template.layers[0].id).toBe("art");
      expect(template.layers[0].frame).toEqual({
        x: 0,
        y: 0,
        width: FIRST_BOOK.page.canvas.width,
        height: FIRST_BOOK.page.canvas.height,
      });
    }
  });

  it("puts the chosen look's baby in the drawn artwork and nothing else", () => {
    const a = pageTemplateFor(FIRST_BOOK, 5, { ...chosen, lookId: "mabel" });
    const b = pageTemplateFor(FIRST_BOOK, 5, { ...chosen, lookId: "wren" });
    // The only difference between two looks of one page is the baby.
    expect(a.layers.slice(1)).toEqual(b.layers.slice(1));
    const artA = a.layers[0] as { art: { skin: string; ground: string } };
    const artB = b.layers[0] as { art: { skin: string; ground: string } };
    expect(artA.art.skin).not.toBe(artB.art.skin);
    expect(artA.art.ground).toBe(artB.art.ground);
  });

  it("takes the cover's ground from the cover the buyer chose", () => {
    const blush = pageTemplateFor(FIRST_BOOK, 0, { ...chosen, coverId: "blush" });
    const sage = pageTemplateFor(FIRST_BOOK, 0, { ...chosen, coverId: "sage" });
    const groundOf = (t: typeof blush) => (t.layers[0] as { art: { ground: string } }).art.ground;
    expect(groundOf(blush)).toBe("#E8A0A8");
    expect(groundOf(sage)).toBe("#A9C2A0");
    // And no interior page moves when the cover does.
    expect(pageTemplateFor(FIRST_BOOK, 4, { ...chosen, coverId: "blush" })).toEqual(
      pageTemplateFor(FIRST_BOOK, 4, { ...chosen, coverId: "sage" }),
    );
  });

  it("refuses rather than draws a blank page when a look has no artwork", () => {
    const broken = withPage(FIRST_BOOK, "page-005", (p) => ({
      ...p,
      art: { kind: "asset", byLook: {} },
    }));
    expect(() => pageTemplateFor(broken, 5, chosen)).toThrow(BookArtMissing);
    expect(codes(broken)).toContain("art.lookMissing");
  });

  it("refuses uploaded artwork that is not the declared page size", () => {
    const wrong = withPage(FIRST_BOOK, "page-005", (p) => ({
      ...p,
      art: {
        kind: "asset",
        byLook: Object.fromEntries(
          FIRST_BOOK.looks.map((l) => [
            l.id,
            { sha256: "a".repeat(64), mime: "image/png" as const, px: [3000, 3000] as [number, number] },
          ]),
        ),
      },
    }));
    expect(codes(wrong)).toContain("art.wrongSize");
  });

  it("refuses a page that reuses the artwork's own layer id", () => {
    const clash = withPage(FIRST_BOOK, "page-005", (p) => ({
      ...p,
      layers: [{ id: "art", kind: "shape", frame: { x: 40, y: 40, width: 10, height: 10 }, shape: { kind: "rect" } }],
    }));
    expect(codes(clash)).toContain("page.reservedLayerId");
  });
});

describe("the looks axis, and the question asked before it", () => {
  it("filters the grid by the answer and counts nothing", () => {
    /**
     * **This test asserts no number**, which is the point and was the bug in
     * its first version: it enumerated the four placeholder looks by id, so
     * delivering the captain's twelve made it fail for no reason anybody
     * cared about. How many looks a gender has is data that arrives with the
     * artwork — what has to hold is the *relationship*.
     */
    for (const gender of FIRST_BOOK.genders ?? []) {
      const grid = looksFor(FIRST_BOOK, gender.id);
      expect(grid.length).toBeGreaterThan(0);
      for (const look of grid) expect(look.gender ?? gender.id).toBe(gender.id);
      for (const look of FIRST_BOOK.looks) {
        if (look.gender && look.gender !== gender.id) {
          expect(grid.map((l) => l.id)).not.toContain(look.id);
        }
      }
    }
    // Every tagged look reaches exactly one grid, so answering the question
    // can never hide a look nobody can otherwise get to.
    const reached = (FIRST_BOOK.genders ?? []).flatMap((g) =>
      looksFor(FIRST_BOOK, g.id).map((l) => l.id),
    );
    expect(new Set(reached).size).toBe(FIRST_BOOK.looks.length);

    // Unanswered, or a book that never asks, shows every look.
    expect(looksFor(FIRST_BOOK, null)).toHaveLength(FIRST_BOOK.looks.length);
    expect(looksFor({ ...FIRST_BOOK, genders: [] }, "girl")).toHaveLength(FIRST_BOOK.looks.length);
  });

  it("puts an untagged look in every grid", () => {
    const loose = {
      ...FIRST_BOOK,
      looks: [...FIRST_BOOK.looks, { ...FIRST_BOOK.looks[0], id: "pat", label: "Pat", gender: undefined }],
    };
    expect(looksFor(loose, "girl").map((l) => l.id)).toContain("pat");
    expect(looksFor(loose, "boy").map((l) => l.id)).toContain("pat");
    expect(genderOfLook(loose, "pat")).toBeNull();
  });

  it("refuses a look tagged with a gender the book does not offer", () => {
    const stray = {
      ...FIRST_BOOK,
      looks: FIRST_BOOK.looks.map((l, i) => (i === 0 ? { ...l, gender: "neither" } : l)),
    };
    expect(codes(stray)).toContain("look.genderUnknown");
  });

  it("refuses an answer that leaves the grid empty", () => {
    const dead = { ...FIRST_BOOK, genders: [...(FIRST_BOOK.genders ?? []), { id: "other", label: "Other" }] };
    expect(codes(dead)).toContain("gender.noLooks");
  });

  it("refuses a grid whose tiles would all be the same picture", () => {
    /**
     * The failure this closes is **completely silent**: the opening spread is
     * babyless on purpose, so pointing the tiles at it renders twelve identical
     * pictures under the question "which baby?". Nothing throws, nothing looks
     * broken, and the buyer concludes the looks are a lie.
     */
    const opening = pageSequence(FIRST_BOOK)[1];
    expect(opening.art.kind === "drawn" && opening.art.scene.babyless).toBe(true);
    expect(codes({ ...FIRST_BOOK, tilePage: opening.id })).toContain("tile.pageBabyless");

    expect(codes({ ...FIRST_BOOK, tilePage: "page-999" })).toContain("tile.pageUnknown");
    expect(codes({ ...FIRST_BOOK, tilePage: "cover" })).toContain("tile.pageIsCover");

    // And the book as published points at a page with a baby in it, which is
    // what makes the three refusals above worth having.
    expect(codes(FIRST_BOOK)).not.toContain("tile.pageBabyless");
    const tile = pageSequence(FIRST_BOOK)[tileIndexOf(FIRST_BOOK)];
    expect(tile.art.kind === "drawn" && tile.art.scene.babyless).toBeFalsy();
  });

  it("refuses a second from-line, and a from-line that is not one line", () => {
    const page = pageSequence(FIRST_BOOK)[pageWithSlot(FIRST_BOOK, SLOT.from)];
    const signature = (page.layers ?? []).find(
      (l) => l.kind === "textSlot" && l.slot === SLOT.from,
    )!;

    // Two signatures is one value in two boxes, one of which nobody proofread.
    const twice = withPage(FIRST_BOOK, "page-024", (p) => ({
      ...p,
      layers: [...(p.layers ?? []), { ...signature, id: "from-again" }],
    }));
    expect(codes(twice)).toContain("book.fromSlotCount");

    /**
     * A from-line that could take several lines would be a second dedication
     * with no counter of its own — `acceptLines` would happily let a buyer push
     * the real dedication's last line off the bottom of the page from a field
     * that looks like a signature.
     */
    const roomy = withPage(FIRST_BOOK, page.id, (p) => ({
      ...p,
      layers: (p.layers ?? []).map((l) =>
        l.kind === "textSlot" && l.slot === SLOT.from ? { ...l, maxLines: 4 } : l,
      ),
    }));
    expect(codes(roomy)).toContain("text.fromLineMultiLine");

    // Zero is allowed — a book need not offer a signature.
    const none = withPage(FIRST_BOOK, page.id, (p) => ({
      ...p,
      layers: (p.layers ?? []).filter((l) => !(l.kind === "textSlot" && l.slot === SLOT.from)),
    }));
    expect(codes(none)).not.toContain("book.fromSlotCount");
    expect(codes(none)).toEqual([]);
  });

  it("refuses a cover choice that changes nothing visible", () => {
    const inert = withPage(FIRST_BOOK, "cover", (p) => ({
      ...p,
      art: { kind: "drawn", scene: { ground: "#fff", floor: "#eee", prop: "#ddd", seed: 1 } },
    }));
    expect(codes(inert)).toContain("cover.choiceDoesNothing");
  });

  it("refuses an interior page that takes its ground from the cover choice", () => {
    const tinted = withPage(FIRST_BOOK, "page-005", (p) => ({
      ...p,
      art: {
        kind: "drawn",
        scene: { ground: "#fff", floor: "#eee", prop: "#ddd", seed: 1, groundFromCover: true },
      },
    }));
    expect(codes(tinted)).toContain("art.interiorTintedByCover");
  });
});

describe("the three kinds of text", () => {
  it("has a story slot on every spread that carries one, and words for it", () => {
    const withStory = FIRST_BOOK.pages.filter((p) => p.story);
    expect(withStory.length).toBeGreaterThan(8);
    for (const page of withStory) {
      expect(
        (page.layers ?? []).some((l) => l.kind === "textSlot" && l.slot === SLOT.story),
        `${page.id} has words and nowhere to set them`,
      ).toBe(true);
    }
  });

  it("puts the buyer's name inside the captain's words", () => {
    const page = FIRST_BOOK.pages.find((p) => p.story?.includes("{name}"))!;
    expect(storyTextFor(page, "Rosalind")).toContain("Rosalind");
    expect(storyTextFor(page, "Rosalind")).not.toContain("{name}");
    // An empty name leaves the token visible rather than a hole: the preview
    // is live while somebody is still typing.
    expect(storyTextFor(page, "")).toContain("{name}");
  });

  it("refuses words with no slot, and a slot with no words", () => {
    const orphanWords = withPage(FIRST_BOOK, "page-004", (p) => ({ ...p, story: "Nowhere to go." }));
    expect(codes(orphanWords)).toContain("page.storyGoesNowhere");

    const orphanSlot = withPage(FIRST_BOOK, "page-003", (p) => ({ ...p, story: undefined }));
    expect(codes(orphanSlot)).toContain("page.storySlotEmpty");
  });

  it("refuses story copy that fits a short name and not the longest one", () => {
    // **The check the story slot exists to make possible**, and the test has
    // to prove it is that check and not merely a length check. This line is
    // forty-three characters with a fourteen-character name in it and
    // twenty-nine with none — so it passes every limit the empty string can
    // see, and fails the one that matters.
    const copy = "{name} woke up and looked out of it";
    const page = FIRST_BOOK.pages.find((p) => p.id === "page-003")!;
    expect(storyTextFor({ ...page, story: copy }, "").length).toBeLessThan(42);
    expect(storyTextFor({ ...page, story: copy }, "M".repeat(14)).length).toBeGreaterThan(42);

    const greedy = withPage(FIRST_BOOK, "page-003", (p) => ({ ...p, story: copy }));
    const problem = validateBook(greedy).find((p) => p.code === "text.storyOverflows");
    expect(problem?.detail).toContain("with the longest name the form accepts");
  });

  it("refuses a slot the form could never fill", () => {
    const invented = withPage(FIRST_BOOK, "page-004", (p) => ({
      ...p,
      layers: [
        {
          id: "nonsense",
          kind: "textSlot",
          slot: "favouriteColour",
          frame: { x: 100, y: 100, width: 400, height: 60 },
          font: "hand",
          size: 30,
          colour: "#000",
          maxChars: 20,
        },
      ],
    }));
    expect(codes(invented)).toContain("slot.unknownRole");
  });

  it("refuses a face whose coverage has never been measured", () => {
    // The guard that keeps the editor's refusal from being vacuous: an
    // undeclared face accepts every character and prints some of them as
    // nothing. See lib/render/coverage.ts.
    const unknown = withPage(FIRST_BOOK, "page-004", (p) => ({
      ...p,
      layers: [
        {
          id: "stray",
          kind: "textSlot",
          slot: SLOT.name,
          frame: { x: 100, y: 100, width: 400, height: 60 },
          font: "comic-sans",
          size: 30,
          colour: "#000",
          maxChars: 14,
        },
      ],
    }));
    expect(codes(unknown)).toContain("text.faceCoverageUndeclared");
  });

  it("insists the dedication slot is more than one line", () => {
    const single = withPage(FIRST_BOOK, "page-002", (p) => ({
      ...p,
      layers: (p.layers ?? []).map((l) =>
        l.kind === "textSlot" ? ({ ...l, maxLines: 1 } as TextSlotLayer) : l,
      ),
    }));
    expect(codes(single)).toContain("text.dedicationSingleLine");
  });
});

describe("the buyer's own fields become a fill per page", () => {
  it("fills only the slots a page carries", () => {
    const cover = pageFillFor(FIRST_BOOK, 0, FIXTURE_BOOK_FILL);
    expect(Object.keys(cover.texts)).toEqual([SLOT.name]);
    expect(cover.photos).toEqual({});

    const plain = pageFillFor(FIRST_BOOK, 4, FIXTURE_BOOK_FILL);
    expect(plain.texts).toEqual({});
    expect(plain.photos).toEqual({});
  });

  it("carries no crop unless the buyer actually moved the photograph", () => {
    /**
     * The default is still *no crop*, which is what "the buyer never positions
     * anything" means in practice: an untouched photograph is cover-fitted and
     * centred by `placePhoto`, and the fill is byte-identical to one written
     * before cropping existed — so `orderFingerprint` is stable across the
     * change and a reprint of an old order is the same document.
     */
    const page = pageWithSlot(FIRST_BOOK, SLOT.photo);
    const fill = pageFillFor(FIRST_BOOK, page, FIXTURE_BOOK_FILL);
    expect(fill.photos[SLOT.photo].asset).toBeTruthy();
    expect(fill.photos[SLOT.photo].crop).toBeUndefined();

    // And a crop the buyer did make is passed through untouched rather than
    // recomputed here, which would be a second placement path.
    const crop = { x: 0.1, y: 0.2, width: 0.5, height: 0.5 };
    const cropped = pageFillFor(FIRST_BOOK, page, {
      ...FIXTURE_BOOK_FILL,
      photo: { asset: FIXTURE_BOOK_FILL.photo!.asset, crop },
    });
    expect(cropped.photos[SLOT.photo].crop).toEqual(crop);
  });

  it("validates the fixture order clean", () => {
    expect(validateBookFill(FIRST_BOOK, FIXTURE_BOOK_FILL).map((p) => p.code)).toEqual([]);
  });

  it("refuses a look or a cover the book does not offer", () => {
    const codesOf = (f: Partial<typeof FIXTURE_BOOK_FILL>) =>
      validateBookFill(FIRST_BOOK, { ...FIXTURE_BOOK_FILL, ...f }).map((p) => p.code);
    expect(codesOf({ lookId: "nobody" })).toContain("fill.unknownLook");
    expect(codesOf({ coverId: "chartreuse" })).toContain("fill.unknownCover");
    expect(codesOf({ bookRev: "deadbeef" })).toContain("fill.staleRevision");
  });

  it("refuses a dedication with too many lines, and one line too wide", () => {
    const tall = { ...FIXTURE_BOOK_FILL, dedication: Array.from({ length: 14 }, () => "x").join("\n") };
    expect(validateBookFill(FIRST_BOOK, tall).map((p) => p.code)).toContain("fill.tooManyLines");

    const wide = { ...FIXTURE_BOOK_FILL, dedication: "y".repeat(80) };
    expect(validateBookFill(FIRST_BOOK, wide).map((p) => p.code)).toContain("fill.lineTooLong");
  });

  it("reports an over-long fill exactly once", () => {
    // It used to be reported twice — once by the page validator and once here —
    // which reads as two faults and sends somebody looking for a second one.
    const long = { ...FIXTURE_BOOK_FILL, dedication: "z ".repeat(200) };
    const tooLong = validateBookFill(FIRST_BOOK, long).filter((p) => p.code === "fill.textTooLong");
    expect(tooLong).toHaveLength(1);
  });
});

describe("a photograph too small to print is refused rather than printed soft", () => {
  it("derives the floor from the slot, not from a constant", () => {
    const floor = photoFloor(FIRST_BOOK);
    const slot = photoSlotOf(FIRST_BOOK)!;
    // Derived twice over and asserted against the slot rather than a number:
    // the window's printed size in inches, times the declared DPI.
    expect(floor.inches).toBeCloseTo(slot.frame.width / 72, 6);
    expect(floor.dpi).toBe(FIRST_BOOK.page.minPhotoDpi);
    expect(floor.minEdge).toBe(Math.ceil((slot.frame.width / 72) * FIRST_BOOK.page.minPhotoDpi));

    // And it moves when the slot does, which is the whole point of deriving it.
    const bigger = withPage(FIRST_BOOK, pageSequence(FIRST_BOOK)[PHOTO_PAGE].id, (p) => ({
      ...p,
      layers: (p.layers ?? []).map((l) =>
        l.kind === "photoSlot"
          ? { ...l, frame: { ...l.frame, width: l.frame.width * 2, height: l.frame.height * 2 } }
          : l,
      ),
    }));
    expect(photoFloor(bigger).minEdge).toBe(floor.minEdge * 2);
  });

  it("refuses a small photograph and accepts a phone's", () => {
    // Written in terms of the derived floor, so moving the window moves the
    // test with it rather than making it assert yesterday's slot.
    const floor = photoFloor(FIRST_BOOK).minEdge;
    expect(checkPhoto(FIRST_BOOK, [floor * 2, floor - 1]).ok).toBe(false);
    expect(checkPhoto(FIRST_BOOK, [floor * 4, floor * 3]).ok).toBe(true);
    // The shorter edge decides, because the window is covered.
    expect(checkPhoto(FIRST_BOOK, [4000, floor - 100]).ok).toBe(false);
    expect(checkPhoto(FIRST_BOOK, [floor, floor]).ok).toBe(true);
  });

  it("says what it is and what it would have to be", () => {
    const floor = photoFloor(FIRST_BOOK).minEdge;
    const verdict = checkPhoto(FIRST_BOOK, [floor, floor - 120]);
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.got).toBe(floor - 120);
    expect(verdict.want).toBe(floor);
    // The sentence quotes the number the check actually used.
    expect(verdict.message).toContain(String(floor));
  });

  it("blocks the order rather than only the upload", () => {
    const small = {
      ...FIXTURE_BOOK_FILL,
      photo: { asset: { ...FIXTURE_BOOK_FILL.photo!.asset, px: [400, 300] as [number, number] } },
    };
    expect(validateBookFill(FIRST_BOOK, small).map((p) => p.code)).toContain("fill.photoTooSmall");
  });
});
