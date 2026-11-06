/**
 * **Is this environment variable a real value, or a row somebody left behind?**
 *
 * Lifted out of `lib/checkout.ts` when the money path grew a second thing to
 * configure, because two modules now need the same answer and a copy of this
 * function is how two modules come to disagree about whether a shop is open.
 *
 * **Presence is not enough.** A variable is also "absent" when it is an empty
 * string, whitespace, or one of the placeholder strings a `.env.example` gets
 * copied into a dashboard as. Those are the realistic ways a first deploy goes
 * wrong, and every one of them reads as configured to an `if (process.env.X)`
 * check and then fails further in, where the failure looks like a crash
 * instead of a notice.
 */

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
  "whsec_...",
]);

/** Is this environment value a real value rather than a blank or a placeholder? */
export function isSet(value: string | undefined): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed.length < 8) return false;
  if (PLACEHOLDERS.has(trimmed.toLowerCase())) return false;
  // A pasted variable NAME is the other thing a hurried dashboard contains,
  // and it is indistinguishable from a key by length alone. The underscore is
  // load-bearing: an all-caps string with no underscore in it is a plausible
  // secret — a bucket's access key id is exactly that shape — and refusing
  // one would be the opposite failure, a correctly configured shop that says
  // it is closed.
  return !/^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/.test(trimmed);
}

/** The names in `required` that this environment has no usable value for. */
export function missingFrom(
  env: Record<string, string | undefined>,
  required: readonly string[],
): string[] {
  return required.filter((name) => !isSet(env[name]));
}

/** Whatever was trimmed, or undefined if it was not a usable value. */
export function value(env: Record<string, string | undefined>, name: string): string | undefined {
  return isSet(env[name]) ? env[name]!.trim() : undefined;
}
