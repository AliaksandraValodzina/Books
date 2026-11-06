/**
 * **The file that goes to the press, read back out of its own bytes.**
 *
 * `test/print-size.test.ts` makes the argument for the single page and it is
 * the same one here: a test that checks a file was written, or that a config
 * value says 3600, passes just as happily when the renderer draws a blank
 * cream square — and a blank cream square is what a dropped layer, a missing
 * asset or a broken derivation produces.
 *
 * So this file reads pixels and parses containers. Every content assertion is
 * paired with the same assertion against a render with that layer taken out,
 * which is `test/pixels.ts`'s standard: **a test that would pass if the
 * renderer drew nothing is not a test.**
 *
 * The full-resolution renders are deliberately few. A page of this book is
 * about a second at 3600 × 3600, and a suite that rendered all twenty-five
 * would be half a minute of CPU proving the same thing twenty-five times. The
 * three that carry buyer content are rendered at full size; everything about
 * the *container* is proved at a small size, where the only thing that changes
 * is how long it takes.
 */

import { describe, expect, it } from "vitest";
import { FIRST_BOOK } from "../templates/first-book";
import { FIXTURE_BOOK_FILL } from "../fixtures/book-order";
import { pageFillFor, pageTemplateFor, pageWithSlot, pageCount } from "../lib/book/derive";
import { SLOT } from "../lib/book/slots";
import {
  BookNotPrintable,
  orderFingerprint,
  printFileName,
  renderBookPagePng,
  renderBookPdf,
} from "../lib/book/print";
import { readPdfPages, NotAPdf } from "../lib/render/pdf";
import { pngChunkTypes, readPngSize } from "../lib/render/png";
import { renderPrintPng, renderPrintSvg } from "../lib/render/raster";
import { renderPageSvg } from "../lib/render/svg";
import { assetUrl } from "../lib/assets/resolve";
import { safeBox } from "../lib/template/defaults";
import { distinctColours, meanLuma, raster, shareOf, type Raster } from "./pixels";
import type { BookTemplate } from "../lib/book/types";
import type { Box } from "../lib/template/types";

/** The same book at a size a test can afford to render twenty-five of. */
const SMALL: BookTemplate = {
  ...FIRST_BOOK,
  page: { ...FIRST_BOOK.page, print: { ...FIRST_BOOK.page.print, pixels: { width: 300, height: 300 } } },
};

const COVER = 0;
const DEDICATION = pageWithSlot(FIRST_BOOK, SLOT.dedication);
const PHOTO = pageWithSlot(FIRST_BOOK, SLOT.photo);
const STORY = pageWithSlot(FIRST_BOOK, SLOT.story);

/** The book with one page's layers emptied — how a content test proves it can fail. */
function withoutSlots(book: BookTemplate, index: number): BookTemplate {
  const strip = (id: string) => (p: { id: string; layers?: unknown }) =>
    p.id === id ? { ...p, layers: [] } : p;
  const id = [book.cover, ...book.pages][index].id;
  return {
    ...book,
    cover: strip(id)(book.cover) as BookTemplate["cover"],
    pages: book.pages.map(strip(id)) as BookTemplate["pages"],
  };
}

const INK = "#3B2A20";

/**
 * A slot's own box, **asked of the template rather than typed out here.**
 *
 * The first version of this file carried the coordinates by hand, and the day
 * the artboard changed from 12 inches to 8 every one of them pointed at empty
 * cream — the assertions still "passed" their control and failed their content,
 * which is the good direction to fail in but is a day of work to read. The trim
 * is still an open question (`docs/print.md`), so these have to survive the
 * next change to it as well.
 *
 * `grow` pads the box outwards in page units, for the one case that needs it:
 * a text slot's frame is the box the *first baseline* sits in and the
 * descenders of the last line can fall just below it.
 */
function boxOf(book: BookTemplate, index: number, slot: string, grow = 0): Box {
  const page = [book.cover, ...book.pages][index];
  const layer = (page.layers ?? []).find(
    (l) => (l.kind === "textSlot" || l.kind === "photoSlot") && l.slot === slot,
  );
  if (!layer) throw new Error(`page ${page.id} carries no "${slot}" slot`);
  const { x, y, width, height } = layer.frame;
  return { x: x - grow, y: y - grow, width: width + grow * 2, height: height + grow * 2 };
}

/**
 * A strip of the page beside a slot, inside the safe area and clear of it.
 *
 * Used as the "did it escape its clip path" control, so it has to be somewhere
 * the photograph is not supposed to reach whatever the page size is — hence
 * derived from the slot and the safe box rather than from a guess.
 */
function besideBox(book: BookTemplate, box: Box): Box {
  const safe = safeBox(book.page.canvas);
  const width = Math.max(box.x - safe.x - 12, 24);
  return { x: safe.x, y: box.y, width, height: box.height };
}

/**
 * One page, rasterised.
 *
 * It goes through `renderPrintPng` on the derived page template rather than
 * through `renderBookPagePng`, and that is not a shortcut: the **control**
 * render is a book with a slot taken out, which `validateBook` correctly
 * refuses — a book whose dedication has nowhere to go is not a book. The
 * comparison is between two *pages*, so the page renderer is the right level
 * to ask.
 */
async function rasterOf(book: BookTemplate, index: number): Promise<Raster> {
  const template = pageTemplateFor(book, index, FIXTURE_BOOK_FILL);
  const { png } = await renderPrintPng(template, pageFillFor(book, index, FIXTURE_BOOK_FILL));
  return raster(png, template);
}

// ---------------------------------------------------------------------------

describe("one page of the book, as a print file", () => {
  it("is the size the book declares, measured out of the PNG header", async () => {
    const page = await renderBookPagePng(FIRST_BOOK, COVER, FIXTURE_BOOK_FILL);
    // Read out of the bytes, never copied from the request that asked for it.
    expect(readPngSize(page.png)).toEqual({ width: 3600, height: 3600 });
    expect(page.pixels).toEqual({ width: 3600, height: 3600 });
  }, 60_000);

  it("carries the sRGB chunk before the first IDAT", async () => {
    const page = await renderBookPagePng(FIRST_BOOK, COVER, FIXTURE_BOOK_FILL);
    const types = pngChunkTypes(page.png);
    expect(types).toContain("sRGB");
    // Position as well as presence: the specification requires both before
    // PLTE and before IDAT, and "we chose sRGB" has to be a fact in the file.
    expect(types.indexOf("sRGB")).toBeLessThan(types.indexOf("IDAT"));
    expect(types.indexOf("gAMA")).toBeLessThan(types.indexOf("IDAT"));
  }, 60_000);

  it("puts the buyer's name on the cover in ink", async () => {
    const name = boxOf(FIRST_BOOK, COVER, SLOT.name);
    const printed = await rasterOf(FIRST_BOOK, COVER);
    const blank = await rasterOf(withoutSlots(FIRST_BOOK, COVER), COVER);
    // The control is the whole point: the cover is drawn either way, so this
    // is the difference the name makes and not merely "something is there".
    expect(shareOf(printed, name, INK, 60)).toBeGreaterThan(0.02);
    expect(shareOf(blank, name, INK, 60)).toBeLessThan(0.001);
  }, 120_000);

  it("puts the buyer's photograph inside the window, and nothing outside it", async () => {
    const window = boxOf(FIRST_BOOK, PHOTO, SLOT.photo);
    const beside = besideBox(FIRST_BOOK, window);
    const printed = await rasterOf(FIRST_BOOK, PHOTO);
    const empty = await rasterOf(withoutSlots(FIRST_BOOK, PHOTO), PHOTO);

    // A photograph is thousands of colours and much darker than the white
    // placeholder it replaces. Both are measured, because either alone could
    // be satisfied by something that is not a photograph: a flat grey fill is
    // dark, and an antialiased dashed border is a couple of hundred colours.
    expect(distinctColours(printed, window)).toBeGreaterThan(1000);
    expect(distinctColours(empty, window)).toBeLessThan(400);
    expect(meanLuma(printed, window)).toBeLessThan(160);
    expect(meanLuma(empty, window)).toBeGreaterThan(220);
    // And the page beside the window is the same either way, so the photograph
    // did not escape its clip path.
    expect(Math.abs(distinctColours(printed, beside) - distinctColours(empty, beside))).toBeLessThan(
      30,
    );
  }, 120_000);

  it("sets the captain's words with the buyer's name in them", async () => {
    const band = boxOf(FIRST_BOOK, STORY, SLOT.story, 6);
    const printed = await rasterOf(FIRST_BOOK, STORY);
    const blank = await rasterOf(withoutSlots(FIRST_BOOK, STORY), STORY);
    expect(shareOf(printed, band, INK, 60)).toBeGreaterThan(0.004);
    expect(shareOf(blank, band, INK, 60)).toBeLessThan(0.0005);
    // The name really is in the drawn string, not only in the template.
    const svg = renderPageSvg(
      pageTemplateFor(FIRST_BOOK, STORY, FIXTURE_BOOK_FILL),
      pageFillFor(FIRST_BOOK, STORY, FIXTURE_BOOK_FILL),
      { href: assetUrl },
    );
    expect(svg).toContain(FIXTURE_BOOK_FILL.name);
    expect(svg).not.toContain("{name}");
  }, 120_000);

  it("sets the dedication over more than one line", async () => {
    const box = boxOf(FIRST_BOOK, DEDICATION, SLOT.dedication, 6);
    const printed = await rasterOf(FIRST_BOOK, DEDICATION);
    const blank = await rasterOf(withoutSlots(FIRST_BOOK, DEDICATION), DEDICATION);
    expect(shareOf(printed, box, INK, 60)).toBeGreaterThan(0.004);
    expect(shareOf(blank, box, INK, 60)).toBeLessThan(0.0005);
  }, 120_000);
});

// ---------------------------------------------------------------------------

describe("the whole book, as one PDF", () => {
  it("has a page for every page of the book, read back out of the bytes", async () => {
    const book = await renderBookPdf(SMALL, { ...FIXTURE_BOOK_FILL, bookRev: SMALL.rev });
    const read = readPdfPages(book.pdf);
    expect(read.count).toBe(pageCount(SMALL));
    expect(book.pages).toHaveLength(pageCount(SMALL));
  }, 120_000);

  it("states the page box in the book's own units", async () => {
    const book = await renderBookPdf(SMALL, { ...FIXTURE_BOOK_FILL, bookRev: SMALL.rev });
    // 864 pt is twelve inches, which is what makes 3600 px exactly 300 DPI.
    // The PDF says it in points, so a printer's software and this template
    // cannot disagree about how big the page is.
    expect(readPdfPages(book.pdf).mediaBox).toEqual({
      width: FIRST_BOOK.page.canvas.width,
      height: FIRST_BOOK.page.canvas.height,
    });
  }, 120_000);

  it("renders only the range it was asked for", async () => {
    const slice = await renderBookPdf(SMALL, { ...FIXTURE_BOOK_FILL, bookRev: SMALL.rev }, {
      from: 2,
      to: 4,
    });
    expect(slice.pages).toEqual([2, 3, 4]);
    expect(readPdfPages(slice.pdf).count).toBe(3);
  }, 120_000);

  it("renders the same bytes twice", async () => {
    // The committed evidence is only evidence because the render is
    // deterministic — every wobble comes from a seeded `mulberry32`. A
    // `Math.random` anywhere in the path breaks this.
    const once = await renderBookPdf(SMALL, { ...FIXTURE_BOOK_FILL, bookRev: SMALL.rev }, { to: 2 });
    const twice = await renderBookPdf(SMALL, { ...FIXTURE_BOOK_FILL, bookRev: SMALL.rev }, { to: 2 });
    expect(Buffer.from(once.pdf).equals(Buffer.from(twice.pdf))).toBe(true);
  }, 120_000);

  it("refuses to be read as a PDF when it is not one", () => {
    expect(() => readPdfPages(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]))).toThrow(NotAPdf);
    // The guard on the guard: the parser must be able to say no, or the
    // assertions above would pass against anything.
    expect(() => readPdfPages(new TextEncoder().encode("%PDF-1.7\nnot really"))).toThrow(NotAPdf);
  });

  it("is the same drawing as the screen, page for page", async () => {
    // `test/one-renderer.test.ts` makes this assertion for the single page.
    // A book is where it would be most expensive to lose, so it is made again
    // here, over a page that carries all three kinds of content.
    const withoutAddresses = (svg: string) => {
      let n = 0;
      return svg.replace(/href="[^"]*"/g, () => `href="#${n++}"`);
    };
    const template = pageTemplateFor(FIRST_BOOK, PHOTO, FIXTURE_BOOK_FILL);
    const fill = pageFillFor(FIRST_BOOK, PHOTO, FIXTURE_BOOK_FILL);
    const screen = renderPageSvg(template, fill, { href: assetUrl });
    const print = await renderPrintSvg(template, fill);
    expect(withoutAddresses(print)).toBe(withoutAddresses(screen));
    // And the comparison is not trivially true.
    expect(screen).not.toBe(print);
    expect(print).toContain("data:image/png;base64,");
  }, 60_000);
});

// ---------------------------------------------------------------------------

describe("refusing to print", () => {
  it("will not render a book whose order does not validate", async () => {
    const bad = { ...FIXTURE_BOOK_FILL, dedication: "x".repeat(900) };
    await expect(renderBookPdf(SMALL, { ...bad, bookRev: SMALL.rev })).rejects.toThrow(
      BookNotPrintable,
    );
  });

  it("will not render an empty range", async () => {
    await expect(
      renderBookPdf(SMALL, { ...FIXTURE_BOOK_FILL, bookRev: SMALL.rev }, { pages: [] }),
    ).rejects.toThrow(BookNotPrintable);
  });
});

// ---------------------------------------------------------------------------

describe("the filename an order is matched by", () => {
  const name = printFileName(FIRST_BOOK, FIXTURE_BOOK_FILL, "pdf");

  it("carries everything that decides what is inside the file", () => {
    expect(name).toContain(FIRST_BOOK.id);
    expect(name).toContain(FIRST_BOOK.rev);
    expect(name).toContain(FIXTURE_BOOK_FILL.lookId);
    expect(name).toContain(FIXTURE_BOOK_FILL.coverId);
    expect(name).toContain("rosalind");
    expect(name).toContain(orderFingerprint(FIXTURE_BOOK_FILL));
    expect(name).toMatch(/3600x3600\.pdf$/);
  });

  it("changes when anything in the order changes", () => {
    // A date stamp does not have this property, and two orders from one buyer
    // with a different dedication have to be two files.
    const edited = { ...FIXTURE_BOOK_FILL, dedication: "Something else entirely." };
    expect(printFileName(FIRST_BOOK, edited, "pdf")).not.toBe(name);
    expect(printFileName(FIRST_BOOK, { ...FIXTURE_BOOK_FILL, lookId: "otis" }, "pdf")).not.toBe(name);
  });

  it("names the page the way the upload contract names it", () => {
    // The page's own id, which is the filename the captain's folder uses —
    // asked of the book rather than written out, because which page carries the
    // photograph is template data and has already moved once.
    const id = [FIRST_BOOK.cover, ...FIRST_BOOK.pages][PHOTO].id;
    expect(id).toMatch(/^page-\d{3}$/);
    expect(printFileName(FIRST_BOOK, FIXTURE_BOOK_FILL, "png", PHOTO)).toContain(id);
    expect(printFileName(FIRST_BOOK, FIXTURE_BOOK_FILL, "png", 0)).toContain("-cover-");
  });

  it("survives a name that is not filename-shaped", () => {
    const awkward = { ...FIXTURE_BOOK_FILL, name: "Siân O'Brien" };
    const out = printFileName(FIRST_BOOK, awkward, "pdf");
    expect(out).toMatch(/^[a-z0-9.\-]+$/);
    expect(out).toContain("sian-o-brien");
  });
});
