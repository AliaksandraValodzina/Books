/**
 * **Is this photograph big enough to print, and what happens when it is not.**
 *
 * The captain's instruction, reconfirmed on 6 November: *"refuse a photograph
 * too small to print rather than printing it soft."* That is the right call and
 * it is worth being exact about why. A soft photograph is not a crash and not a
 * validation error — it renders, it previews, the buyer approves it, and it
 * arrives in a hardback as a blurry rectangle that cannot be fixed without
 * reprinting the book. A refusal at the moment they pick the file costs them
 * one tap and costs nobody anything else.
 *
 * **The floor is derived, never declared.** The slot's width in points and the
 * book's `minPhotoDpi` give the pixels; moving or enlarging the photo window
 * moves the floor with it, and the two cannot disagree. That is the same rule
 * `scaleOf` follows for DPI and the same reason — a declared number is a number
 * that goes on being declared after the thing it described has moved.
 *
 * **Why 200 DPI and not 300.** 300 is what a printer asks for and what the
 * artwork is generated at; it is not a sensible floor for a photograph a parent
 * took on a phone three years ago. Below about 200 DPI a photographic image is
 * visibly soft at arm's length; between 200 and 300 it is slightly soft in a way
 * only a comparison reveals. Refusing at 300 would reject a great many
 * perfectly printable family photographs and send the buyer away; refusing at
 * 200 rejects screenshots, thumbnails and pictures saved out of a messaging
 * app, which are the ones that genuinely cannot be printed. The number lives in
 * `templates/first-book.ts` as one field, so changing that judgement is a data
 * edit.
 */

import { pageSequence, pageWithSlot } from "./derive";
import { SLOT } from "./slots";
import type { BookTemplate } from "./types";

export interface PhotoFloor {
  /** The fewest pixels the photograph's **shorter** edge may have. */
  minEdge: number;
  /** The slot's printed size, so a message can say it in inches. */
  inches: number;
  dpi: number;
}

/**
 * How big a photograph has to be for this book's photo window.
 *
 * The *shorter* edge, because `placePhoto` cover-fits: whichever axis has
 * fewer pixels per printed inch is the one that decides how sharp the result
 * is, and for a square window that is simply the shorter edge of the picture.
 *
 * A book with no photo slot has no floor, which is `{ minEdge: 0 }` rather than
 * a thrown error — `validateBook` already reports `book.photoSlotCount`, and a
 * second complaint from here would be the same fault reported twice.
 */
export function photoFloor(book: BookTemplate): PhotoFloor {
  const index = pageWithSlot(book, SLOT.photo);
  const layer = (pageSequence(book)[index]?.layers ?? []).find(
    (l) => l.kind === "photoSlot" && l.slot === SLOT.photo,
  );
  const dpi = book.page.minPhotoDpi;
  if (!layer) return { minEdge: 0, inches: 0, dpi };

  // The longer side of the window, in inches, times the floor. A window is
  // square in this book and this does not assume it.
  const side = Math.max(layer.frame.width, layer.frame.height);
  const inches = side / 72;
  return { minEdge: Math.ceil(inches * dpi), inches, dpi };
}

export type PhotoVerdict =
  | { ok: true }
  | {
      ok: false;
      code: "tooSmall";
      message: string;
      /** What it is, and what it would have to be. For a test and for a log. */
      got: number;
      want: number;
    };

/**
 * Is a photograph of this pixel size printable in this book?
 *
 * Takes the size rather than the file, so the browser can ask before it spends
 * a second resizing one and the server can ask again about the bytes it was
 * actually sent. `lib/assets/supplied.ts` is what makes the server's copy of
 * the answer trustworthy — it re-measures rather than believing the request.
 */
export function checkPhoto(book: BookTemplate, px: [number, number]): PhotoVerdict {
  const { minEdge, inches, dpi } = photoFloor(book);
  const shorter = Math.min(px[0], px[1]);
  if (!(minEdge > 0) || shorter >= minEdge) return { ok: true };

  return {
    ok: false,
    code: "tooSmall",
    message:
      `That photograph is ${px[0]} × ${px[1]}, and it is printed ${inches.toFixed(1)} inches ` +
      `across — so it would come out noticeably blurry. It needs to be at least ${minEdge} ` +
      `pixels on its shorter side. A photograph straight off a phone will be; one saved from ` +
      `a message or a screenshot usually is not.`,
    got: shorter,
    want: minEdge,
  };
}
