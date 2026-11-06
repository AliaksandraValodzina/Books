/**
 * **The only thing in this shop that may say an order was paid for.**
 *
 * A buyer coming back to `/order/BK-XXXXXXX` proves they have a URL. It does
 * not prove a card was charged, because that URL can be typed, shared,
 * prefetched by a mail client or followed by a crawler — and a shop that
 * believed it would post books to whoever guessed a reference. So the redirect
 * shows the order and **this** marks it paid, after checking a signature.
 *
 * The decisions are `lib/orders/receive.ts`, which is where the tests point:
 * the store, the clock and the sending of the email all arrive as arguments
 * there, so the question that matters — *does a forged event mark an order
 * paid* — can be asked without a bucket. This file is HTTP.
 *
 * Two things it does that are easy to get wrong:
 *
 * **It reads the raw body.** `request.text()`, handed over untouched. Parsing
 * and re-serialising produces a different string — key order, spacing, unicode
 * escapes — and would fail every signature there is.
 *
 * **It answers 200 when the email fails.** The money arrived and the order is
 * recorded; an email provider having a bad afternoon must not turn that into a
 * retried event and eventually an order that looks abandoned. The failure is
 * written onto the record as `emailed: false` instead, which is a column the
 * captain can see and act on.
 */

import { NextResponse } from "next/server";
import { FIRST_BOOK } from "../../../../templates/first-book";
import { baseUrl } from "../../../../lib/checkout";
import { value } from "../../../../lib/env";
import { receiveStripeEvent } from "../../../../lib/orders/receive";
import { storeFromEnv } from "../../../../lib/orders/store";
import { emailFor } from "../../../../lib/email/order";
import { sendEmail } from "../../../../lib/email/send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const storeState = storeFromEnv(process.env);
  const base = baseUrl(process.env, request);

  const receipt = await receiveStripeEvent({
    payload: await request.text(),
    header: request.headers.get("stripe-signature"),
    secret: value(process.env, "STRIPE_WEBHOOK_SECRET"),
    now: new Date(),
    store: storeState.kind === "ready" ? storeState.store : null,
    deliver: async (record) => {
      const sent = await sendEmail({
        to: record.email!,
        email: emailFor({
          record,
          bookName: FIRST_BOOK.name,
          url: `${base}/order/${record.ref}?session=${encodeURIComponent(record.sessionId ?? "")}`,
          changeTo: value(process.env, "ORDER_EMAIL_REPLY_TO"),
        }),
        env: process.env,
      });
      return sent.sent;
    },
  });

  // The reason is returned because it is diagnostic and carries nothing
  // secret — "the signature does not match" tells an attacker what they
  // already know and tells a deployer with the wrong secret what they need.
  return NextResponse.json(receipt, { status: receipt.status });
}

/** A hand-typed URL is not a blank page, and this endpoint is Stripe's alone. */
export async function GET() {
  return NextResponse.json(
    { ok: false, detail: "Stripe posts signed events here. There is nothing to GET." },
    { status: 405, headers: { allow: "POST" } },
  );
}
