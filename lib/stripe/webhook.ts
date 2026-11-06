/**
 * **The only thing in this codebase that may believe a payment happened.**
 *
 * A buyer landing back on the site is not evidence. `success_url` is a URL
 * they could have typed, a crawler could have followed and a friend could have
 * shared — so a shop that marked an order paid on the redirect would ship
 * books to anybody who guessed a reference. The brief says it in one line, *a
 * redirect back to the site is not proof of payment*, and this module is that
 * line made structural: `markPaid` has exactly one caller and the caller runs
 * only after this function returns `ok`.
 *
 * ## The scheme, stated so it can be read against Stripe's own description
 *
 * The `stripe-signature` header is a comma-separated list of `k=v` pairs:
 * `t` is a Unix timestamp and each `v1` is a hex HMAC-SHA256 of
 * `"<t>.<raw body>"` keyed by the endpoint's signing secret. There may be more
 * than one `v1` while a secret is being rotated, and any one of them matching
 * is a valid signature. Other schemes (`v0`) are Stripe's own test events and
 * are **not** accepted here.
 *
 * Three things have to hold and all three are checked:
 *
 * **The body must be the raw bytes.** `JSON.parse` then `JSON.stringify` is a
 * different string — key order, spacing, unicode escapes — and would fail
 * every signature. `app/api/stripe/webhook/route.ts` reads `request.text()`
 * and hands it here untouched.
 *
 * **The comparison must be timing-safe.** `===` on a hex digest leaks, one
 * byte at a time, to anybody who can measure a few thousand requests — and the
 * thing on the other side of it is the ability to mark any order paid.
 *
 * **The timestamp must be recent.** Without a tolerance, a signature captured
 * once is a signature that works forever: anybody holding a copy of one real
 * event could replay it at will. Five minutes is Stripe's own recommendation.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

/** Stripe's recommended replay window, in seconds. */
export const TOLERANCE_SECONDS = 300;

export type Verdict =
  | { ok: true; timestamp: number }
  | { ok: false; why: string };

/** The `t=` and every `v1=` out of the header, however Stripe spaced them. */
export function parseSignatureHeader(header: string): { t: number | null; v1: string[] } {
  let t: number | null = null;
  const v1: string[] = [];
  for (const part of header.split(",")) {
    const at = part.indexOf("=");
    if (at < 0) continue;
    const key = part.slice(0, at).trim();
    const value = part.slice(at + 1).trim();
    if (key === "t") {
      const n = Number(value);
      if (Number.isFinite(n)) t = n;
    } else if (key === "v1" && /^[0-9a-f]+$/.test(value)) {
      v1.push(value);
    }
  }
  return { t, v1 };
}

function equal(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  // `timingSafeEqual` throws on a length mismatch, which would itself be a
  // signal — so the lengths are compared first and deliberately.
  if (left.length === 0 || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Is this body really from Stripe, and recent?
 *
 * `now` and `tolerance` are arguments rather than reads so the replay window
 * is testable: `test/stripe-webhook.test.ts` ages a genuine signature past the
 * window and asserts it stops being accepted, which is a test that cannot be
 * written against a function that reads the clock itself.
 */
export function verifySignature(options: {
  payload: string;
  header: string | null;
  secret: string;
  now: Date;
  toleranceSeconds?: number;
}): Verdict {
  if (!options.header) return { ok: false, why: "no stripe-signature header" };
  const { t, v1 } = parseSignatureHeader(options.header);
  if (t === null) return { ok: false, why: "no timestamp in the signature header" };
  if (v1.length === 0) return { ok: false, why: "no v1 signature in the header" };

  const tolerance = options.toleranceSeconds ?? TOLERANCE_SECONDS;
  const age = Math.floor(options.now.getTime() / 1000) - t;
  if (Math.abs(age) > tolerance) {
    return { ok: false, why: `the signature is ${age}s old, outside the ${tolerance}s window` };
  }

  const expected = createHmac("sha256", options.secret)
    .update(`${t}.${options.payload}`)
    .digest("hex");
  // Any one matching is enough: two are present for the duration of a secret
  // rotation, and refusing the pair would take the endpoint down mid-rotation.
  if (!v1.some((candidate) => equal(candidate, expected))) {
    return { ok: false, why: "the signature does not match" };
  }
  return { ok: true, timestamp: t };
}

/** The header Stripe would send for this body. Used by the tests, and only by them. */
export function signPayload(payload: string, secret: string, at: Date): string {
  const t = Math.floor(at.getTime() / 1000);
  const v1 = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  return `t=${t},v1=${v1}`;
}

// ---------------------------------------------------------------------------
// What the event says
// ---------------------------------------------------------------------------

export interface CompletedCheckout {
  sessionId: string;
  /** Our own reference, carried in metadata and in `client_reference_id`. */
  ref: string | null;
  paymentIntentId: string | null;
  /** Stripe's own word for whether the money is actually there. */
  paymentStatus: string | null;
  currency: string | null;
  amountTotal: number | null;
  email: string | null;
  address: {
    name: string | null;
    line1: string | null;
    line2: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    country: string | null;
  } | null;
}

const str = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

/**
 * A `checkout.session.completed` event, read tolerantly.
 *
 * `CLAUDE.md`'s rule — *nothing reads an optional field directly* — applies to
 * a third party's JSON more than to anything this repository writes. Stripe
 * moved shipping details from `shipping_details` to
 * `collected_information.shipping_details` in a later API version, and an
 * account's version is a dashboard setting nobody here controls. So **both are
 * read**, newest first, and a missing address is `null` rather than a crash in
 * a webhook handler — where a crash means Stripe retries forever and the
 * captain never finds out the order arrived.
 */
export function readCompletedCheckout(event: unknown): CompletedCheckout | null {
  const object = (event as { data?: { object?: unknown } } | null)?.data?.object;
  if (!object || typeof object !== "object") return null;
  const o = object as Record<string, unknown>;
  const sessionId = str(o.id);
  if (!sessionId) return null;

  const metadata = (o.metadata ?? {}) as Record<string, unknown>;
  const customer = (o.customer_details ?? {}) as Record<string, unknown>;
  const collected = (o.collected_information ?? {}) as Record<string, unknown>;
  const shipping =
    ((collected.shipping_details ?? o.shipping_details) as Record<string, unknown> | undefined) ??
    undefined;
  const addressSource =
    (shipping?.address as Record<string, unknown> | undefined) ??
    (customer.address as Record<string, unknown> | undefined);

  const intent = o.payment_intent;

  return {
    sessionId,
    ref: str(metadata.ref) ?? str(o.client_reference_id),
    paymentIntentId:
      str(intent) ?? str((intent as { id?: unknown } | null)?.id),
    paymentStatus: str(o.payment_status),
    currency: str(o.currency),
    amountTotal: typeof o.amount_total === "number" ? o.amount_total : null,
    email: str(customer.email) ?? str(o.customer_email),
    address: addressSource
      ? {
          name: str(shipping?.name) ?? str(customer.name),
          line1: str(addressSource.line1),
          line2: str(addressSource.line2),
          city: str(addressSource.city),
          state: str(addressSource.state),
          postalCode: str(addressSource.postal_code),
          country: str(addressSource.country),
        }
      : null,
  };
}

/** The event's type, or null if this is not an event. */
export function eventType(event: unknown): string | null {
  return str((event as { type?: unknown } | null)?.type);
}

/**
 * **Is this event one that means money arrived?**
 *
 * `checkout.session.completed` fires when the session completes, and for a
 * card that is the same moment the payment succeeds — but for a delayed
 * method it is not, so `payment_status` is checked too. `paid` and
 * `no_payment_required` are the two values that mean the customer owes
 * nothing further; anything else is a session that completed without the
 * money, and an order marked paid on one of those is a book posted for free.
 */
export function meansPaid(checkout: CompletedCheckout): boolean {
  return checkout.paymentStatus === "paid" || checkout.paymentStatus === "no_payment_required";
}
