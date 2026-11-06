/**
 * **The buyer's own photograph, out of a private bucket, for the captain only.**
 *
 * It exists because the order page has to show what was uploaded — a
 * photograph that cannot be looked at is a photograph nobody notices is
 * upside down. It is a route rather than a URL because the object is **not
 * public**: `lib/orders/store.ts` § Photographs are private says why a
 * customer's picture of their own child is not served the way the book's
 * artwork is, and the consequence is that the only way to see it is a signed
 * read on the server, behind the guard.
 *
 * `cache-control: private, no-store`, so no proxy and no browser keeps a copy
 * of somebody's child past the request.
 */

import { NextResponse } from "next/server";
import { toArrayBuffer } from "../../../../../lib/bytes";
import { allowedFor, refusalFor } from "../../../../../lib/admin/guard";
import { photoFor, storeFromEnv } from "../../../../../lib/orders/store";
import { isReference } from "../../../../../lib/orders/record";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, ctx: { params: Promise<{ ref: string }> }) {
  const access = allowedFor(request, process.env);
  if (!access.ok) {
    return NextResponse.json({ ok: false, detail: refusalFor(access) }, { status: 401 });
  }

  const { ref } = await ctx.params;
  if (!isReference(ref)) {
    return NextResponse.json({ ok: false, detail: "not an order reference" }, { status: 400 });
  }

  const storeState = storeFromEnv(process.env);
  if (storeState.kind !== "ready") {
    return NextResponse.json({ ok: false, detail: "no order store" }, { status: 503 });
  }

  const record = await storeState.store.get(ref);
  const asset = record?.fill.photo?.asset;
  if (!record || !asset) {
    return NextResponse.json({ ok: false, detail: "no photograph on that order" }, { status: 404 });
  }

  const supplied = await photoFor(storeState.store, record);
  const bytes = supplied.get(asset.sha256);
  if (!bytes) {
    return NextResponse.json({ ok: false, detail: "the photograph is not in the store" }, { status: 404 });
  }

  return new NextResponse(new Blob([toArrayBuffer(bytes)]), {
    headers: {
      "content-type": asset.mime,
      "content-length": String(bytes.length),
      "cache-control": "private, no-store",
    },
  });
}
