/**
 * **The order: the durable document this project did not have.**
 *
 * Everything else in the buyer flow lives in a browser tab. `lib/book/order.ts`
 * is the order *in progress* — a `localStorage` key, five values and some
 * bytes — and it is explicit that the photograph "lives in this tab". That is
 * the right arrangement right up to the moment somebody pays, at which point
 * the one artefact that has to outlive the tab is the only one that does not
 * exist.
 *
 * This is that artefact, and it has exactly one job stated as a property
 * rather than as a hope: **it must be enough to re-render the exact print file
 * months later, with no browser involved.** `test/order-reprint.test.ts` is
 * that sentence as an assertion — it takes a record through a round trip and
 * renders a PDF out of the far side.
 *
 * ## It contains a `BookFill`, it does not restate one
 *
 * A `BookFill` already round-trips: it is the document `renderBookPdf` takes,
 * `validateBookFill` judges and `orderFingerprint` hashes, and it already
 * carries the name, the look, the cover, the dedication, the from-line, the
 * photograph's content hash and `bookRev` — the template revision the brief
 * asks for. So the record **embeds it verbatim** rather than copying its
 * fields out, because a copy is a second shape for the same facts and a day
 * where the two disagree. Everything beside `fill` here is something a fill
 * deliberately has nowhere to put: money, an address, a status, a time.
 *
 * ## What is not in here
 *
 * **No card data of any kind, and nowhere to put any.** The payment happens on
 * Stripe's own hosted page and what comes back is an amount, a status and an
 * address. There is no field for a number, an expiry or a token, which is the
 * same trick `Edition` plays with a struck-out price: unrepresentable rather
 * than discouraged.
 *
 * **Not the photograph's bytes.** The fill names it by content hash, the bytes
 * go into the order store under that hash, and `lib/orders/store.ts` § photos
 * says why they are private there rather than public.
 */

import { createHash } from "node:crypto";
import type { BookFill } from "../book/types";
import type { Money } from "../book/editions";

/**
 * Where an order is, as far as the money is concerned.
 *
 * **Only `paid` means money arrived, and only a signature-verified webhook may
 * write it** — see `app/api/stripe/webhook/route.ts`. A buyer landing back on
 * the site is not evidence of anything: that redirect is a URL they could have
 * typed, and a shop that believed it would mark an abandoned checkout paid.
 */
export type PaymentStatus = "awaiting" | "paid";

/** The address Stripe collected, as Stripe spells it. Never typed on this site. */
export interface ShippingAddress {
  name: string | null;
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
}

/**
 * **What was actually charged, in the units Stripe actually charged it in.**
 *
 * Minor units and a lowercase currency, copied out of the event and not
 * reconstructed from `EDITIONS`. The edition table is the shop's *intention*
 * and it changes for commercial reasons; this is the fact about one payment,
 * and the day the two differ is precisely the day the captain needs to see
 * what the customer's statement says rather than what the price list says.
 */
export interface Charge {
  currency: string;
  minorUnits: number;
}

export interface Dispatch {
  at: string;
  /**
   * Whatever the captain wrote down. Free text on purpose: it is a courier's
   * reference, and a format this code invented would be a format the courier
   * does not use.
   */
  tracking: string;
}

export interface OrderRecord {
  schema: 1;
  /**
   * The short reference a human says out loud.
   *
   * `referenceFor` makes it, and it is **derived from the order's own content**
   * rather than counted or randomised — which is what makes a double-click one
   * order instead of two without a lock anywhere. Its docblock is the argument.
   */
  ref: string;
  /** Eight hex of the fill's own content: `orderFingerprint`, stored so a reader need not recompute. */
  fingerprint: string;
  /** The buyer's filling of the book, verbatim and sufficient to re-render it. */
  fill: BookFill;
  /** Softcover or the one hardcover upgrade — an id from `EDITIONS`. */
  editionId: string;
  /** The listed price at the moment the session was created. The shop's intention. */
  asked: Money;
  /** What Stripe says was taken, or null while nothing has been. */
  charged: Charge | null;
  payment: PaymentStatus;
  /** The Checkout Session this order was sent to the till under. */
  sessionId: string | null;
  /** Stripe's own payment id, for finding the money in their dashboard. */
  paymentIntentId: string | null;
  /** Where the book goes, as Stripe collected it. Null until the webhook lands. */
  address: ShippingAddress | null;
  /** Where the order confirmation went. Null until the webhook lands. */
  email: string | null;
  /** Whether the confirmation email was actually sent, so the captain can tell. */
  emailed: boolean;
  dispatch: Dispatch | null;
  createdAt: string;
  paidAt: string | null;
  updatedAt: string;
}

/**
 * **The alphabet a reference is written in.**
 *
 * Crockford's base32 without `I`, `L`, `O` or `U`: no character that can be
 * misread as another over a telephone, and no vowel pair that can spell
 * something a customer would rather not read on an invoice. A reference is
 * read aloud and typed back in by hand, which is the only requirement it has.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function base32(bytes: Uint8Array, chars: number): string {
  let out = "";
  for (let i = 0; i < chars; i++) out += ALPHABET[bytes[i % bytes.length] % ALPHABET.length];
  return out;
}

/**
 * **The reference for this order, derived rather than allocated.**
 *
 * The brief asks for `orderFingerprint` to be the idempotency key so a
 * double-click cannot create two orders. An idempotency key stops Stripe
 * charging twice; it does nothing about *this* side writing two records. So
 * the reference is derived from the same fingerprint, and a second press of
 * the same button therefore computes the same reference, reads the record that
 * is already there and stops.
 *
 * **The day is in the hash on purpose.** Without it, the same parent ordering
 * the same book for a second child a month later — identical dedication,
 * identical name, identical everything — would compute the reference of an
 * order that has already shipped. With it, a repeat order is a new order and a
 * double-click is still one order, because nobody double-clicks across
 * midnight. `claim` in `lib/orders/store.ts` handles the remaining case, which
 * is two genuinely different orders whose hashes collide in forty bits.
 */
export function referenceFor(fingerprint: string, when: Date): string {
  const day = when.toISOString().slice(0, 10);
  const digest = createHash("sha256").update(`${fingerprint}|${day}`).digest();
  return `BK-${base32(new Uint8Array(digest), 7)}`;
}

/** `BK-` and seven characters of the alphabet above, and nothing else. */
export const REFERENCE_PATTERN = /^BK-[0-9ABCDEFGHJKMNPQRSTVWXYZ]{7}(?:-[2-9])?$/;

export function isReference(value: unknown): value is string {
  return typeof value === "string" && REFERENCE_PATTERN.test(value);
}

/**
 * What the admin list shows for one order, and nothing more.
 *
 * A list of orders does not need a dedication, an address or a photograph, and
 * a summary that carried them would be a list that leaks the whole of every
 * order to anything that can read one line of it.
 */
export interface OrderSummary {
  ref: string;
  name: string;
  editionId: string;
  asked: Money;
  charged: Charge | null;
  payment: PaymentStatus;
  createdAt: string;
  dispatched: boolean;
}

export function summaryOf(record: OrderRecord): OrderSummary {
  return {
    ref: record.ref,
    name: record.fill.name,
    editionId: record.editionId,
    asked: record.asked,
    charged: record.charged,
    payment: record.payment,
    createdAt: record.createdAt,
    dispatched: record.dispatch !== null,
  };
}

/** `AUD 59`, from whatever Stripe said. One formatting, like `priceOf`. */
export function chargedAs(charge: Charge | null): string | null {
  if (!charge) return null;
  const major = charge.minorUnits / 100;
  return `${charge.currency.toUpperCase()} ${Number.isInteger(major) ? major : major.toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// Reading something back that may not be what we wrote
// ---------------------------------------------------------------------------

/**
 * **Reading is tolerant; writing is not.** `lib/book/order.ts`'s rule, one
 * level up and for a harder case: a record read back in a year was written by
 * a build nobody has the source of any more, and the thing being decided is
 * whether a customer's paid-for book can still be printed. So an unreadable
 * record is `null` — loudly absent, so the admin page can say so — and a
 * record missing an *optional* field is read as the sane absence rather than
 * discarded. Nothing here invents a payment status: anything that is not
 * exactly `"paid"` is `"awaiting"`, which is the safe direction to be wrong in.
 */
export function readRecord(value: unknown): OrderRecord | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (v.schema !== 1) return null;
  if (!isReference(v.ref)) return null;
  const fill = v.fill;
  if (!fill || typeof fill !== "object") return null;
  const asked = readMoney(v.asked);
  if (!asked) return null;
  if (typeof v.editionId !== "string" || !v.editionId) return null;
  if (typeof v.createdAt !== "string" || !v.createdAt) return null;

  return {
    schema: 1,
    ref: v.ref,
    fingerprint: typeof v.fingerprint === "string" ? v.fingerprint : "",
    fill: fill as BookFill,
    editionId: v.editionId,
    asked,
    charged: readCharge(v.charged),
    payment: v.payment === "paid" ? "paid" : "awaiting",
    sessionId: str(v.sessionId),
    paymentIntentId: str(v.paymentIntentId),
    address: readAddress(v.address),
    email: str(v.email),
    emailed: v.emailed === true,
    dispatch: readDispatch(v.dispatch),
    createdAt: v.createdAt,
    paidAt: str(v.paidAt),
    updatedAt: typeof v.updatedAt === "string" ? v.updatedAt : v.createdAt,
  };
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readMoney(value: unknown): Money | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<Money>;
  if (v.currency !== "AUD") return null;
  if (typeof v.amount !== "number" || !Number.isFinite(v.amount)) return null;
  return { currency: "AUD", amount: v.amount };
}

function readCharge(value: unknown): Charge | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<Charge>;
  if (typeof v.currency !== "string" || !v.currency) return null;
  if (typeof v.minorUnits !== "number" || !Number.isFinite(v.minorUnits)) return null;
  return { currency: v.currency, minorUnits: Math.round(v.minorUnits) };
}

function readAddress(value: unknown): ShippingAddress | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  return {
    name: str(v.name),
    line1: str(v.line1),
    line2: str(v.line2),
    city: str(v.city),
    state: str(v.state),
    postalCode: str(v.postalCode),
    country: str(v.country),
  };
}

function readDispatch(value: unknown): Dispatch | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const at = str(v.at);
  if (!at) return null;
  return { at, tracking: typeof v.tracking === "string" ? v.tracking : "" };
}

/** The address as the lines a label is printed from. Empty lines dropped. */
export function addressLines(address: ShippingAddress | null): string[] {
  if (!address) return [];
  return [
    address.name,
    address.line1,
    address.line2,
    [address.city, address.state, address.postalCode].filter(Boolean).join(" ") || null,
    address.country,
  ].filter((line): line is string => Boolean(line && line.trim()));
}
