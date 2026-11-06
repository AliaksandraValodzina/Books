/**
 * **Whether this shop can take money, decided in one place.**
 *
 * The thing that must never happen is a **fake success**. A customer who
 * finishes a book, presses the button and is shown anything resembling a
 * confirmation has been told a lie about a gift they are relying on. So the
 * decision is a pure function of the environment, separated from any route,
 * because that is the part worth testing: `test/checkout.test.ts` can ask it
 * about every shape of environment there is without standing up a server. The
 * route and the page read it and render; they decide nothing.
 *
 * ## It gates the whole path, not just the key
 *
 * This file used to ask one question — is there a Stripe key — because there
 * was nothing downstream of the key to ask about. There is now, and a shop
 * with a Stripe key and nothing else is the **worse** failure: the card is
 * charged on Stripe's page and then
 *
 * - with no order store, the order is written nowhere and the customer is owed
 *   a book nobody can print; and
 * - with no webhook secret, no event can ever be verified, so nothing can
 *   legitimately mark the order paid and it sits looking abandoned forever.
 *
 * Both are money taken for a book that does not get made. So `REQUIRED` is
 * **every variable the money path needs**, and a half-configured shop reports
 * exactly which rows are empty and refuses — which is the same answer it has
 * always given, for more reasons.
 *
 * **Presence is not enough**, and `lib/env.ts` § `isSet` is why: a blank row, a
 * placeholder and a pasted variable name are what a dashboard actually
 * contains after a hurried first deploy, and each one would otherwise read as
 * configured and fail further in.
 *
 * A **test** key is reported as its own state rather than as ready. Shipping a
 * shop whose live button charges nobody is the other way to lie by accident —
 * and unlike before, test mode now genuinely works end to end, which is how
 * the captain is meant to try it.
 */

import { isSet, missingFrom } from "./env";
import { STORE_REQUIRED } from "./orders/config";

export type CheckoutState =
  /** Something the money path needs is not set. The honest page, and a 503. */
  | { kind: "unconfigured"; missing: string[] }
  /** Test-mode keys. The whole path works and no real money moves. */
  | { kind: "test" }
  /** Live keys. A real sale. */
  | { kind: "live" };

/**
 * **Every variable the checkout needs**, named so `.env.example` and this
 * cannot drift — `test/checkout.test.ts` reads the file and checks each one.
 *
 * `STRIPE_WEBHOOK_SECRET` is in the list because without it the payment can
 * never be confirmed, and the order store's four are in it because without
 * them the order cannot be written down. Neither is optional in the way a
 * bucket for *artwork* is optional.
 */
export const REQUIRED = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  ...STORE_REQUIRED,
] as const;

export { isSet };

export function checkoutState(env: Record<string, string | undefined>): CheckoutState {
  const missing = missingFrom(env, REQUIRED);
  if (missing.length) return { kind: "unconfigured", missing };
  return env.STRIPE_SECRET_KEY!.trim().startsWith("sk_live") ? { kind: "live" } : { kind: "test" };
}

/**
 * What the customer is told when the money path is not wired up.
 *
 * It says the book is kept, because it is — the order is in their browser and
 * nothing here has touched it. That is the one reassurance this screen can
 * give that is actually true.
 */
export const NOT_CONFIGURED = {
  heading: "Payments are not switched on yet",
  body:
    "This shop cannot take money today, so nothing has been charged and no order has been " +
    "placed. Your book is still in this browser exactly as you left it — go back and it " +
    "will be there.",
  honest:
    "The owner has to finish setting this up before the button works. Nothing about your book " +
    "is wrong, and you have not lost anything.",
} as const;

/**
 * What is said when the shop *is* configured and the till still did not open.
 *
 * Stripe can refuse, a bucket can be unreachable, a network can fail. This is
 * the screen for that, and the only words that matter on it are the ones
 * saying **nothing has been charged** — because at this point in the path
 * nothing has: the session is created before the buyer ever sees a card field,
 * so a failure here is always a failure before any money moved.
 */
export const NOT_TAKEN = {
  heading: "The till did not open",
  body:
    "Something went wrong between this page and the payment provider, so nothing has been " +
    "charged and no order has been placed. Trying again is safe.",
  honest: "Your book is still in this browser exactly as you left it.",
} as const;

export function copyFor(state: CheckoutState): typeof NOT_CONFIGURED | typeof NOT_TAKEN {
  return state.kind === "unconfigured" ? NOT_CONFIGURED : NOT_TAKEN;
}

/**
 * The HTTP status a **refusal** answers with.
 *
 * 503 rather than 500 when the shop is closed: it is not broken, it is not
 * open. 502 when it is open and the provider would not play, because the
 * failure is genuinely upstream. And never 200 — a success status is the
 * machine-readable half of a fake success, and something will eventually read
 * it.
 */
export function statusFor(state: CheckoutState): number {
  return state.kind === "unconfigured" ? 503 : 502;
}

/**
 * **Where Stripe sends the buyer back to.**
 *
 * Stripe needs absolute URLs, and the origin of the request is the right
 * answer on Vercel — it is the host the buyer actually typed, so a preview
 * deployment returns to itself rather than to production.
 * `PUBLIC_BASE_URL` overrides it for the one case where the request's own
 * origin is wrong: a proxy in front, or a webhook-triggered email that has no
 * request to read an origin from.
 */
export function baseUrl(env: Record<string, string | undefined>, request?: Request): string {
  const declared = env.PUBLIC_BASE_URL?.trim().replace(/\/+$/, "");
  if (declared && isSet(declared)) return declared;
  if (request) return new URL(request.url).origin;
  return "";
}
