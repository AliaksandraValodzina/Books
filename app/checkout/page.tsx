/**
 * What the customer sees after pressing the order button.
 *
 * There are two honest things this page can say and it says whichever is true:
 * payments are not configured, or they are configured and the checkout is not
 * finished. **Neither is a confirmation**, and that is the whole point of the
 * screen — see `lib/checkout.ts`.
 *
 * It reads the environment on the server, which is the only place a secret is
 * ever touched: the variable's *presence* reaches the browser as one of two
 * words, and its value does not leave the function. `test/checkout.test.ts`
 * renders this component against both environments and asserts, among other
 * things, that no key material appears in the markup.
 *
 * The reassurance it gives is true rather than soothing: the draft is in the
 * customer's own browser and nothing here has touched it, so "go back and it
 * will be there" is a fact.
 */

import type { Metadata } from "next";
import { checkoutState, copyFor } from "../../lib/checkout";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Books — payments are not switched on yet",
  // Not indexable: a page that says a shop cannot take money is not a page to
  // find in a search result for the shop.
  robots: { index: false, follow: false },
};

export default async function Checkout() {
  const state = checkoutState(process.env);
  const copy = copyFor(state);

  return (
    /*
      Dressed in the same register as the selling page — the display face for
      the heading, the tokens for everything else. A customer who presses the
      order button and lands somewhere that looks like a different site reads
      that as the payment step having gone wrong, which is the one impression
      this screen exists to avoid.

      The button is `bg-ink`, not the accent. The accent means "this is the
      desirable thing" and the desirable thing on this page is going back to
      the page they made, not a second attempt at a checkout that does not
      exist.
    */
    <main className="mx-auto w-full max-w-[34rem] px-5 py-14">
      <h1 className="font-display text-[1.75rem] font-normal leading-tight tracking-[-0.01em]">
        {copy.heading}
      </h1>
      <p className="mt-4 text-[1.0625rem] leading-[1.5]">{copy.body}</p>
      <p className="mt-3 text-[0.9375rem] text-ink-soft">{copy.honest}</p>

      <p className="mt-8">
        <a
          className="inline-flex h-14 items-center justify-center rounded-[10px] bg-ink px-6 text-[1.0625rem] font-semibold text-ground"
          href="/"
        >
          Back to your page
        </a>
      </p>

      {state.kind === "unconfigured" ? (
        <p className="mt-10 border-t border-rule pt-5 text-[0.8125rem] text-ink-soft">
          For whoever is deploying this: set{" "}
          {state.missing.map((name) => (
            <code key={name}>{name}</code>
          ))}{" "}
          in the hosting environment. <code>.env.example</code> names every variable this project
          reads and carries a value for none of them, because the repository is public.
        </p>
      ) : null}
    </main>
  );
}
