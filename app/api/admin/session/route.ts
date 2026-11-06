/**
 * **Typing the shared secret in, once, so a browser can read the admin pages.**
 *
 * It is not a login and there is no session to speak of: the cookie it sets is
 * an HMAC of a constant under `ADMIN_SECRET`, which `lib/admin/guard.ts`
 * recomputes and compares. There is no user, no expiry beyond the cookie's own
 * and no revocation except changing the variable — those are the honest limits
 * of one shared secret and they are written down rather than implied.
 *
 * **The secret arrives in a POST body and never in a URL.** A secret in a query
 * string is a secret in an access log, in a `Referer` header and in the
 * captain's own browser history.
 *
 * `allowed()` is called here too, with the typed value as a bearer token, so
 * the comparison happens in exactly one place in the whole codebase — and so
 * that an unconfigured `ADMIN_SECRET` cannot be opened by typing the empty
 * string.
 */

import { NextResponse } from "next/server";
import { COOKIE, allowed, cookieValueFor } from "../../../../lib/admin/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const typed = String(form?.get("secret") ?? "");
  const next = String(form?.get("next") ?? "/admin");

  // Only a path on this site, so the form cannot be used to bounce somebody
  // somewhere else with a fresh cookie in their jar.
  const destination = /^\/admin(\/[A-Za-z0-9-]*)?$/.test(next) ? next : "/admin";

  const access = allowed({ env: process.env, authorization: `Bearer ${typed}` });
  if (!access.ok) {
    return NextResponse.redirect(new URL(destination, request.url), 303);
  }

  const response = NextResponse.redirect(new URL(destination, request.url), 303);
  response.cookies.set(COOKIE, cookieValueFor(process.env.ADMIN_SECRET!.trim()), {
    httpOnly: true,
    sameSite: "strict",
    // Off in development, where there is no HTTPS and the cookie would never
    // be sent at all. `NODE_ENV` is the only thing this decision reads.
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}

export async function GET() {
  return NextResponse.json({ ok: false, detail: "This is a POST." }, { status: 405, headers: { allow: "POST" } });
}
