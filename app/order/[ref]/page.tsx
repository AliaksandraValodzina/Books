/**
 * **The page after the payment, and the only thing it has to do is be true.**
 *
 * Five things, which are the five the brief names: the reference, what was
 * ordered, **the name large and alone**, the dispatch window, and the 24-hour
 * promise with how to use it. The email says exactly the same five, because
 * both are built from `lib/email/order.ts` — two copies of a dispatch window
 * is how a shop promises four days on a page and five in an email.
 *
 * ## Being here is not proof of payment, and the page does not pretend it is
 *
 * The buyer arrives by Stripe's redirect, which typically beats the webhook by
 * a second or two. So the page reads the **record**, and if the webhook has
 * not landed yet it says the payment is still being confirmed rather than
 * announcing a sale that nothing has verified. That state resolves by itself
 * on a reload, and saying so is better than a spinner that lies either way.
 *
 * ## Why the session id is in the URL
 *
 * A reference is seven characters and short enough to be worth guessing at,
 * and behind one is a child's name, a dedication and a delivery address. So
 * the page opens only for a request that also carries the Checkout Session id
 * the order was paid under — which Stripe substitutes into the URL it sends
 * the buyer to, and which the confirmation email repeats. Without it this says
 * so plainly and shows nothing.
 *
 * **It is not an account and does not pretend to be one.** A buyer who loses
 * both the tab and the email writes to us with the reference, which is what
 * the reference is for.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FIRST_BOOK } from "../../../templates/first-book";
import { pageTitle } from "../../../lib/brand";
import { FACES } from "../../../lib/render/fonts";
import { nameSlotFont } from "../../../lib/book/name";
import { storeFromEnv } from "../../../lib/orders/store";
import { isReference } from "../../../lib/orders/record";
import { changeSentence, confirmation } from "../../../lib/email/order";
import { value } from "../../../lib/env";
import SiteFooter from "../../_components/SiteFooter";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: pageTitle("Your order"),
  // Not indexable. A page naming a child and an order is not a search result.
  robots: { index: false, follow: false },
};

/** What is said when the link is wrong, incomplete, or for an order nobody has. */
function Closed({ heading, body }: { heading: string; body: string }) {
  return (
    <main className="mx-auto w-full max-w-[34rem] px-5 py-14">
      <h1 className="text-2xl font-semibold">{heading}</h1>
      <p className="mt-4 opacity-85">{body}</p>
      <p className="mt-8">
        <a className="inline-block rounded-lg bg-[#2b1d14] px-5 py-3 font-medium text-[#efe9df]" href="/">
          Back to the shop
        </a>
      </p>
      <SiteFooter />
    </main>
  );
}

export default async function OrderPage(props: {
  params: Promise<{ ref: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { ref } = await props.params;
  const search = await props.searchParams;
  const session = typeof search.session === "string" ? search.session : "";

  if (!isReference(ref)) notFound();

  const storeState = storeFromEnv(process.env);
  if (storeState.kind !== "ready") {
    return (
      <Closed
        heading="Orders are not switched on here"
        body={
          "This deployment has no order store configured, so there is nothing to show and " +
          "nothing has been charged."
        }
      />
    );
  }

  const record = await storeState.store.get(ref);
  // One sentence for "no such order" and for "wrong link", deliberately: the
  // difference between them is a way to find out which references exist.
  if (!record || !record.sessionId || record.sessionId !== session) {
    return (
      <Closed
        heading="We cannot open that order from here"
        body={
          "This page opens only from the link Stripe sent you back on, which is also in your " +
          "order confirmation email. Open it from there, or write to us with your order " +
          "reference and we will look it up."
        }
      />
    );
  }

  const c = confirmation(record, FIRST_BOOK.name);
  const face = FACES[nameSlotFont(FIRST_BOOK)]?.family;

  return (
    <main className="mx-auto w-full max-w-[34rem] px-5 py-14">
      <p className="text-sm uppercase tracking-wide opacity-60">Your order</p>
      <h1 data-testid="order-ref" className="mt-1 text-3xl font-semibold tabular-nums">
        {c.ref}
      </h1>

      {c.paid ? (
        <p className="mt-3 opacity-85" data-testid="order-paid">
          Paid. {c.ordered}, {c.charged ?? c.price}.
        </p>
      ) : (
        <p className="mt-3 opacity-85" data-testid="order-awaiting">
          {c.ordered}, {c.price}. We are still confirming the payment with Stripe — that
          usually takes a few seconds. Reload this page in a moment.
        </p>
      )}

      {/*
        **Alone, and nothing beside it.** `app/_book/Confirm.tsx` makes the
        argument: a name inside artwork gets skimmed and a name alone gets
        read. This is the last place it can be checked while changing it is
        still free, so it is set in the face it will print in and given the
        whole width.
      */}
      <section className="mt-9 border-y border-current/15 py-8" aria-labelledby="printed-as">
        <p id="printed-as" className="text-center text-sm opacity-70">
          This is how it will be printed:
        </p>
        <p
          data-testid="order-name"
          lang="en"
          className="mt-2 break-words text-center text-4xl leading-tight sm:text-5xl"
          style={face ? { fontFamily: `"${face}", serif` } : undefined}
        >
          {c.name}
        </p>
      </section>

      <dl className="mt-8 grid gap-3 text-sm sm:grid-cols-[10rem_1fr]">
        <dt className="font-semibold">What you ordered</dt>
        <dd data-testid="order-what">{c.ordered}</dd>
        <dt className="font-semibold">Price</dt>
        <dd className="tabular-nums">{c.charged ?? c.price}</dd>
        <dt className="font-semibold">Dispatch</dt>
        <dd data-testid="order-dispatch">
          {c.dispatchWindow} from today. Delivery time is on top of that and depends where you are.
        </dd>
        {c.address.length ? (
          <>
            <dt className="font-semibold">Going to</dt>
            <dd>
              {c.address.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </dd>
          </>
        ) : null}
      </dl>

      <section className="mt-8 rounded-xl border border-current/15 p-4" aria-labelledby="change-it">
        <h2 id="change-it" className="font-semibold">
          Spotted something? You have 24 hours
        </h2>
        <p className="mt-2 text-sm opacity-85" data-testid="order-change">
          {changeSentence(c.ref, value(process.env, "ORDER_EMAIL_REPLY_TO"))}
        </p>
      </section>

      <p className="mt-8 text-sm opacity-70">
        We have emailed this to you. Keep it — it is the record of what you ordered.
      </p>

      <SiteFooter />
    </main>
  );
}
