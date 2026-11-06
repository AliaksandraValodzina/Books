/**
 * **The honest refusal, which is the one screen the money path must always
 * have.**
 *
 * A buyer only arrives here when something stopped them reaching Stripe, and
 * there are two of those: the shop is not configured, or it is configured and
 * the till would not open. **Neither is a confirmation**, and that is the
 * whole point of the screen — see `lib/checkout.ts`. A buyer who *did* reach
 * Stripe and paid lands on `/order/[ref]` instead, which is the only page in
 * this codebase that says an order exists.
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
import { pageTitle } from "../../lib/brand";
import { checkoutState, copyFor } from "../../lib/checkout";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: pageTitle("nothing has been charged"),
  // Not indexable: a page that says a shop cannot take money is not a page to
  // find in a search result for the shop.
  robots: { index: false, follow: false },
};

export default async function Checkout() {
  const state = checkoutState(process.env);
  const copy = copyFor(state);

  return (
    <main className="mx-auto w-full max-w-[34rem] px-5 py-14">
      <h1 className="text-2xl font-semibold">{copy.heading}</h1>
      <p className="mt-4 opacity-85">{copy.body}</p>
      <p className="mt-3 text-sm opacity-70">{copy.honest}</p>

      <p className="mt-8">
        <a
          className="inline-block rounded-lg bg-[#2b1d14] px-5 py-3 font-medium text-[#efe9df]"
          href="/"
        >
          Back to your page
        </a>
      </p>

      {state.kind === "unconfigured" ? (
        <p className="mt-10 border-t border-current/10 pt-5 text-xs opacity-55">
          For whoever is deploying this: set{" "}
          {state.missing.map((name, index) => (
            <span key={name}>
              {index > 0 ? ", " : ""}
              <code>{name}</code>
            </span>
          ))}{" "}
          in the hosting environment. <code>.env.example</code> names every variable this project
          reads and carries a value for none of them, because the repository is public.
        </p>
      ) : null}
    </main>
  );
}
