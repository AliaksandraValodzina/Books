/**
 * **Whether this shop can take money, decided in one place.**
 *
 * Stripe needs keys the captain has not supplied, and nothing secret goes in a
 * public repository — so the only honest state today is "not configured", and
 * the only thing that must never happen is a **fake success**. A customer who
 * finishes a page, presses the button and is shown anything resembling a
 * confirmation has been told a lie about a gift they are relying on.
 *
 * So the decision is a pure function of the environment, separated from any
 * route, because that is the part worth testing: `test/checkout.test.ts` can
 * ask it about every shape of environment there is without standing up a
 * server. The route and the page read it and render; they decide nothing.
 *
 * **Presence is not enough.** A key is also "absent" when it is an empty
 * string, whitespace, or one of the placeholder strings a `.env.example` gets
 * copied into a dashboard as. Those are the realistic ways this goes wrong on a
 * first deploy, and every one of them would otherwise read as configured and
 * fail further in, where the failure looks like a crash instead of a notice.
 *
 * A **test** key is reported as its own state rather than as ready. Shipping a
 * shop whose live button charges nobody is the other way to lie by accident.
 */

export type CheckoutState =
  /** No usable `STRIPE_SECRET_KEY`. The honest page, and a 503 from the route. */
  | { kind: "unconfigured"; missing: string[] }
  /** A test-mode key. Usable for a trial run, and never silently sold against. */
  | { kind: "test" }
  /** A live key. The session is the next task; see `NOT_IMPLEMENTED`. */
  | { kind: "live" };

/** Every variable the checkout needs, named so `.env.example` and this cannot drift. */
export const REQUIRED = ["STRIPE_SECRET_KEY"] as const;

/**
 * Values that are present and mean nothing.
 *
 * `.env.example` carries no values, so these are what a dashboard field holds
 * when somebody has pasted a name instead of a key, or saved the row empty.
 */
const PLACEHOLDERS = new Set([
  "",
  "-",
  "todo",
  "changeme",
  "replaceme",
  "your_key_here",
  "sk_test_...",
  "sk_live_...",
  "stripe_secret_key",
]);

/** Is this environment value a real key rather than a blank or a placeholder? */
export function isSet(value: string | undefined): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed.length < 8) return false;
  return !PLACEHOLDERS.has(trimmed.toLowerCase());
}

export function checkoutState(env: Record<string, string | undefined>): CheckoutState {
  const missing = REQUIRED.filter((name) => !isSet(env[name]));
  if (missing.length) return { kind: "unconfigured", missing: [...missing] };
  return env.STRIPE_SECRET_KEY!.trim().startsWith("sk_live") ? { kind: "live" } : { kind: "test" };
}

/**
 * What the customer is told when payments are not wired up.
 *
 * It says the page is kept, because it is — the draft is in their browser and
 * nothing here has touched it. That is the one reassurance this screen can give
 * that is actually true.
 */
export const NOT_CONFIGURED = {
  heading: "Payments are not switched on yet",
  body:
    "This shop cannot take money today, so nothing has been charged and no order has been " +
    "placed. Your page is still in this browser exactly as you left it — go back and it " +
    "will be there.",
  honest:
    "The owner has to add a Stripe key before the button works. Nothing about your page is " +
    "wrong, and you have not lost anything.",
} as const;

/**
 * What is shown when a key *is* configured.
 *
 * Still not a sale. Creating a Stripe Checkout session, holding the order and
 * handing the print file to Printify is the next task, and a screen that
 * implied otherwise would be the fake success this module exists to prevent.
 * Saying so plainly is the only state that is neither a crash nor a lie.
 */
export const NOT_IMPLEMENTED = {
  heading: "Checkout is configured, but not finished",
  body:
    "A Stripe key is set, so the shop is halfway there — but the checkout session, the order " +
    "record and the hand-off to the printer are not built yet, and this page will not pretend " +
    "they are. Nothing has been charged.",
  honest: "Your page is still in this browser exactly as you left it.",
} as const;

export function copyFor(state: CheckoutState): typeof NOT_CONFIGURED | typeof NOT_IMPLEMENTED {
  return state.kind === "unconfigured" ? NOT_CONFIGURED : NOT_IMPLEMENTED;
}

/**
 * The HTTP status the route answers with.
 *
 * 503 rather than 500: the shop is not broken, it is not open. And never 200 —
 * a success status is the machine-readable half of a fake success, and
 * something will eventually read it.
 */
export function statusFor(state: CheckoutState): number {
  return state.kind === "unconfigured" ? 503 : 501;
}
