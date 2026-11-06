/**
 * One buyer's filling of "The Book of You", hard-coded.
 *
 * The same thing `./order.ts` is for the single page and for the same reason:
 * the evidence under `data/`, the pixel assertions and `npm run book` all need
 * a real order, and five fields in a file is the whole of what the flow
 * produces — so this is that document, written by hand.
 *
 * The name is deliberately a name with **no accent in it**. An accented name is
 * the subject of `test/book-text.test.ts`, where the question is whether the
 * press can write it; a fixture is not the place to settle that question, and a
 * committed print file whose cover depends on the answer would be evidence of
 * two things at once.
 *
 * It carries **no crop**, which is the state of a buyer who never touched the
 * photograph — cover-fitted and centred by `placePhoto`. Cropping is covered by
 * its own tests against a view that was moved; the committed evidence is the
 * default, because the default is what most orders will be.
 */

import type { BookFill } from "../lib/book/types";
import { FIRST_BOOK } from "../templates/first-book";
import { PORTRAIT } from "./order";

export const FIXTURE_BOOK_FILL: BookFill = {
  schema: 1,
  bookId: FIRST_BOOK.id,
  bookRev: FIRST_BOOK.rev,
  lookId: "wren",
  coverId: "sage",
  name: "Rosalind",
  // No crop: the buyer did not move it, so `placePhoto` cover-fits and centres
  // it, and `toBookFill` omits the field entirely rather than writing the full
  // rectangle out.
  photo: { asset: PORTRAIT },
  dedication:
    "For Rosalind,\n" +
    "who arrived on a Tuesday\n" +
    "in the middle of the afternoon\n" +
    "and changed everything.\n" +
    "\n" +
    "All our love, always.",
  // The optional signature, in the handwritten face under the dedication.
  from: "Mum and Dad",
};

export default FIXTURE_BOOK_FILL;
