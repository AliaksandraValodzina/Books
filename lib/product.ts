/**
 * **What the shop claims about the object, and what it admits it does not know.**
 *
 * Vagueness on this page reads as a scam, so the page states size, pages,
 * paper, price and delivery plainly. The problem is that **most of those
 * numbers do not exist yet.** The repository knows exactly what the print file
 * is; it does not know what Printify product this becomes, what it costs, or
 * how long it takes.
 *
 * The temptation is to write a plausible price and tidy it later. That is a
 * fabricated commercial claim on a public page, and "£29, two weeks" is
 * indistinguishable to a customer from a real quote. So the shape below makes
 * inventing one **impossible to compile**: a `Fact` is a union, and only the
 * `confirmed: true` arm has a `value` field at all. There is nowhere to put a
 * number you do not have. An unconfirmed fact carries `needs` instead — the
 * sentence saying whose number it is and where it comes from — and the page
 * renders it as a marked placeholder.
 *
 * `test/product.test.ts` checks the confirmed ones against the template and the
 * print spec, so the facts cannot drift from the artefact, and checks that
 * every unconfirmed one reaches the page marked. `UNCONFIRMED` is the list to
 * hand the captain.
 */

import { MY_FOREVER } from "../templates/my-forever";
import { safeBox, trimBox } from "./template/defaults";

export type Fact =
  | {
      label: string;
      confirmed: true;
      value: string;
      /** Where the number comes from. A claim with no provenance is not confirmed. */
      source: string;
    }
  | {
      label: string;
      confirmed: false;
      /** What is required to turn this into a number, and from whom. */
      needs: string;
    };

/** Shown wherever an unconfirmed fact would go. Deliberately impossible to read as a value. */
export const PLACEHOLDER = "TO CONFIRM";

const t = MY_FOREVER;
const inches = (pt: number) => `${(pt / 72).toFixed(2).replace(/\.?0+$/, "")} in`;

/**
 * The finished page is **not** 10.5 inches.
 *
 * 756 pt is the artboard, bleed included, and the guillotine takes the bleed
 * off. `docs/print.md` is explicit that where the trim line falls inside those
 * 3150 pixels is not published outside Printify's Product Creator, and that the
 * template declares the *larger* standard bleed conservatively. So the finished
 * square is somewhere between 10 and 10.5 inches and this cannot state one
 * number honestly — which is why it is not a confirmed fact.
 */
const trim = trimBox(t.canvas);

export const WHAT_YOU_GET: Fact[] = [
  {
    label: "Print file",
    confirmed: true,
    value: `${t.print.pixels.width} × ${t.print.pixels.height} px, ${Math.round(
      (t.print.pixels.width / t.canvas.width) * 72,
    )} DPI, sRGB`,
    source: "read out of the PNG header by test/print-size.test.ts",
  },
  {
    label: "Artboard",
    confirmed: true,
    value: `${inches(t.canvas.width)} square, bleed included`,
    source: "templates/my-forever.ts",
  },
  {
    label: "Finished page",
    confirmed: false,
    needs:
      `between ${inches(trim.width)} and ${inches(t.canvas.width)} square — exactly where the trim ` +
      "falls inside the file is only in Printify's Product Creator, and needs somebody " +
      "signed in to the account to read it. See docs/print.md.",
  },
  {
    label: "Pages",
    confirmed: false,
    needs: "page one is built; how many pages a book is, is the captain's decision",
  },
  {
    label: "Paper and binding",
    confirmed: false,
    needs:
      "follows from which Printify product this is — hardcover or softcover photo book — " +
      "which docs/print.md records as still open",
  },
  {
    label: "Price",
    confirmed: false,
    needs: "the captain's number. Nothing here invents one.",
  },
];

/**
 * When it arrives.
 *
 * Named separately because it is the one a gift stands or falls on: a book that
 * misses a birthday is a refund and a bad review, so a window nobody has
 * verified is worse than no window. Printify's production time plus the
 * provider's shipping is the real answer and neither is known here.
 */
export const DELIVERY: Fact = {
  label: "When it arrives",
  confirmed: false,
  needs:
    "Printify's production time for the chosen product plus the provider's shipping to the " +
    "customer's country. Both are in the Printify dashboard; neither is in this repository. " +
    "A gift that misses the date is a refund, so this must be a real window before launch.",
};

/** Everything still waiting on a number, so the list can be handed over rather than remembered. */
export const UNCONFIRMED: Array<Extract<Fact, { confirmed: false }>> = [
  ...WHAT_YOU_GET,
  DELIVERY,
].filter((f): f is Extract<Fact, { confirmed: false }> => !f.confirmed);

/**
 * Who the page is for, in one line.
 *
 * Not "personalised photo products". The brief's reasoning is that the buyer's
 * real question is "will *mine* look as good as yours", and a line that names
 * the occasion and the two people in it is the one that makes the editor below
 * it worth touching.
 */
export const WHO_IT_IS_FOR =
  "A printed page for the two of you — your photographs, your words, in your hands.";

/** What is true of every page regardless of the open questions. Each is checked by a test. */
export const GUARANTEES: string[] = [
  "Your photographs stay in your browser until you order. Nothing is uploaded.",
  "No account, and nothing to sign up for.",
  `Everything you can see sits at least ${inches(t.canvas.bleed + t.canvas.safe)} inside the edge of the file, so the trim cannot cut it.`,
];

/**
 * The three short lines beside the order button.
 *
 * `GUARANTEES` above is the full statement of each promise and belongs in the
 * specification, where somebody is reading. This is the same three facts
 * compressed to the length that fits under a button, because the moment a
 * customer's thumb is over the CTA is the moment the three doubts arrive at
 * once — *will you keep my photographs, do I have to sign up, is this going to
 * charge me* — and a paragraph does not get read there.
 *
 * **Every line is a restatement of something a test already enforces**, not a
 * new claim:
 *
 * 1. the no-upload promise — `GUARANTEES[0]`, and what `lib/editor/draft.ts`
 *    actually does: the draft lives in the browser and only the order button
 *    sends anything.
 * 2. the no-account promise — `GUARANTEES[1]`.
 * 3. that nothing is charged — `lib/checkout.ts`, whose two states are both
 *    "not a confirmation", asserted in `test/checkout.test.ts`.
 *
 * `test/product.test.ts` pins each one to its backing fact, so shortening a
 * promise cannot quietly widen it.
 */
export const REASSURANCE: string[] = [
  "Your photos never leave your browser",
  "No account",
  "Nothing is charged yet",
];

/** The safe area, for the guarantee above to be a statement about the real page. */
export const SAFE_INSET_PT = t.canvas.bleed + t.canvas.safe;
export const SAFE_BOX = safeBox(t.canvas);
