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
