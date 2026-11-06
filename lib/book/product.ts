/**
 * **What the shop claims about the book, and what it admits it does not know.**
 *
 * `lib/product.ts` makes the whole argument and this is the same shape for a
 * different object: a `Fact` is a union whose only `value` field is on the
 * `confirmed: true` arm, so **a number nobody has supplied cannot be
 * written** — there is nowhere to put it. An unconfirmed fact carries `needs`
 * instead, the sentence saying whose number it is, and the page renders it as a
 * marked placeholder.
 *
 * It is a second module rather than a parameter on the first because the two
 * products have genuinely different open questions. My Forever's finished size
 * is unknown because Printify does not publish where the trim falls inside a
 * stated print area; this book's is unknown for that reason **and** because
 * nobody has yet established what 3600 × 3600 is 3600 of. Collapsing the two
 * into one table would mean one `needs` sentence doing two jobs badly.
 *
 * Every confirmed fact here is derived from `templates/first-book.ts` rather
 * than typed, so a fact cannot drift from the artefact: change the page size
 * and this changes with it.
 */

import { FIRST_BOOK } from "../../templates/first-book";
import { trimBox } from "../template/defaults";
import { photoFloor } from "./photo";
import { EDITIONS, priceOf } from "./editions";
import type { Fact } from "../product";

const b = FIRST_BOOK;
const inches = (pt: number) => `${(pt / 72).toFixed(2).replace(/\.?0+$/, "")} in`;
const trim = trimBox(b.page.canvas);

export const BOOK_FACTS: Fact[] = [
  {
    label: "Pages",
    confirmed: true,
    value: `${b.pages.length} inside, plus a cover — ${b.pages.length / 2} spreads`,
    source: "templates/first-book.ts; the count is the page list's own length",
  },
  {
    label: "Print file",
    confirmed: true,
    value: `${b.page.print.pixels.width} × ${b.page.print.pixels.height} px a page, ${Math.round(
      (b.page.print.pixels.width / b.page.canvas.width) * 72,
    )} DPI, sRGB`,
    source: "read out of the PNG header by test/book-print.test.ts",
  },
  {
    label: "Artboard",
    confirmed: true,
    value: `${inches(b.page.canvas.width)} square, bleed included`,
    source: "templates/first-book.ts",
  },
  {
    label: "Your photograph",
    confirmed: true,
    value: `printed ${photoFloor(b).inches.toFixed(0)} in square, at least ${photoFloor(b).minEdge} px`,
    source: "derived from the photo slot and minPhotoDpi by lib/book/photo.ts",
  },
  {
    /**
     * **The trim is settled; the file's relationship to it is not.**
     *
     * 8 × 8 in is the captain's decision and it is the only square size
     * Printify's softcover photo book comes in, so this is a number the page
     * may state. It is derived from the template rather than typed, which is
     * what keeps it true: `trimBox` takes the declared bleed off the declared
     * artboard, so the claim moves when the page size does.
     */
    label: "Finished page",
    confirmed: true,
    value: `${inches(trim.width)} square, trimmed`,
    source: "templates/first-book.ts — the artboard less the declared bleed, by trimBox",
  },
  {
    /**
     * What is still open is **Printify's stated print-area pixel size**, which
     * is published only inside their signed-in Product Creator. It does not
     * stop a file being made — 3600 px over-covers 8 in at 300 DPI by half
     * again — but it is the difference between supplying what they ask for and
     * supplying something they will rescale, and nobody has read it yet.
     */
    label: "Printify's asked-for file size",
    confirmed: false,
    needs:
      "the print-area pixels Printify states for the 8 × 8 photo book, which only shows inside " +
      `their signed-in Product Creator. This file is ${b.page.print.pixels.width} px, which is ` +
      `${Math.round((b.page.print.pixels.width / trim.width) * 72)} DPI across the trim — above ` +
      "any figure they are likely to ask for, so it downscales rather than upscales either way. " +
      "See docs/print.md.",
  },
  {
    label: "Paper and binding",
    confirmed: false,
    needs:
      "nobody has held one. The target products are named and their page counts match, but the " +
      "stock, the finish and the binding are claims only an ordered sample can confirm.",
  },
  /**
   * **The price, and why it may be written here at all.**
   *
   * `lib/product.ts` exists to make inventing a number impossible, and that
   * guard is untouched: the `confirmed: true` arm requires a `source`, and this
   * one's is a decision rather than a guess — the captain settled AUD 59 and
   * AUD 69 on 6 November against landed costs read off their own Printify
   * catalogue. `lib/book/editions.ts` holds the numbers and the reasoning.
   *
   * **There is no "was" price and no deadline here**, and there is nowhere in
   * the type to put one. The launch offer the captain intends is real but has no
   * end date yet, and an offer with no stated end is the misleading-price
   * mechanic the register explicitly rejects — so it is absent rather than
   * approximated.
   */
  {
    label: "Price",
    confirmed: true,
    value: EDITIONS.map((e) => `${e.label} ${priceOf(e.price)}`).join(" · "),
    source: "lib/book/editions.ts — the captain's settled prices of 6 November",
  },
];

/** Everything still waiting on a number, so the list can be handed over. */
export const BOOK_UNCONFIRMED: Array<Extract<Fact, { confirmed: false }>> = BOOK_FACTS.filter(
  (f): f is Extract<Fact, { confirmed: false }> => !f.confirmed,
);

/**
 * **What is promised about getting it, and what happens when it goes wrong.**
 *
 * Separate from `BOOK_FACTS` because these are *commitments* rather than
 * measurements: nothing in the repository can check them and only the captain
 * can make them. Every line is one they settled on 6 November.
 *
 * Two are load-bearing and easy to get wrong in the other direction:
 *
 * **"Not returnable" is stated plainly**, because there is no cooling-off right
 * for goods clearly personalised — and the quality remedies survive in full
 * regardless, which is why the next line exists and is unconditional.
 *
 * **The 24-hour window is honest precisely because fulfilment is by hand.**
 * There is a real gap between an order and a file going to a printer, and
 * saying so converts the slowest part of the process into the thing that makes
 * a typo survivable.
 *
 * **What is deliberately not here:** the captain's standing decision to reprint
 * a customer's *own* typo once, free. It is applied quietly when asked and
 * never advertised, so it stays goodwill rather than an invitation — which
 * means it must not appear in any string that reaches the page.
 */
export const BOOK_PROMISES: string[] = [
  "Dispatched in 2–4 working days. Shipping time is on top of that and depends where you are.",
  "We have not printed it yet when you order — tell us within 24 hours and we will fix anything, free.",
  "Anything wrong with the object itself is reprinted free.",
  "Because it is printed with your child's name in it, it cannot be returned for a change of mind.",
];

/** What is true of every order regardless of the open questions. */
export const BOOK_GUARANTEES: string[] = [
  "Your photograph stays in your browser until you order. Nothing is uploaded.",
  "No account, no watermark, and every page shown before you pay.",
  `Everything you can see sits at least ${inches(
    b.page.canvas.bleed + b.page.canvas.safe,
  )} inside the edge of the file, so the trim cannot cut it.`,
  "A name the press cannot print is refused while you type it, not silently changed.",
];
