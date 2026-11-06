/**
 * **Marking an order dispatched, with whatever the captain wrote down.**
 *
 * `markDispatched` does the work and refuses an unpaid order — not because the
 * captain would post a book for nothing on purpose, but because this is the
 * one page where a mis-click costs a book, and the refusal costs a line.
 *
 * Behind `allowedFor()` before it reads the body: a route that parses an
 * attacker's form before deciding whether to listen to them is a route doing
 * work on their behalf.
 */

import { NextResponse } from "next/server";
import { allowedFor, refusalFor } from "../../../../lib/admin/guard";
import { markDispatched, storeFromEnv } from "../../../../lib/orders/store";
import { isReference } from "../../../../lib/orders/record";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const access = allowedFor(request, process.env);
  if (!access.ok) {
    return NextResponse.json({ ok: false, detail: refusalFor(access) }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  const ref = String(form?.get("ref") ?? "");
  const tracking = String(form?.get("tracking") ?? "");
  if (!isReference(ref)) {
    return NextResponse.json({ ok: false, detail: "not an order reference" }, { status: 400 });
  }

  const storeState = storeFromEnv(process.env);
  if (storeState.kind !== "ready") {
    return NextResponse.json({ ok: false, detail: "no order store" }, { status: 503 });
  }

  const result = await markDispatched(storeState.store, ref, tracking, new Date());
  if (!result.ok) return NextResponse.json({ ok: false, detail: result.why }, { status: 409 });

  // Back to the order, as a GET, so a reload does not re-submit.
  return NextResponse.redirect(new URL(`/admin/${ref}`, request.url), 303);
}

export async function GET() {
  return NextResponse.json({ ok: false, detail: "This is a POST." }, { status: 405, headers: { allow: "POST" } });
}
