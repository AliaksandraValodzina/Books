/**
 * **The captain's door, and the only one.**
 *
 * Behind it: every order ever placed, every buyer's address, every buyer's
 * photograph of their own child, and a print-ready PDF of each. There is no
 * account system and the captain does not want one — a single shared secret in
 * an environment variable is what they asked for, and for one person shipping
 * books by hand it is the right size of mechanism. What matters is that it is
 * **actually a door** rather than an obscure URL, and three decisions make it
 * one:
 *
 * **It fails closed when nothing is configured.** With `ADMIN_SECRET` unset,
 * `allowed()` is false for every request there is. That is the opposite of the
 * convention everywhere else in this repository — `.env.example`'s standing
 * arrangement is "inert rather than broken", and an unset variable elsewhere
 * means a feature politely does nothing. Here an unset variable would mean an
 * unprotected list of customers' addresses on a public URL, so the default is
 * *nobody*, and `test/admin-guard.test.ts` asserts it first.
 *
 * **It is one function, and every admin entry point calls it before anything
 * else.** `test/admin-guard.test.ts` reads the files under `app/admin/` and
 * `app/api/admin/` and fails if one of them does not — so an admin page added
 * next year is protected by the test rather than by whoever writes it
 * remembering to be.
 *
 * **The cookie is not the secret.** It carries an HMAC of a fixed string under
 * the secret, so a cookie lifted from a laptop grants access to this site and
 * does not hand over a value the captain may well have reused somewhere else.
 * `httpOnly` so no script can read it, `sameSite=strict` so no other site can
 * cause a request with it, `secure` so it never crosses a plain connection.
 *
 * ## What this is not
 *
 * It is not an account system, it does not identify a person, and it has no
 * sessions, no expiry and no revocation beyond changing the variable. Those
 * are the honest limits of one shared secret and they are written here so that
 * nobody later mistakes this for authentication.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { isSet } from "../env";

/** The one variable. Named here so `.env.example` and this cannot drift. */
export const ADMIN_REQUIRED = ["ADMIN_SECRET"] as const;

export const COOKIE = "books_captain";

/**
 * What the cookie holds: an HMAC of a constant, under the secret.
 *
 * The constant is not a nonce and is not pretending to be one. Its only job is
 * to make the cookie a *derivative* of the secret rather than the secret
 * itself.
 */
export function cookieValueFor(secret: string): string {
  return createHmac("sha256", secret).update("books.admin.v1").digest("hex");
}

function equal(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length === 0 || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export type Access =
  | { ok: true }
  /** No `ADMIN_SECRET`: nobody gets in, and the page says that rather than asking. */
  | { ok: false; reason: "unconfigured" }
  /** A secret exists and this request did not present it. */
  | { ok: false; reason: "denied" };

/**
 * **Is this request the captain?**
 *
 * Two ways in, both the same secret:
 *
 * - the cookie `cookieValueFor` writes, which is how the browser gets in after
 *   the form on `/admin`
 * - `authorization: Bearer <ADMIN_SECRET>`, which is how a `curl` gets the
 *   print file without a browser — the captain downloading twenty PDFs should
 *   not have to click twenty times
 *
 * Everything else — a query parameter, a referrer, a header this code invented
 * — is not a way in. A secret in a query string is a secret in an access log,
 * in a `Referer` and in the captain's own browser history.
 */
export function allowed(options: {
  env: Record<string, string | undefined>;
  cookie?: string | null;
  authorization?: string | null;
}): Access {
  const secret = options.env.ADMIN_SECRET;
  if (!isSet(secret)) return { ok: false, reason: "unconfigured" };
  const trimmed = secret!.trim();

  if (options.cookie && equal(options.cookie, cookieValueFor(trimmed))) return { ok: true };

  const bearer = /^Bearer\s+(.+)$/i.exec((options.authorization ?? "").trim())?.[1];
  if (bearer && equal(bearer.trim(), trimmed)) return { ok: true };

  return { ok: false, reason: "denied" };
}

/** The same question asked of a `Request`, which is what a route has. */
export function allowedFor(request: Request, env: Record<string, string | undefined>): Access {
  return allowed({
    env,
    cookie: cookieFrom(request.headers.get("cookie"), COOKIE),
    authorization: request.headers.get("authorization"),
  });
}

/** One cookie out of a `Cookie` header, without a parser. */
export function cookieFrom(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const at = part.indexOf("=");
    if (at < 0) continue;
    if (part.slice(0, at).trim() === name) return decodeURIComponent(part.slice(at + 1).trim());
  }
  return null;
}

/**
 * What is said to somebody who is not the captain.
 *
 * It says nothing about whether the order asked for exists. "No such order"
 * and "not your order" are the same sentence here, because the difference
 * between them is a way to enumerate customers.
 */
export const REFUSAL = {
  unconfigured:
    "This is the owner's page and no owner secret is configured, so there is nothing to let " +
    "anybody in. Set ADMIN_SECRET in the hosting environment.",
  denied: "This is the owner's page.",
} as const;

export function refusalFor(access: Extract<Access, { ok: false }>): string {
  return REFUSAL[access.reason];
}
