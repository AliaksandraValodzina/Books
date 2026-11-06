/**
 * **The print-ready PDF for one order, made from the record and nothing else.**
 *
 * This is the proof of the order record's one promise — *it must be enough to
 * re-render the exact print file months later, without the buyer's browser.*
 * There is no browser in this path and no request body: the fill comes out of
 * the store, the photograph's bytes come out of the store, and the renderer is
 * the same one that drew the preview the buyer approved. A reprint in a year
 * is this URL.
 *
 * **It is behind the guard, which is the point of the test that names this
 * file.** A protected list that links to an unprotected file is the usual way
 * a shop leaks its customers: the page is checked, the download is not, and
 * the download is the thing with the child's name and photograph in it. So
 * `allowedFor()` runs before the reference is even parsed, and
 * `test/admin-guard.test.ts` asserts an unauthenticated request to this route
 * gets nothing.
 */

import { NextResponse } from "next/server";
import { toArrayBuffer } from "../../../../../lib/bytes";
import { allowedFor, refusalFor } from "../../../../../lib/admin/guard";
import { photoFor, storeFromEnv } from "../../../../../lib/orders/store";
import { isReference } from "../../../../../lib/orders/record";
import { BookNotPrintable, renderBookPdf } from "../../../../../lib/book/print";
import { FIRST_BOOK } from "../../../../../templates/first-book";

// Native code and the filesystem: this cannot run on the edge.
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
  if (!record) return NextResponse.json({ ok: false, detail: "no such order" }, { status: 404 });

  // The photograph, digest-checked on the way out of the bucket. A wrong
  // object under the right name is the mistake that would otherwise print
  // somebody else's baby — `lib/orders/store.ts` § photoFor.
  const supplied = await photoFor(storeState.store, record);

  try {
    const result = await renderBookPdf(FIRST_BOOK, record.fill, { supplied });
    return new NextResponse(new Blob([toArrayBuffer(result.pdf)]), {
      headers: {
        "content-type": "application/pdf",
        "content-length": String(result.pdf.length),
        // The order's reference in front of the renderer's own name, so a file
        // on a desk and a row in the list are the same word.
        "content-disposition": `attachment; filename="${record.ref}-${result.filename}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof BookNotPrintable) {
      return NextResponse.json({ ok: false, detail: "not printable", problems: error.problems }, { status: 422 });
    }
    throw error;
  }
}
