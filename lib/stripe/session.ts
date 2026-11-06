/**
 * **The hosted Checkout Session: Stripe's page, not ours.**
 *
 * The brief is unambiguous and it is the only sane reading of the risk: *use
 * Stripe's hosted Checkout Session, do not build a card form, do not handle a
 * PAN, do not store a card.* So nothing in this repository ever sees a card
 * number. What goes out is an amount, a line of copy and two URLs; what comes
 * back is a URL to send the buyer to. The card is typed on `checkout.stripe.com`
 * and `lib/orders/record.ts` has nowhere to put one even if it arrived.
 *
 * ## Why there is no `stripe` dependency
 *
 * Two calls — create a session, read one back — against a form-encoded API
 * whose bodies are written out in `./form.ts` and asserted in a test. The SDK
 * would bring a credential-provider chain, a retry layer and a telemetry
 * client to make them, and would make the one part worth testing (*exactly
 * what is on the wire*) reachable only through a mock of itself. The seam here
 * is `fetch`, which a test can simply hand a function.
 *
 * ## The secret key is read in one place and never leaves it
 *
 * It arrives as an argument, goes into an `authorization` header, and appears
 * in no error message, no response and no log line. `test/stripe-session.test.ts`
 * asserts that — the repository is public and so are its logs.
 */

import { formEncode, type Nested } from "./form";
import { priceOf, type Edition } from "../book/editions";
import type { OrderRecord } from "../orders/record";

const API = "https://api.stripe.com/v1";

/**
 * **Where this shop will post a book to.**
 *
 * Australia only, and that is evidence rather than caution: the prices are in
 * AUD, the book is printed in Australia, and `lib/product.ts`'s `DELIVERY`
 * fact records that the delivery window for *any* country is unconfirmed —
 * "Printify's production time plus the provider's shipping to the customer's
 * country", neither of which is in this repository. Taking money from a buyer
 * in a country whose delivery time nobody has looked up is the shape of
 * promise this codebase refuses to make.
 *
 * Widening it is one edit and a real delivery window. `app/delivery/page.tsx`
 * renders **this list** rather than restating it, so the policy page and the
 * till cannot come to different conclusions about who can buy.
 */
export const SHIPS_TO = ["AU"] as const;

/** Whole dollars into the minor units Stripe charges in. `AUD 59` → `5900`. */
export function minorUnits(amount: number): number {
  return Math.round(amount * 100);
}

/**
 * The body of the create-session request, as a plain object a test can read.
 *
 * Separated from the request so that every claim about what is being asked for
 * — the currency, the amount, the shipping collection, the reference carried
 * in metadata — is checkable without a network.
 */
export function sessionParams(options: {
  record: OrderRecord;
  edition: Edition;
  successUrl: string;
  cancelUrl: string;
}): Nested {
  const { record, edition } = options;
  return {
    mode: "payment",
    // Stripe's hosted page always collects an email in payment mode, which is
    // the email the order confirmation goes to — so there is no field for one
    // on this site, which is the point: no account, nothing to sign up for.
    success_url: options.successUrl,
    cancel_url: options.cancelUrl,
    client_reference_id: record.ref,
    "line_items[0][quantity]": 1,
    "line_items[0][price_data][currency]": edition.price.currency.toLowerCase(),
    "line_items[0][price_data][unit_amount]": minorUnits(edition.price.amount),
    // The child's name is in the line item on purpose: the buyer's card
    // statement and Stripe's own receipt then say which book this was, which
    // is the difference between a recognised charge and a chargeback.
    "line_items[0][price_data][product_data][name]":
      `${record.fill.name ? `${record.fill.name}'s book` : "A personalised book"} — ${edition.label}`,
    "line_items[0][price_data][product_data][description]": edition.blueprint,
    "shipping_address_collection[allowed_countries]": [...SHIPS_TO],
    billing_address_collection: "auto",
    // Carried on the session **and** on the payment, so the reference is
    // findable from either side of Stripe's dashboard.
    "metadata[ref]": record.ref,
    "metadata[fingerprint]": record.fingerprint,
    "metadata[bookRev]": record.fill.bookRev,
    "metadata[edition]": edition.id,
    "payment_intent_data[metadata][ref]": record.ref,
    "payment_intent_data[description]": `${record.ref} — ${edition.label}, ${priceOf(edition.price)}`,
  };
}

export type SessionResult =
  | { ok: true; id: string; url: string }
  /** Stripe said no. `detail` is safe to show a deployer and carries no key. */
  | { ok: false; detail: string };

export interface StripeCall {
  secretKey: string;
  /**
   * **`orderFingerprint`, as the brief asks.**
   *
   * Stripe holds an idempotency key for 24 hours and replays the first
   * response for it, so a double-click — or a buyer reloading the step — gets
   * the session that already exists rather than a second one. The key is the
   * fill's own content hash, which means two presses of the same button are
   * the same request *by construction* and not by a flag somebody remembered
   * to set.
   */
  idempotencyKey: string;
  fetchLike?: typeof fetch;
}

async function call(
  path: string,
  init: { method: string; body?: string; idempotencyKey?: string },
  secretKey: string,
  fetchLike: typeof fetch,
): Promise<{ ok: boolean; status: number; json: unknown }> {
  const response = await fetchLike(`${API}${path}`, {
    method: init.method,
    headers: {
      authorization: `Bearer ${secretKey}`,
      "content-type": "application/x-www-form-urlencoded",
      ...(init.idempotencyKey ? { "idempotency-key": init.idempotencyKey } : {}),
    },
    body: init.body,
  });
  const text = await response.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { error: { message: text.slice(0, 300) } };
  }
  return { ok: response.ok, status: response.status, json };
}

/** Stripe's own message for a refusal, or a sentence saying there wasn't one. */
function refusalOf(json: unknown, status: number): string {
  const message = (json as { error?: { message?: string } } | null)?.error?.message;
  return message ? message : `Stripe answered HTTP ${status} with no message.`;
}

export async function createSession(
  params: Nested,
  options: StripeCall,
): Promise<SessionResult> {
  const result = await call(
    "/checkout/sessions",
    { method: "POST", body: formEncode(params), idempotencyKey: options.idempotencyKey },
    options.secretKey,
    options.fetchLike ?? fetch,
  );
  if (!result.ok) return { ok: false, detail: refusalOf(result.json, result.status) };
  const session = result.json as { id?: unknown; url?: unknown };
  if (typeof session.id !== "string" || typeof session.url !== "string") {
    return { ok: false, detail: "Stripe created a session with no id or no URL." };
  }
  return { ok: true, id: session.id, url: session.url };
}
