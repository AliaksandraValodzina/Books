/**
 * **Receiving a Stripe event, decided here rather than in a route.**
 *
 * The route used to hold all of this, and that made the most important flow in
 * the whole product the least testable thing in it: `storeFromEnv` deliberately
 * never returns anything that is not a real bucket — `./store.ts` § there is no
 * fallback — so a route that reached for the store itself could only be tested
 * by not having one. The one question worth asking of this code is *does a
 * forged event mark an order paid*, and that question needs a store.
 *
 * So the store arrives as an argument, the clock arrives as an argument, and
 * sending the email arrives as a function. `app/api/stripe/webhook/route.ts` is
 * then HTTP glue — read the raw body, call this, turn a `Receipt` into a
 * response — which is this repository's standing arrangement for React and is
 * the right one for a route too.
 *
 * **The order of the checks is the design.** Signature first, before the JSON
 * is even parsed, because everything after it is work done on a stranger's
 * behalf. Then the event type, then whether Stripe says the money is actually
 * there, and only then `markPaid`.
 */

import { eventType, meansPaid, readCompletedCheckout, verifySignature } from "../stripe/webhook";
import { markEmailed, markPaid, type OrderStore } from "./store";
import type { OrderRecord } from "./record";

export type Receipt =
  /** Nothing was done and the sender should be told so. */
  | { ok: false; status: 400 | 404 | 503; detail: string }
  /** Handled. `paid` says whether this event moved an order to paid. */
  | {
      ok: true;
      status: 200;
      /** An event type this endpoint does not handle, acknowledged. */
      ignored?: string;
      ref?: string;
      paid: boolean;
      /** A retry of an event already handled. */
      already?: boolean;
      emailed?: boolean;
    };

export async function receiveStripeEvent(options: {
  /** The raw body, exactly as it arrived. Re-serialising it breaks every signature. */
  payload: string;
  header: string | null;
  /** `STRIPE_WEBHOOK_SECRET`, or undefined when the endpoint is not configured. */
  secret: string | undefined;
  now: Date;
  /** Null when no store is configured, which is a 503 and not a refusal. */
  store: OrderStore | null;
  /**
   * Send the confirmation. Returns whether it went.
   *
   * It is a function rather than a call because an email provider having a bad
   * afternoon must not turn a successful payment into a retried event. A
   * `deliver` that throws is caught here and recorded as not sent.
   */
  deliver?: (record: OrderRecord) => Promise<boolean>;
}): Promise<Receipt> {
  if (!options.secret) {
    // Not 400: there is nothing wrong with the request.
    return { ok: false, status: 503, detail: "no webhook secret is set" };
  }

  const verdict = verifySignature({
    payload: options.payload,
    header: options.header,
    secret: options.secret,
    now: options.now,
  });
  if (!verdict.ok) return { ok: false, status: 400, detail: verdict.why };

  let event: unknown;
  try {
    event = JSON.parse(options.payload);
  } catch {
    return { ok: false, status: 400, detail: "signed, but not JSON" };
  }

  const type = eventType(event);
  if (type !== "checkout.session.completed") {
    // Acknowledged and ignored. An endpoint that 400s at event types it does
    // not handle shows up red in a dashboard for doing the right thing.
    return { ok: true, status: 200, ignored: type ?? "(none)", paid: false };
  }

  const checkout = readCompletedCheckout(event);
  if (!checkout) return { ok: false, status: 400, detail: "no session" };
  if (!checkout.ref) {
    return { ok: false, status: 400, detail: "no order reference on the session" };
  }
  if (!meansPaid(checkout)) {
    // The session completed and the money is not there — a delayed payment
    // method, or one that failed after the redirect. Nothing is marked paid,
    // which is the whole point of asking.
    return { ok: true, status: 200, ref: checkout.ref, paid: false };
  }

  if (!options.store) {
    // The money is real and this event has not been handled. A retry once the
    // bucket is configured is exactly what should happen.
    return { ok: false, status: 503, detail: "no order store is configured" };
  }

  const result = await markPaid(
    options.store,
    checkout.ref,
    {
      sessionId: checkout.sessionId,
      paymentIntentId: checkout.paymentIntentId,
      charged:
        checkout.amountTotal !== null && checkout.currency
          ? { currency: checkout.currency, minorUnits: checkout.amountTotal }
          : null,
      address: checkout.address,
      email: checkout.email,
    },
    options.now,
  );

  if (!result) {
    // Signed by Stripe, naming an order this shop has never written down —
    // what a replayed event from another deployment looks like.
    return { ok: false, status: 404, detail: "no such order" };
  }
  if (result.already) {
    return { ok: true, status: 200, ref: result.record.ref, paid: true, already: true };
  }

  // The confirmation, and only on the first delivery: Stripe's retries must
  // not send a buyer the same email five times.
  let emailed = false;
  if (result.record.email && options.deliver) {
    try {
      emailed = await options.deliver(result.record);
    } catch {
      emailed = false;
    }
    if (emailed) await markEmailed(options.store, result.record.ref);
  }

  return { ok: true, status: 200, ref: result.record.ref, paid: true, emailed };
}
