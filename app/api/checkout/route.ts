/**
 * The checkout step, stubbed deliberately and honestly.
 *
 * Stripe needs keys the captain has not provided, and nothing secret goes in a
 * public repository. So this route reads `STRIPE_SECRET_KEY` from the
 * environment and, finding nothing usable, **says so** — rather than crashing,
 * and far more importantly rather than showing anything a customer could read
 * as a confirmation. A fake success on a gift somebody is relying on is the
 * worst failure in this whole codebase.
 *
 * The decision itself is `lib/checkout.ts`, which is a pure function of the
 * environment and is where the tests point. This file is HTTP: read the
 * environment, pick a status, redirect a form submission to the page that
 * explains it, answer a programmatic caller in JSON.
 *
 * `POST` rather than `GET` because this is the step that will eventually take
 * money, and a `GET` that a browser can prefetch is the wrong shape for that
 * even while it does nothing. `GET` is answered with 405 and the same honesty,
 * so a hand-typed URL is not a blank page.
 */

import { NextResponse } from "next/server";
import { checkoutState, copyFor, statusFor } from "../../../lib/checkout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const state = checkoutState(process.env);

  // A browser form wants a page it can read; `fetch` wants JSON it can act on.
  // Told apart by what the caller said it accepts, so neither gets the other's
  // answer. A 303 is the right redirect after a POST: it turns the next request
  // into a GET, so a reload does not resubmit.
  const wantsHtml = (request.headers.get("accept") ?? "").includes("text/html");
  if (wantsHtml) {
    return NextResponse.redirect(new URL(`/checkout?state=${state.kind}`, request.url), 303);
  }

  const copy = copyFor(state);
  return NextResponse.json(
    {
      ok: false,
      state: state.kind,
      heading: copy.heading,
      detail: copy.body,
      // Named so a deployer can see exactly which variable to set, without the
      // response ever carrying a value.
      missing: state.kind === "unconfigured" ? state.missing : [],
    },
    { status: statusFor(state) },
  );
}

export async function GET() {
  const state = checkoutState(process.env);
  return NextResponse.json(
    { ok: false, state: state.kind, detail: "Ordering is a POST. Nothing has been charged." },
    { status: 405, headers: { allow: "POST" } },
  );
}
