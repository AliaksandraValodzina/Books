/**
 * **The order record's one promise, as an assertion: a print file can be made
 * from it months later with no browser involved.**
 *
 * This is the test the whole order record exists to pass. Everything the buyer
 * does happens in a tab — `lib/book/order.ts` is explicit that the photograph
 * "lives in this tab" — so if the record is not sufficient on its own, the
 * failure arrives weeks later as a paid customer whose book cannot be printed,
 * and no earlier test would have noticed.
 *
 * **The photograph is minted here and is deliberately not a fixture.** That is
 * the load-bearing part. `lib/assets/resolve.ts` falls back to
 * `fixtures/assets/` for any digest it finds there, so a test that used the
 * committed fixture photograph would pass whether or not the store held
 * anything at all — it would be testing the fixtures directory. A freshly
 * generated picture exists nowhere but the store, so the paired negative is
 * real: with the store empty, the render **fails**, and the only thing that
 * makes it succeed is the bytes coming back out of the store.
 *
 * It is generated deterministically from a seeded `mulberry32`, like
 * `scripts/make-fixture-photos.ts` and for the same reason: `Math.random` in a
 * render path is what makes a committed print file meaningless.
 */

import { describe, expect, it } from "vitest";
import { Resvg } from "@resvg/resvg-js";
import { FIRST_BOOK } from "../templates/first-book";
import { FIXTURE_BOOK_FILL } from "../fixtures/book-order";
import { mulberry32 } from "../lib/render/random";
import { AssetMissing, sha256 } from "../lib/assets/resolve";
import { claim, memoryStore, photoFor } from "../lib/orders/store";
import { readRecord, type OrderRecord } from "../lib/orders/record";
import { renderBookPdf, orderFingerprint, printProblems } from "../lib/book/print";
import { pageCount, pageWithSlot } from "../lib/book/derive";
import { SLOT } from "../lib/book/slots";
import { photoFloor } from "../lib/book/photo";
import type { BookFill } from "../lib/book/types";
import type { AssetRef, PhotoFill } from "../lib/template/types";

const DAY = new Date("2026-11-07T04:00:00Z");

/**
 * A photograph nothing in this repository has a copy of.
 *
 * Square and at the floor the book declares, read off `photoFloor` rather than
 * typed — the trim is an open question and a hand-typed pixel count is a test
 * that has to be rewritten the day it is answered.
 */
function mintPhoto(): { asset: AssetRef; bytes: Uint8Array } {
  const edge = Math.max(photoFloor(FIRST_BOOK).minEdge, 600);
  const rand = mulberry32(20261107);
  const blobs: string[] = [];
  for (let i = 0; i < 18; i++) {
    blobs.push(
      `<circle cx="${(rand() * edge).toFixed(1)}" cy="${(rand() * edge).toFixed(1)}" ` +
        `r="${(edge * (0.04 + rand() * 0.09)).toFixed(1)}" fill="#ffffff" ` +
        `opacity="${(0.05 + rand() * 0.1).toFixed(3)}"/>`,
    );
  }
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${edge} ${edge}" width="${edge}" height="${edge}">` +
    `<rect width="${edge}" height="${edge}" fill="#2F5D50"/>${blobs.join("")}</svg>`;
  const bytes = new Uint8Array(new Resvg(svg, { fitTo: { mode: "width", value: edge } }).render().asPng());
  return {
    asset: { sha256: sha256(bytes), mime: "image/png", px: [edge, edge], label: "minted for this test" },
    bytes,
  };
}

const minted = mintPhoto();

/**
 * The page the buyer's photograph is drawn on, asked of the book.
 *
 * Nothing here writes down which page carries the photograph —
 * `test/book-flow.test.tsx` makes the same argument about the controls. A test
 * that hard-coded page two would be a second copy of a fact the template owns.
 */
const PHOTO_PAGE = pageWithSlot(FIRST_BOOK, SLOT.photo);

/** The fixture order, with the minted photograph in place of the fixture one. */
const FILL: BookFill = {
  ...FIXTURE_BOOK_FILL,
  photo: { asset: minted.asset } as PhotoFill,
};

describe("the photograph this test uses", () => {
  it("is not in fixtures/assets, which is what makes the negative below real", async () => {
    const { access } = await import("node:fs/promises");
    await expect(access(`fixtures/assets/${minted.asset.sha256}.png`)).rejects.toThrow();
  });

  it("is big enough for the book to accept, so the render is refused for no other reason", () => {
    expect(printProblems(FIRST_BOOK, FILL)).toEqual([]);
  });
});

describe("re-rendering an order months later", () => {
  it("needs nothing but the record and the store", async () => {
    const store = memoryStore();
    const { record } = await claim(store, FILL, "hardcover", DAY);
    await store.putPhoto(minted.asset, minted.bytes);

    // Everything from here on is what a reprint in a year actually has: one
    // JSON document out of a bucket and the bytes beside it. No request body,
    // no `localStorage`, no browser.
    const asStored: OrderRecord | null = readRecord(JSON.parse(JSON.stringify(record)));
    expect(asStored).not.toBeNull();

    const supplied = await photoFor(store, asStored!);
    const result = await renderBookPdf(FIRST_BOOK, asStored!.fill, {
      supplied,
      // Two pages rather than twenty-five: this test is about whether the
      // record is sufficient, and the whole book is half a minute of CPU that
      // `test/book-print.test.ts` already spends. **One of them is the page
      // the photograph lands on**, asked of the template rather than typed —
      // a page list that missed it would render happily without the store and
      // prove nothing.
      pages: [0, PHOTO_PAGE],
    });

    expect(result.pages).toEqual([0, PHOTO_PAGE]);
    // A real PDF, not an empty buffer dressed as one.
    expect(new TextDecoder().decode(result.pdf.slice(0, 5))).toBe("%PDF-");
    expect(result.pdf.length).toBeGreaterThan(50_000);
    // And it is named for the same order: the filename carries the fill's own
    // fingerprint, so a reprint of this record is the same document.
    expect(result.filename).toContain(orderFingerprint(asStored!.fill));
    expect(result.filename).toContain(FIRST_BOOK.rev);
  });

  it("fails without the store, so the store is what is doing the work", async () => {
    // The paired negative. Without it, this whole file would pass against a
    // renderer that quietly read the photograph from somewhere else.
    const store = memoryStore();
    const { record } = await claim(store, FILL, "hardcover", DAY);
    const supplied = await photoFor(store, record);
    expect(supplied.size).toBe(0);
    await expect(
      renderBookPdf(FIRST_BOOK, record.fill, { supplied, pages: [PHOTO_PAGE] }),
    ).rejects.toThrow(AssetMissing);
  });

  it("keeps the template revision, so a reprint cannot pick up an edited book", async () => {
    const store = memoryStore();
    const { record } = await claim(store, FILL, "softcover", DAY);
    const asStored = readRecord(JSON.parse(JSON.stringify(record)))!;
    expect(asStored.fill.bookRev).toBe(FIRST_BOOK.rev);
    expect(asStored.fill.bookId).toBe(FIRST_BOOK.id);
  });

  it("holds everything the brief asks an order to hold", async () => {
    // Read off the record rather than described, so a field quietly dropped
    // from the type fails here.
    const store = memoryStore();
    const { record } = await claim(store, FILL, "hardcover", DAY);
    const asStored = readRecord(JSON.parse(JSON.stringify(record)))!;

    expect(asStored.ref).toMatch(/^BK-/);
    expect(asStored.fill.name).toBe(FIXTURE_BOOK_FILL.name);
    expect(asStored.fill.lookId).toBe(FIXTURE_BOOK_FILL.lookId);
    expect(asStored.fill.dedication).toBe(FIXTURE_BOOK_FILL.dedication);
    expect(asStored.fill.from).toBe(FIXTURE_BOOK_FILL.from);
    expect(asStored.fill.photo?.asset.sha256).toBe(minted.asset.sha256);
    expect(asStored.editionId).toBe("hardcover");
    expect(asStored.fill.bookRev).toBe(FIRST_BOOK.rev);
    expect(asStored.asked).toEqual({ currency: "AUD", amount: 69 });
    expect(asStored.payment).toBe("awaiting");
    expect(asStored.createdAt).toBe(DAY.toISOString());
    expect(asStored.updatedAt).toBe(DAY.toISOString());
    // And the two that only exist once Stripe has spoken.
    expect(asStored.charged).toBeNull();
    expect(asStored.address).toBeNull();
  });

  it("is a book of the length the book says, so the slice above is a slice", () => {
    expect(pageCount(FIRST_BOOK)).toBeGreaterThan(3);
    // And the photograph is genuinely on a page, which the negative above
    // depends on entirely.
    expect(PHOTO_PAGE).toBeGreaterThanOrEqual(0);
  });
});
