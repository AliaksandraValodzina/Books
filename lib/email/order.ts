/**
 * **The order confirmation, and it is the only thing from this business that
 * every buyer keeps.**
 *
 * It outlives the tab, the session and usually the book's arrival: it is what
 * gets searched for when somebody wants to know what they ordered, when it was
 * meant to arrive, or how to say "I spelled it wrong". So it is **plain,
 * correct and free of marketing** — no discount code, no "share this", no
 * second product, no logo-shaped reassurance. Those are the things that make
 * an order confirmation feel like an advert and make the one fact somebody
 * needs harder to find.
 *
 * ## It is the confirmation page, in words
 *
 * The brief asks for the page and the email to say exactly the same thing, so
 * **both are built from this module**: `app/order/[ref]/page.tsx` renders
 * `confirmation()` as markup and `emailFor()` sets the same values as text.
 * Two copies of the dispatch window is how a shop ends up promising four days
 * on a page and five in an email.
 *
 * ## The name is alone on its own line
 *
 * `app/_book/Confirm.tsx` makes the argument — *a name inside artwork gets
 * skimmed; a name alone gets read* — and it holds one last time here. If the
 * spelling is wrong, this email is the final place it can be caught for free,
 * so the name is on a line of its own with nothing beside it.
 *
 * ## What is deliberately not in it
 *
 * The captain's standing rule that a customer's **own** typo is reprinted once
 * free. `docs/pricing.md` is explicit: it is applied quietly when somebody
 * asks and never advertised, so that it stays goodwill rather than an
 * invitation. **Nothing that reaches a customer may mention it**, and
 * `test/email.test.ts` asserts that of this text as `test/policy.test.tsx`
 * does of the pages.
 */

import { BRAND } from "../brand";
import { editionOf, priceOf } from "../book/editions";
import { addressLines, chargedAs, type OrderRecord } from "../orders/record";

/**
 * **The dispatch window, written once.**
 *
 * The captain's own commitment, already in `BOOK_PROMISES` and quoted rather
 * than paraphrased: a second wording is a second promise.
 */
export const DISPATCH_WINDOW = "2–4 working days";

/**
 * **The twenty-four hour promise, and how to use it.**
 *
 * The "how" is the part a promise without it does not have. It is honest
 * because fulfilment is by hand — there really is a gap between an order
 * arriving and a file going to a press — and the thing that makes it usable is
 * an address and a reference to quote, not the sentence.
 */
export const CHANGE_WINDOW_HOURS = 24;

export interface Confirmation {
  /** The reference, first, because it is what everything else is quoted against. */
  ref: string;
  /** The name exactly as it will print, shown large and alone. */
  name: string;
  /** "The Book of You — Hardcover", and the price beside it. */
  ordered: string;
  price: string;
  /** What Stripe actually took, when it has. */
  charged: string | null;
  dispatchWindow: string;
  /** Where it is going, as Stripe collected it. Empty while the webhook has not landed. */
  address: string[];
  paid: boolean;
}

export function confirmation(record: OrderRecord, bookName: string): Confirmation {
  const edition = editionOf(record.editionId);
  return {
    ref: record.ref,
    name: record.fill.name,
    ordered: `${bookName} — ${edition.label}`,
    price: priceOf(edition.price),
    charged: chargedAs(record.charged),
    dispatchWindow: DISPATCH_WINDOW,
    address: addressLines(record.address),
    paid: record.payment === "paid",
  };
}

/**
 * How a buyer uses the 24-hour window.
 *
 * `changeTo` is an override — `ORDER_EMAIL_REPLY_TO`, for a deployment whose
 * real mailbox differs from the shop's declared one. **The promise is never
 * left without a door**: with no override it names `BRAND.support`, which is
 * the address the returns page already tells people to use, rather than
 * naming nothing.
 */
export function changeSentence(ref: string, changeTo?: string): string {
  const where = `email ${changeTo ?? BRAND.support}`;
  return (
    `We have not printed it yet. For the next ${CHANGE_WINDOW_HOURS} hours, ${where} quoting ` +
    `${ref} and we will change anything — the spelling, the dedication, the photograph, the ` +
    "cover — free."
  );
}

export interface Email {
  subject: string;
  /** Plain text. No HTML part: there is nothing in this message that needs one. */
  text: string;
}

/**
 * The email, as the one thing the buyer keeps.
 *
 * Plain text and no HTML alternative on purpose. An HTML part would be a
 * second copy of the same words that renders differently in every client, and
 * the only thing it would buy is a typeface — on a message whose entire job is
 * to be legible in a search result in two months' time.
 */
export function emailFor(options: {
  record: OrderRecord;
  bookName: string;
  /** The order's own page, so the buyer can find it again. */
  url?: string;
  changeTo?: string;
}): Email {
  const c = confirmation(options.record, options.bookName);
  const lines: string[] = [];

  lines.push(`Your order is ${c.ref}.`);
  lines.push("");
  lines.push("This is how the name will be printed:");
  lines.push("");
  // Alone on its own line, with nothing beside it. `Confirm.tsx`'s argument,
  // one last time and in the only place it can still be acted on for free.
  lines.push(`    ${c.name}`);
  lines.push("");
  lines.push(`What you ordered: ${c.ordered}`);
  lines.push(`Price: ${c.charged ?? c.price}`);
  if (c.address.length) {
    lines.push("");
    lines.push("Going to:");
    for (const line of c.address) lines.push(`    ${line}`);
  }
  lines.push("");
  lines.push(`Dispatch: ${c.dispatchWindow} from today. Delivery time is on top of that.`);
  lines.push("");
  lines.push(changeSentence(c.ref, options.changeTo));
  if (options.url) {
    lines.push("");
    lines.push(`Your order: ${options.url}`);
  }
  lines.push("");
  lines.push("Keep this email — it is the record of what you ordered.");
  // The shop's name last and once. An order confirmation is not a letterhead.
  lines.push(BRAND.name);

  return {
    // The reference and the name, because that is what somebody searches an
    // inbox for. No exclamation mark and no "thank you for your purchase":
    // the subject line's job is to be findable.
    subject: `Order ${c.ref} — ${c.name}'s book`,
    text: lines.join("\n"),
  };
}
